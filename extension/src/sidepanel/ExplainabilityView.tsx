import type { TokenAttribution, FallacyDetection } from '../shared/types';
import { FALLACY_DEFINITIONS } from '../shared/constants';

interface ExplainabilityViewProps {
  tokens: TokenAttribution[];
  fallacy: FallacyDetection;
}

/**
 * Renders a token-level attribution visualization.
 * Each word is displayed with background intensity proportional
 * to how much it contributed to the fallacy detection.
 */
export function ExplainabilityView({ tokens, fallacy }: ExplainabilityViewProps) {
  const definition = FALLACY_DEFINITIONS[fallacy.type];
  if (!definition) return null;

  const color = definition.color;

  return (
    <div className="cr-explain">
      <div className="cr-explain-header">
        <span className="cr-explain-label">Key trigger words</span>
        <span className="cr-explain-legend">
          <span className="cr-explain-legend-low" />
          Low
          <span className="cr-explain-legend-high" style={{ backgroundColor: color }} />
          High influence
        </span>
      </div>
      <div className="cr-explain-tokens">
        {tokens.map((tok, i) => (
          <span
            key={i}
            className="cr-explain-token"
            style={{
              backgroundColor: tok.score > 0.1
                ? hexToRgba(color, 0.1 + tok.score * 0.5)
                : 'transparent',
              borderBottom: tok.score > 0.3
                ? `2px solid ${hexToRgba(color, 0.6 + tok.score * 0.4)}`
                : 'none',
              fontWeight: tok.score > 0.5 ? 600 : 400,
            }}
            title={`Attribution: ${Math.round(tok.score * 100)}%`}
          >
            {i > 0 ? ' ' : ''}{tok.token}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Convert hex color + alpha to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
