import { useEffect, useState, useRef } from 'react';
import type { AnalysisResult } from '../shared/types';
import type { ExtensionMessage } from '../shared/messaging';
import { AnalysisView } from './AnalysisView';
import { EmptyState, LoadingState, ErrorState } from './EmptyState';
import { SourceTextView } from './SourceTextView';
import { ModelSelector } from './ModelSelector';
import { sendMessage } from '../shared/messaging';
import './sidepanel.css';

export function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineMode, setEngineMode] = useState<string>('local');
  const [activeTab, setActiveTab] = useState<'analysis' | 'source' | 'models'>('analysis');
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLoadingTimeout() {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }

  function handleResultReceived(analysisResult: AnalysisResult) {
    setResult(analysisResult);
    setLoading(false);
    setError(null);
    clearLoadingTimeout();
    // Clear any stale error from storage
    chrome.storage.session.set({ latestError: null }).catch(() => {});
  }

  function handleErrorReceived(errorMessage: string) {
    setLoading(false);
    setError(errorMessage);
    clearLoadingTimeout();
    chrome.storage.session.set({ analysisLoading: false }).catch(() => {});
  }

  function startSafetyTimeout() {
    clearLoadingTimeout();
    loadingTimerRef.current = setTimeout(() => {
      chrome.storage.session.get(['latestError', 'latestAnalysis', 'analysisLoading']).then((data) => {
        if (data.latestAnalysis && !data.analysisLoading) {
          handleResultReceived(data.latestAnalysis);
        } else if (data.latestError) {
          handleErrorReceived(data.latestError);
        } else {
          handleErrorReceived('Analysis timed out. The LLM may have encountered an error. Please try again.');
          chrome.storage.session.set({ analysisLoading: false }).catch(() => {});
        }
      });
    }, 180_000);
  }

  useEffect(() => {
    // Load any existing result, error, or loading state from storage on mount
    chrome.storage.session.get(['latestAnalysis', 'latestError', 'analysisLoading']).then((data) => {
      if (data.analysisLoading) {
        setLoading(true);
        // Start a safety timeout since we don't know how long it's been loading
        startSafetyTimeout();
      } else if (data.latestError) {
        setError(data.latestError);
      } else if (data.latestAnalysis) {
        setResult(data.latestAnalysis);
      }
    });

    // React to storage changes (result may arrive after panel opens)
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.latestAnalysis?.newValue) {
        handleResultReceived(changes.latestAnalysis.newValue);
      }
      if (changes.latestError?.newValue) {
        handleErrorReceived(changes.latestError.newValue);
      }
      if (changes.analysisLoading?.newValue === true) {
        setLoading(true);
        setError(null);
        setResult(null);
      }
    };
    chrome.storage.session.onChanged.addListener(storageListener);

    // Also listen for direct broadcasts
    const messageListener = (message: ExtensionMessage) => {
      if (message.type === 'ANALYSIS_RESULT') {
        handleResultReceived(message.payload);
      }
      if (message.type === 'ANALYSIS_PARTIAL') {
        // Update with partial results while still loading
        setResult(prev => ({
          segments: message.payload.segments,
          overallAssessment: message.payload.overallAssessment,
          timestamp: Date.now(),
          source: 'remote',
          analyzedText: prev?.analyzedText,
        }));
        // Keep loading state — we're still streaming
      }
      if (message.type === 'ANALYSIS_ERROR') {
        handleErrorReceived(message.payload.error);
      }
      if (message.type === 'ANALYZE_SELECTION' || message.type === 'ANALYZE_FULL_PAGE') {
        setLoading(true);
        setError(null);
        setResult(null);
        // Track which engine is being used
        const override = (message as any).payload?.engineOverride;
        if (override) setEngineMode(override);
        else {
          chrome.storage.local.get('clearread_settings').then((data) => {
            setEngineMode(data.clearread_settings?.inferenceMode ?? 'local');
          });
        }
        startSafetyTimeout();
      }
      if (message.type === 'SCROLL_TO_FALLACY') {
        // Scroll to matching fallacy card in the side panel
        setTimeout(() => {
          const cards = document.querySelectorAll('[data-segment-text]');
          const searchText = message.payload.text.toLowerCase();
          for (const card of cards) {
            const cardText = (card.getAttribute('data-segment-text') ?? '').toLowerCase();
            if (cardText.includes(searchText) || searchText.includes(cardText)) {
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Flash the card
              card.classList.add('cr-fallacy-card--flash');
              setTimeout(() => card.classList.remove('cr-fallacy-card--flash'), 1500);
              break;
            }
          }
        }, 100);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.storage.session.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(messageListener);
      clearLoadingTimeout();
    };
  }, []);

  return (
    <>
      <div className="cr-header">
        <div className="cr-header-row">
          <div>
            <div className="cr-header-title">ClearRead</div>
            <div className="cr-header-subtitle">Rhetorical Analysis</div>
          </div>
          <button
            className={`cr-header-models-btn ${activeTab === 'models' ? 'cr-header-models-btn--active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'models' ? 'analysis' : 'models')}
            title="Compare and select models"
          >
            🤖 Models
          </button>
        </div>
        {(result || activeTab === 'models') && !(loading && (!result || result.segments.length === 0)) && activeTab !== 'models' && (
          <div className="cr-tabs">
            <button
              className={`cr-tab ${activeTab === 'analysis' ? 'cr-tab--active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              Analysis
            </button>
            <button
              className={`cr-tab ${activeTab === 'source' ? 'cr-tab--active' : ''}`}
              onClick={() => setActiveTab('source')}
            >
              Source Text
            </button>
          </div>
        )}
      </div>

      {loading && result && result.segments.length > 0 ? (
        <>
          <AnalysisView result={result} />
          <div className="cr-streaming-spacer" />
          <div className="cr-streaming-indicator">
            <div className="cr-streaming-dot" />
            Streaming results...
            <button
              className="cr-streaming-cancel"
              onClick={() => {
                sendMessage({ type: 'CANCEL_ANALYSIS' }).catch(() => {});
                setLoading(false);
                clearLoadingTimeout();
                chrome.storage.session.set({ analysisLoading: false }).catch(() => {});
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : loading ? (
        <LoadingState
          engineMode={engineMode}
          onCancel={() => {
            sendMessage({ type: 'CANCEL_ANALYSIS' }).catch(() => {});
            setLoading(false);
            clearLoadingTimeout();
            chrome.storage.session.set({ analysisLoading: false }).catch(() => {});
          }}
        />
      ) : error ? (
        <ErrorState message={error} onDismiss={() => setError(null)} />
      ) : activeTab === 'models' ? (
        <ModelSelector />
      ) : result ? (
        activeTab === 'analysis' ? (
          <AnalysisView result={result} />
        ) : activeTab === 'models' ? (
          <ModelSelector />
        ) : (
          <SourceTextView result={result} />
        )
      ) : (
        <EmptyState />
      )}
    </>
  );
}
