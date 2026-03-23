import type { FallacyDetection, TokenAttribution } from '../shared/types';
import { FALLACY_DEFINITIONS } from '../shared/constants';
import { ExplainabilityView } from './ExplainabilityView';
import { ArgumentMapView } from './ArgumentMapView';

interface FallacyCardProps {
  segmentText: string;
  fallacy: FallacyDetection;
  highlightTokens?: TokenAttribution[];
  onScrollTo?: () => void;
}

export function FallacyCard({ segmentText, fallacy, highlightTokens, onScrollTo }: FallacyCardProps) {
  const definition = FALLACY_DEFINITIONS[fallacy.type];
  // For 'other' type, use llmLabel as name and gray color
  const displayName = fallacy.type === 'other' && fallacy.llmLabel
    ? fallacy.llmLabel
    : (definition?.name ?? fallacy.type);
  const color = definition?.color ?? '#9e9e9e';

  const confidenceLevel = fallacy.confidence >= 0.8 ? 'high'
    : fallacy.confidence >= 0.4 ? 'moderate'
    : 'low';
  const confidenceLabel = fallacy.confidence >= 0.8 ? 'High'
    : fallacy.confidence >= 0.4 ? 'Moderate'
    : 'Low';

  return (
    <div
      className="cr-fallacy-card"
      data-segment-text={segmentText}
      onClick={onScrollTo}
      title="Click to scroll to this text on the page"
    >
      <div className="cr-fallacy-card-header">
        <span className="cr-fallacy-name">
          <span className="cr-fallacy-dot" style={{ backgroundColor: color }} />
          {displayName}
        </span>
        <span className={`cr-fallacy-confidence cr-fallacy-confidence--${confidenceLevel}`}>
          {confidenceLabel}
        </span>
      </div>

      <div className="cr-fallacy-segment-text" style={{ borderLeftColor: color }}>
        "{segmentText.length > 200 ? segmentText.slice(0, 200) + '…' : segmentText}"
      </div>

      <div className="cr-fallacy-explanation">
        {fallacy.explanation}
      </div>

      {highlightTokens && highlightTokens.length > 0 && (
        <ExplainabilityView tokens={highlightTokens} fallacy={fallacy} />
      )}

      {fallacy.argumentMap && (
        <ArgumentMapView argumentMap={fallacy.argumentMap} fallacyColor={color} />
      )}

      {onScrollTo && (
        <div className="cr-fallacy-scroll-hint">
          ↗ Click to find on page
        </div>
      )}
    </div>
  );
}
