import type { AnalysisResult, FallacyType } from '../shared/types';
import { FALLACY_DEFINITIONS } from '../shared/constants';

interface SummaryBarProps {
  result: AnalysisResult;
}

export function SummaryBar({ result }: SummaryBarProps) {
  const totalSegments = result.segments.length;
  const fallacySegments = result.segments.filter(s => s.fallacies.length > 0).length;
  const totalFallacies = result.segments.reduce((sum, s) => sum + s.fallacies.length, 0);

  return (
    <div className="cr-summary">
      <div className="cr-summary-stat">
        <div className="cr-summary-stat-value">{totalSegments}</div>
        <div className="cr-summary-stat-label">Segments</div>
      </div>
      <div className="cr-summary-stat">
        <div className="cr-summary-stat-value">{fallacySegments}</div>
        <div className="cr-summary-stat-label">Flagged</div>
      </div>
      <div className="cr-summary-stat">
        <div className="cr-summary-stat-value">{totalFallacies}</div>
        <div className="cr-summary-stat-label">Detections</div>
      </div>
    </div>
  );
}

interface FallacyBreakdownProps {
  result: AnalysisResult;
}

export function FallacyBreakdown({ result }: FallacyBreakdownProps) {
  // Count occurrences of each fallacy type
  const counts = new Map<FallacyType, number>();
  for (const segment of result.segments) {
    for (const f of segment.fallacies) {
      counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return null;

  const maxCount = Math.max(...counts.values());

  // Sort by count descending
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="cr-breakdown">
      <div className="cr-breakdown-title">Breakdown by Type</div>
      {sorted.map(([type, count]) => {
        const def = FALLACY_DEFINITIONS[type];
        if (!def) return null;
        return (
          <div key={type} className="cr-breakdown-row">
            <span className="cr-breakdown-dot" style={{ backgroundColor: def.color }} />
            <span className="cr-breakdown-label">{def.name}</span>
            <span className="cr-breakdown-count">{count}</span>
            <div className="cr-breakdown-bar">
              <div
                className="cr-breakdown-bar-fill"
                style={{
                  width: `${(count / maxCount) * 100}%`,
                  backgroundColor: def.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
