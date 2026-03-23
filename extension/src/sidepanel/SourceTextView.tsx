import type { AnalysisResult } from '../shared/types';

interface SourceTextViewProps {
  result: AnalysisResult;
}

export function SourceTextView({ result }: SourceTextViewProps) {
  const text = result.analyzedText ?? '(Text not available)';
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const estimatedTokens = Math.ceil(charCount / 4);

  return (
    <div className="cr-source">
      <div className="cr-source-stats">
        <span>{wordCount.toLocaleString()} words</span>
        <span>{charCount.toLocaleString()} chars</span>
        <span>~{estimatedTokens.toLocaleString()} tokens</span>
      </div>
      <div className="cr-source-text">{text}</div>
    </div>
  );
}
