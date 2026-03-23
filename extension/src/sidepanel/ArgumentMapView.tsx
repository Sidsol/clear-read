import { useState } from 'react';
import type { ArgumentMap } from '../shared/types';

interface ArgumentMapViewProps {
  argumentMap: ArgumentMap;
  fallacyColor: string;
}

const PREMISE_ICONS: Record<string, string> = {
  supporting: '✓',
  irrelevant: '✗',
  weak: '⚠',
  unsupported: '?',
};

const PREMISE_LABELS: Record<string, string> = {
  supporting: 'Supporting',
  irrelevant: 'Irrelevant',
  weak: 'Weak',
  unsupported: 'Unsupported',
};

export function ArgumentMapView({ argumentMap, fallacyColor }: ArgumentMapViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!argumentMap.conclusion && !argumentMap.steelman) return null;

  return (
    <div className="cr-argmap">
      <button
        className="cr-argmap-toggle"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      >
        <span className="cr-argmap-toggle-icon">{expanded ? '▾' : '▸'}</span>
        {expanded ? 'Hide' : 'View'} Argument Structure
      </button>

      {expanded && (
        <div className="cr-argmap-content" onClick={(e) => e.stopPropagation()}>
          {/* Conclusion */}
          {argumentMap.conclusion && (
            <div className="cr-argmap-section">
              <div className="cr-argmap-label">Conclusion</div>
              <div className="cr-argmap-conclusion" style={{ borderLeftColor: fallacyColor }}>
                {argumentMap.conclusion}
              </div>
            </div>
          )}

          {/* Premises */}
          {argumentMap.premises.length > 0 && (
            <div className="cr-argmap-section">
              <div className="cr-argmap-label">Premises</div>
              <div className="cr-argmap-connector">▲ supported by?</div>
              {argumentMap.premises.map((premise, i) => (
                <div key={i} className={`cr-argmap-premise cr-argmap-premise--${premise.type}`}>
                  <span className="cr-argmap-premise-icon">
                    {PREMISE_ICONS[premise.type] || '?'}
                  </span>
                  <div className="cr-argmap-premise-body">
                    <div className="cr-argmap-premise-text">{premise.text}</div>
                    {premise.issue && (
                      <div className="cr-argmap-premise-issue">
                        {PREMISE_LABELS[premise.type]}: {premise.issue}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Logical Gaps */}
          {argumentMap.logicalGaps.length > 0 && (
            <div className="cr-argmap-section">
              <div className="cr-argmap-label">⚠ Logical Gaps</div>
              {argumentMap.logicalGaps.map((gap, i) => (
                <div key={i} className="cr-argmap-gap">{gap}</div>
              ))}
            </div>
          )}

          {/* Missing Evidence */}
          {argumentMap.missingEvidence.length > 0 && (
            <div className="cr-argmap-section">
              <div className="cr-argmap-label">Missing Evidence</div>
              {argumentMap.missingEvidence.map((item, i) => (
                <div key={i} className="cr-argmap-missing">• {item}</div>
              ))}
            </div>
          )}

          {/* Steelman */}
          {argumentMap.steelman && (
            <div className="cr-argmap-section">
              <div className="cr-argmap-label">💡 Stronger Version (Steelman)</div>
              <div className="cr-argmap-steelman">
                "{argumentMap.steelman}"
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
