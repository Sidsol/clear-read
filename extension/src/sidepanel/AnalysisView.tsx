import type { AnalysisResult } from '../shared/types';
import type { ScrollToHighlightMessage } from '../shared/messaging';
import { FallacyCard } from './FallacyCard';
import { SummaryBar, FallacyBreakdown } from './SummaryBar';

interface AnalysisViewProps {
  result: AnalysisResult;
}

export function AnalysisView({ result }: AnalysisViewProps) {
  const fallacySegments = result.segments.filter(s => s.fallacies.length > 0);
  const totalFallacies = result.segments.reduce((sum, s) => sum + s.fallacies.length, 0);

  async function scrollToSegment(segmentText: string) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const msg: ScrollToHighlightMessage = {
          type: 'SCROLL_TO_HIGHLIGHT',
          payload: { text: segmentText },
        };
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    } catch {
      // Tab may not be available
    }
  }

  return (
    <>
      <SummaryBar result={result} />

      <div className="cr-assessment">
        <span className="cr-assessment-icon">💡</span>
        {result.overallAssessment}
      </div>

      <FallacyBreakdown result={result} />

      <div className="cr-segments">
        {totalFallacies > 0 ? (
          <>
            <div className="cr-segments-title">
              Detected Techniques ({totalFallacies})
            </div>
            {fallacySegments.map((segment, i) =>
              segment.fallacies.map((fallacy, j) => (
                <FallacyCard
                  key={`${i}-${j}`}
                  segmentText={segment.text}
                  fallacy={fallacy}
                  highlightTokens={segment.highlightTokens}
                  onScrollTo={() => scrollToSegment(segment.text)}
                />
              ))
            )}
          </>
        ) : (
          <div className="cr-no-fallacies">
            ✅ No rhetorical concerns detected. As always, consider consulting
            multiple sources for important claims.
          </div>
        )}
      </div>

      <div className="cr-footer">
        {result.source === 'local' ? '🔒 Local inference' : '☁️ Remote inference'}
        {result.tokenUsage ? ` · ~${result.tokenUsage.prompt + result.tokenUsage.completion} tokens` : ''}
        {' · '}
        {new Date(result.timestamp).toLocaleTimeString()}
      </div>
    </>
  );
}
