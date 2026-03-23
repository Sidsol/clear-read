import { useState, useEffect } from 'react';
import { sendMessage } from '../shared/messaging';
import type { ExtensionSettings } from '../shared/messaging';

interface ModelBenchmark {
  id: string;
  provider: ExtensionSettings['remoteProvider'];
  modelKey: string;
  name: string;
  category: 'local' | 'ollama' | 'cloud';
  f1: number;
  precision: number;
  recall: number;
  fpRate: number;
  techAccuracy: number;
  avgLatencyMs: number;
  cost: 'free' | 'free (local)' | 'paid';
}

const MODELS: ModelBenchmark[] = [
  { id: 'local-v2', provider: 'ollama', modelKey: '', name: 'Local Pipeline (V2)', category: 'local', f1: 0.43, precision: 1.0, recall: 0.28, fpRate: 0.0, techAccuracy: 0.60, avgLatencyMs: 39, cost: 'free (local)' },
  { id: 'ollama-phi4', provider: 'ollama', modelKey: 'phi4', name: 'phi4 (Ollama)', category: 'ollama', f1: 0.74, precision: 0.61, recall: 0.94, fpRate: 0.20, techAccuracy: 0.62, avgLatencyMs: 13665, cost: 'free' },
  { id: 'ollama-phi3', provider: 'ollama', modelKey: 'phi3', name: 'phi3 (Ollama)', category: 'ollama', f1: 0.49, precision: 0.60, recall: 0.42, fpRate: 0.20, techAccuracy: 0.40, avgLatencyMs: 4243, cost: 'free' },
  { id: 'ollama-phi4-mini', provider: 'ollama', modelKey: 'phi4-mini', name: 'phi4-mini (Ollama)', category: 'ollama', f1: 0.50, precision: 0.38, recall: 0.72, fpRate: 0.40, techAccuracy: 0.54, avgLatencyMs: 16569, cost: 'free' },
  { id: 'ollama-llama31', provider: 'ollama', modelKey: 'llama3.1:8b', name: 'llama3.1:8b (Ollama)', category: 'ollama', f1: 0.53, precision: 0.38, recall: 0.83, fpRate: 0.80, techAccuracy: 0.40, avgLatencyMs: 12387, cost: 'free' },
  { id: 'gemini-25-flash', provider: 'gemini', modelKey: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'cloud', f1: 0.77, precision: 0.64, recall: 0.97, fpRate: 0.30, techAccuracy: 0.69, avgLatencyMs: 5541, cost: 'paid' },
  { id: 'gemini-25-pro', provider: 'gemini', modelKey: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', category: 'cloud', f1: 0.74, precision: 0.62, recall: 0.92, fpRate: 0.10, techAccuracy: 0.73, avgLatencyMs: 12296, cost: 'paid' },
  { id: 'gemini-31-flash-lite', provider: 'gemini', modelKey: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', category: 'cloud', f1: 0.70, precision: 0.60, recall: 0.83, fpRate: 0.10, techAccuracy: 0.80, avgLatencyMs: 1832, cost: 'paid' },
  { id: 'gemini-31-pro', provider: 'gemini', modelKey: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', category: 'cloud', f1: 0.74, precision: 0.61, recall: 0.94, fpRate: 0.0, techAccuracy: 0.79, avgLatencyMs: 11780, cost: 'paid' },
  { id: 'gemini-3-flash', provider: 'gemini', modelKey: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', category: 'cloud', f1: 0.64, precision: 0.48, recall: 0.94, fpRate: 0.0, techAccuracy: 0.76, avgLatencyMs: 6156, cost: 'paid' },
  { id: 'openai-54-mini', provider: 'openai', modelKey: 'gpt-5.4-mini-2026-03-17', name: 'GPT-5.4 Mini', category: 'cloud', f1: 0.61, precision: 0.46, recall: 0.89, fpRate: 0.10, techAccuracy: 0.72, avgLatencyMs: 1641, cost: 'paid' },
  { id: 'openai-54-nano', provider: 'openai', modelKey: 'gpt-5.4-nano-2026-03-17', name: 'GPT-5.4 Nano', category: 'cloud', f1: 0.56, precision: 0.39, recall: 0.97, fpRate: 0.30, techAccuracy: 0.60, avgLatencyMs: 2280, cost: 'paid' },
  { id: 'openai-54', provider: 'openai', modelKey: 'gpt-5.4-2026-03-05', name: 'GPT-5.4', category: 'cloud', f1: 0.54, precision: 0.37, recall: 1.0, fpRate: 0.10, techAccuracy: 0.75, avgLatencyMs: 4932, cost: 'paid' },
  { id: 'claude-haiku', provider: 'anthropic', modelKey: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', category: 'cloud', f1: 0.64, precision: 0.47, recall: 0.97, fpRate: 0.10, techAccuracy: 0.60, avgLatencyMs: 4249, cost: 'paid' },
  { id: 'claude-sonnet', provider: 'anthropic', modelKey: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', category: 'cloud', f1: 0.53, precision: 0.37, recall: 0.97, fpRate: 0.10, techAccuracy: 0.71, avgLatencyMs: 10315, cost: 'paid' },
  { id: 'claude-opus', provider: 'anthropic', modelKey: 'claude-opus-4-6', name: 'Claude Opus 4.6', category: 'cloud', f1: 0.49, precision: 0.33, recall: 0.94, fpRate: 0.10, techAccuracy: 0.71, avgLatencyMs: 11487, cost: 'paid' },
];

function formatLatency(ms: number): string {
  if (ms < 100) return '<0.1s';
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getF1Color(f1: number): string {
  if (f1 >= 0.75) return '#22c55e';
  if (f1 >= 0.60) return '#f59e0b';
  if (f1 >= 0.50) return '#fb923c';
  return '#ef4444';
}

function getRankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

type SortKey = 'f1' | 'precision' | 'recall' | 'avgLatencyMs' | 'techAccuracy';

export function ModelSelector() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('f1');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    sendMessage({ type: 'GET_SETTINGS' }).then((s) => {
      const st = s as ExtensionSettings;
      setSettings(st);
      // Find the currently active model
      if (st.inferenceMode === 'local') {
        setSelectedId('local-v2');
      } else {
        const match = MODELS.find(m =>
          m.provider === st.remoteProvider &&
          (m.modelKey === st.ollamaModel || m.modelKey === st.remoteModel)
        );
        if (match) setSelectedId(match.id);
      }
    });
  }, []);

  const sorted = [...MODELS].sort((a, b) => {
    if (sortBy === 'avgLatencyMs') return a[sortBy] - b[sortBy]; // lower is better
    return b[sortBy] - a[sortBy]; // higher is better
  });

  const f1Sorted = [...MODELS].sort((a, b) => b.f1 - a.f1);

  async function selectModel(model: ModelBenchmark) {
    if (model.id === 'local-v2') {
      await sendMessage({ type: 'UPDATE_SETTINGS', payload: { inferenceMode: 'local' } });
    } else {
      const patch: Partial<ExtensionSettings> = {
        inferenceMode: 'remote',
        remoteProvider: model.provider,
      };
      if (model.provider === 'ollama') {
        patch.ollamaModel = model.modelKey;
      } else {
        patch.remoteModel = model.modelKey;
      }
      await sendMessage({ type: 'UPDATE_SETTINGS', payload: patch });
    }
    setSelectedId(model.id);
    setStatusMsg(`✓ Switched to ${model.name}`);
    setTimeout(() => setStatusMsg(''), 3000);
    // Refresh settings
    const s = await sendMessage({ type: 'GET_SETTINGS' });
    setSettings(s as ExtensionSettings);
  }

  return (
    <div className="cr-models">
      <div className="cr-models-header">
        <div className="cr-models-title">Model Comparison</div>
        <div className="cr-models-subtitle">
          Based on 35-passage evaluation benchmark. Click a model to use it.
        </div>
      </div>

      <div className="cr-models-legend">
        <div><strong>F1</strong> — Overall accuracy (precision × recall balance)</div>
        <div><strong>Precision</strong> — When it flags something, is it right?</div>
        <div><strong>Recall</strong> — Does it catch all the fallacies?</div>
        <div><strong>Accuracy</strong> — Does it name the right technique?</div>
        <div><strong>FP</strong> — How often clean text gets incorrectly flagged</div>
      </div>

      <div className="cr-models-sort">
        Sort by:
        {(['f1', 'precision', 'recall', 'techAccuracy', 'avgLatencyMs'] as SortKey[]).map(key => (
          <button
            key={key}
            className={`cr-models-sort-btn ${sortBy === key ? 'cr-models-sort-btn--active' : ''}`}
            onClick={() => setSortBy(key)}
          >
            {key === 'f1' ? 'F1' : key === 'precision' ? 'Precision' : key === 'recall' ? 'Recall' : key === 'techAccuracy' ? 'Accuracy' : 'Speed'}
          </button>
        ))}
      </div>

      {statusMsg && <div className="cr-models-status">{statusMsg}</div>}

      <div className="cr-models-list">
        {sorted.map((model) => {
          const rank = f1Sorted.findIndex(m => m.id === model.id) + 1;
          const isActive = selectedId === model.id;
          return (
            <button
              key={model.id}
              className={`cr-model-card ${isActive ? 'cr-model-card--active' : ''}`}
              onClick={() => selectModel(model)}
            >
              <div className="cr-model-card-top">
                <span className="cr-model-card-rank">{getRankBadge(rank)}</span>
                <span className="cr-model-card-name">{model.name}</span>
                {isActive && <span className="cr-model-card-active-badge">Active</span>}
              </div>

              <div className="cr-model-card-metrics">
                <div className="cr-model-metric">
                  <div className="cr-model-metric-bar" style={{ width: `${model.f1 * 100}%`, backgroundColor: getF1Color(model.f1) }} />
                  <span className="cr-model-metric-label">F1</span>
                  <span className="cr-model-metric-value">{(model.f1 * 100).toFixed(0)}%</span>
                </div>
                <div className="cr-model-metric">
                  <div className="cr-model-metric-bar" style={{ width: `${model.precision * 100}%`, backgroundColor: '#4F8FF7' }} />
                  <span className="cr-model-metric-label">Precision</span>
                  <span className="cr-model-metric-value">{(model.precision * 100).toFixed(0)}%</span>
                </div>
                <div className="cr-model-metric">
                  <div className="cr-model-metric-bar" style={{ width: `${model.recall * 100}%`, backgroundColor: '#54D48C' }} />
                  <span className="cr-model-metric-label">Recall</span>
                  <span className="cr-model-metric-value">{(model.recall * 100).toFixed(0)}%</span>
                </div>
                <div className="cr-model-metric">
                  <div className="cr-model-metric-bar" style={{ width: `${model.techAccuracy * 100}%`, backgroundColor: '#B07AFF' }} />
                  <span className="cr-model-metric-label">Accuracy</span>
                  <span className="cr-model-metric-value">{(model.techAccuracy * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="cr-model-card-footer">
                <span className="cr-model-card-latency">⚡ {formatLatency(model.avgLatencyMs)}</span>
                <span className="cr-model-card-fp">FP: {(model.fpRate * 100).toFixed(0)}%</span>
                <span className={`cr-model-card-cost cr-model-card-cost--${model.cost === 'paid' ? 'paid' : 'free'}`}>
                  {model.cost}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
