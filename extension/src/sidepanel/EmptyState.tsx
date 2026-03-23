import { useState, useEffect } from 'react';

export function EmptyState() {
  return (
    <div className="cr-empty">
      <div className="cr-empty-icon">🔍</div>
      <div className="cr-empty-title">No analysis yet</div>
      <div className="cr-empty-hint">
        Highlight text on any webpage and click
        <strong> "Analyze with ClearRead"</strong> to detect rhetorical techniques
        and logical fallacies.
      </div>
      <div className="cr-empty-tips">
        <div className="cr-empty-tip">💡 Use the ▾ chevron to choose between Local Model and LLM</div>
        <div className="cr-empty-tip">📄 Click the extension icon to analyze a full page</div>
        <div className="cr-empty-tip">🔗 Click highlighted text to open this panel</div>
      </div>
    </div>
  );
}

interface LoadingStateProps {
  onCancel?: () => void;
  engineMode?: string;
}

export function LoadingState({ onCancel, engineMode }: LoadingStateProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const engineLabel = engineMode === 'remote' ? 'LLM' : 'Local Model';

  return (
    <div className="cr-loading">
      <div className="cr-loading-spinner" />
      <div className="cr-loading-text">Analyzing text…</div>
      <div className="cr-loading-subtext">
        Using {engineLabel} · {formatElapsed(elapsed)}
      </div>
      {onCancel && (
        <button className="cr-loading-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorState({ message, onDismiss }: ErrorStateProps) {
  return (
    <div className="cr-empty">
      <div className="cr-empty-icon">⚠️</div>
      <div className="cr-empty-title">Analysis Failed</div>
      <div className="cr-empty-hint" style={{ marginBottom: 16 }}>{message}</div>
      <button
        onClick={onDismiss}
        style={{
          padding: '8px 20px',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          backgroundColor: '#f8fafc',
          color: '#475569',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
