import { useState, useEffect } from 'react';
import { sendMessage } from '../shared/messaging';
import type { ExtensionSettings } from '../shared/messaging';

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.1:8b',
  openai: 'gpt-5.4-nano-2026-03-17',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  chrome_ai: 'Built-in (Gemini Nano / Phi Silica)',
};

export function Popup() {
  const [status, setStatus] = useState<string>('Ready');
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEngineMenu, setShowEngineMenu] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    sendMessage({ type: 'GET_SETTINGS' }).then((s) => {
      setSettings(s as ExtensionSettings);
    });
  }, []);

  const updateSetting = async (patch: Partial<ExtensionSettings>) => {
    const result = await sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: patch,
    }) as ExtensionSettings;
    setSettings(result);
  };

  const handleAnalyzeFullPage = async (engineOverride?: 'local' | 'remote') => {
    setStatus('Analyzing...');
    setShowEngineMenu(false);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setStatus('No active tab found'); return; }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Smart article text extraction — tries multiple strategies

          // Strategy 1: Schema.org JSON-LD articleBody
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            try {
              const data = JSON.parse(script.textContent ?? '');
              const items = Array.isArray(data) ? data : [data];
              for (const item of items) {
                if (item.articleBody && typeof item.articleBody === 'string' && item.articleBody.length > 100) {
                  return item.articleBody;
                }
                // Check @graph array (common in WordPress)
                if (Array.isArray(item['@graph'])) {
                  for (const node of item['@graph']) {
                    if (node.articleBody && typeof node.articleBody === 'string' && node.articleBody.length > 100) {
                      return node.articleBody;
                    }
                  }
                }
              }
            } catch { /* invalid JSON, skip */ }
          }

          // Strategy 2: Semantic article containers
          const selectors = [
            'article .entry-content',
            'article .post-content',
            'article .article-body',
            'article .story-body',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.story-body',
            '[itemprop="articleBody"]',
            'article',
            '[role="main"] article',
            'main article',
            '[role="main"]',
            'main',
          ];
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              const text = (el as HTMLElement).innerText?.trim();
              if (text && text.length > 200) {
                return text;
              }
            }
          }

          // Strategy 3: Largest text-dense block
          const candidates = document.querySelectorAll('div, section');
          let bestEl: Element | null = null;
          let bestScore = 0;
          for (const el of candidates) {
            const text = (el as HTMLElement).innerText ?? '';
            const textLen = text.trim().length;
            const childTags = el.querySelectorAll('*').length || 1;
            // Text density = characters per tag (higher = more text-heavy, less nav/chrome)
            const density = textLen / childTags;
            // Prefer elements with substantial text and high density
            const score = textLen > 300 ? density * Math.log(textLen) : 0;
            if (score > bestScore) {
              bestScore = score;
              bestEl = el;
            }
          }
          if (bestEl) {
            const text = (bestEl as HTMLElement).innerText?.trim();
            if (text && text.length > 200) {
              return text;
            }
          }

          // Strategy 4: Fallback to full body
          return document.body.innerText;
        },
      });
      const pageText = results[0]?.result;
      if (!pageText) { setStatus('Could not extract page text'); return; }

      await chrome.sidePanel.open({ tabId: tab.id });
      await sendMessage({
        type: 'ANALYZE_FULL_PAGE',
        payload: { text: pageText, url: tab.url ?? '', engineOverride },
      });

      if (engineOverride) {
        await updateSetting({ inferenceMode: engineOverride });
      }

      setStatus('Analysis complete — see side panel');
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    }
  };

  const handleTestConnection = async () => {
    if (!settings) return;
    setTestResult('Testing...');
    try {
      if (settings.remoteProvider === 'ollama') {
        const resp = await fetch(`${settings.ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const models = data.models?.map((m: { name: string }) => m.name) ?? [];

          // Auto-detect optimal context size from model info
          let autoContext = '';
          try {
            const showResp = await fetch(`${settings.ollamaUrl}/api/show`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: settings.ollamaModel || 'llama3.1:8b' }),
              signal: AbortSignal.timeout(5000),
            });
            if (showResp.ok) {
              const showData = await showResp.json();
              // Extract parameter count and model details
              const params = showData.details?.parameter_size ?? '';
              const family = showData.details?.family ?? '';
              const quant = showData.details?.quantization_level ?? '';

              // Estimate safe context based on model size and available memory
              const deviceMem = (navigator as any).deviceMemory ?? 8; // GB, defaults to 8
              const paramBillions = parseFloat(params) || 8;
              const modelMemGB = paramBillions * (quant.includes('Q4') ? 0.6 : quant.includes('Q8') ? 1.0 : 0.8);
              const availableForCtx = Math.max(1, deviceMem * 0.7 - modelMemGB); // 70% of RAM minus model
              // KV cache: ~0.5MB per 1K context tokens for typical 8B model
              const kvMBPerKTokens = paramBillions * 0.06;
              const safeCtx = Math.floor((availableForCtx * 1024) / kvMBPerKTokens) * 1024;
              const optimalCtx = Math.max(4096, Math.min(safeCtx, 131072));

              // Auto-set the context size
              await updateSetting({ ollamaContextSize: optimalCtx });
              autoContext = ` · Auto-set context: ${optimalCtx.toLocaleString()} tokens (${params} ${quant}, ~${deviceMem}GB RAM)`;
            }
          } catch { /* model info query failed, keep existing context size */ }

          setTestResult(`Connected! Models: ${models.slice(0, 5).join(', ') || 'none found'}${autoContext}`);
        } else {
          setTestResult(`Failed: ${resp.status} ${resp.statusText}`);
        }
      } else if (settings.remoteProvider === 'chrome_ai') {
        // Test browser built-in AI availability via background script
        const result = await sendMessage({ type: 'TEST_CHROME_AI' }) as any;
        if (result?.available) {
          setTestResult('Built-in AI is available ✓ (on-device, no API key needed)');
        } else {
          const reason = result?.reason || 'In Chrome: enable "Prompt API for Gemini Nano" AND "Optimization Guide On Device Model" in chrome://flags. In Edge: enable Prompt API in edge://flags. Restart browser after enabling.';
          setTestResult(`Built-in AI not ready: ${reason}`);
        }
      } else {
        setTestResult(settings.apiKey ? 'API key configured ✓' : 'No API key set');
      }
    } catch (err) {
      setTestResult(`Connection failed: ${String(err)}`);
    }
  };

  if (!settings) return <div style={s.container}><p>Loading...</p></div>;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h1 style={s.title}>ClearRead</h1>
        <p style={s.subtitle}>Rhetorical Analysis</p>
      </div>

      <div style={s.statusBar}>
        <span style={{
          ...s.dot,
          backgroundColor: settings.inferenceMode === 'remote' ? '#3b82f6' : '#22c55e',
        }} />
        <span style={s.statusText}>
          {status} · {settings.inferenceMode === 'local' ? 'Local Model' : `LLM (${settings.remoteProvider})`}
        </span>
      </div>

      {/* Split button for full-page analysis */}
      <div style={s.splitRow}>
        <button onClick={() => handleAnalyzeFullPage()} style={s.splitMain}>
          Analyze Full Page
        </button>
        <button
          onClick={() => setShowEngineMenu(!showEngineMenu)}
          style={s.splitChevron}
        >
          ▾
        </button>
      </div>
      {showEngineMenu && (
        <div style={s.engineMenu}>
          <button style={s.engineOption} onClick={() => handleAnalyzeFullPage('local')}>
            🧠 Use Local Model
          </button>
          <button style={s.engineOption} onClick={() => handleAnalyzeFullPage('remote')}>
            🤖 Use LLM
          </button>
        </div>
      )}

      <p style={s.hint}>
        Or highlight text on any page and click <strong>"Analyze with ClearRead"</strong>
      </p>

      {/* Settings toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={s.settingsToggle}
      >
        ⚙️ {showSettings ? 'Hide Settings' : 'Settings'}
      </button>

      {showSettings && (
        <div style={s.settingsPanel}>
          {/* Confidence threshold — only applies to local model */}
          {settings.inferenceMode === 'local' && (
            <>
              <label style={s.label}>
                Confidence Threshold: {Math.round(settings.confidenceThreshold * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(settings.confidenceThreshold * 100)}
                onChange={(e) => updateSetting({ confidenceThreshold: parseInt(e.target.value) / 100 })}
                style={s.slider}
              />
              <div style={s.sliderLabels}>
                <span>Show all</span>
                <span>High only</span>
              </div>
            </>
          )}

          {/* Default engine */}
          <label style={{ ...s.label, marginTop: 16 }}>Default Engine</label>
          <div style={s.toggleRow}>
            <button
              style={settings.inferenceMode === 'local' ? s.toggleActive : s.toggleInactive}
              onClick={() => updateSetting({ inferenceMode: 'local' })}
            >
              🧠 Local
            </button>
            <button
              style={settings.inferenceMode === 'remote' ? s.toggleActive : s.toggleInactive}
              onClick={() => updateSetting({ inferenceMode: 'remote' })}
            >
              🤖 LLM
            </button>
          </div>

          {settings.inferenceMode === 'remote' && (
            <>
              {/* Provider */}
              <label style={s.label}>Provider</label>
              <select
                style={s.select}
                value={settings.remoteProvider}
                onChange={(e) => {
                  const provider = e.target.value as ExtensionSettings['remoteProvider'];
                  updateSetting({
                    remoteProvider: provider,
                    remoteModel: DEFAULT_MODELS[provider] ?? '',
                  });
                }}
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="chrome_ai">Built-in AI (Chrome / Edge)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
              </select>

              {/* Ollama-specific settings */}
              {settings.remoteProvider === 'ollama' && (
                <>
                  <label style={s.label}>Ollama URL</label>
                  <input
                    style={s.input}
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => updateSetting({ ollamaUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                  <label style={s.label}>Model</label>
                  <select
                    style={s.select}
                    value={settings.ollamaModel}
                    onChange={(e) => updateSetting({ ollamaModel: e.target.value })}
                  >
                    <option value="llama3.1:8b">llama3.1:8b</option>
                    <option value="phi3">phi3</option>
                    <option value="phi4-mini">phi4-mini</option>
                    <option value="phi4">phi4</option>
                  </select>
                  <label style={s.label}>
                    Context Size: {settings.ollamaContextSize.toLocaleString()} tokens
                    <span style={{ fontWeight: 400, textTransform: 'none' as const }}> (auto-set on Test Connection)</span>
                  </label>
                  <input
                    type="range"
                    min="2048"
                    max="131072"
                    step="1024"
                    value={settings.ollamaContextSize}
                    onChange={(e) => updateSetting({ ollamaContextSize: parseInt(e.target.value) })}
                    style={s.slider}
                  />
                  <div style={s.sliderLabels}>
                    <span>2K</span>
                    <span>128K</span>
                  </div>
                </>
              )}

              {/* Cloud provider settings */}
              {settings.remoteProvider !== 'ollama' && settings.remoteProvider !== 'chrome_ai' && (
                <>
                  <label style={s.label}>API Key</label>
                  <input
                    style={s.input}
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => updateSetting({ apiKey: e.target.value })}
                    placeholder="Enter your API key"
                  />
                  <label style={s.label}>Model</label>
                  {settings.remoteProvider === 'openai' ? (
                    <select
                      style={s.select}
                      value={settings.remoteModel || DEFAULT_MODELS['openai']}
                      onChange={(e) => updateSetting({ remoteModel: e.target.value })}
                    >
                      <option value="gpt-5.4-nano-2026-03-17">gpt-5.4-nano-2026-03-17</option>
                      <option value="gpt-5.4-mini-2026-03-17">gpt-5.4-mini-2026-03-17</option>
                      <option value="gpt-5.4-2026-03-05">gpt-5.4-2026-03-05</option>
                      <option value="gpt-5-2025-08-07">gpt-5-2025-08-07</option>
                      <option value="gpt-5-mini-2025-08-07">gpt-5-mini-2025-08-07</option>
                      <option value="gpt-5-nano-2025-08-07">gpt-5-nano-2025-08-07</option>
                    </select>
                  ) : settings.remoteProvider === 'gemini' ? (
                    <select
                      style={s.select}
                      value={settings.remoteModel || DEFAULT_MODELS['gemini']}
                      onChange={(e) => updateSetting({ remoteModel: e.target.value })}
                    >
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                      <option value="gemini-3.1-flash-lite-preview">gemini-3.1-flash-lite-preview</option>
                      <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                      <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                    </select>
                  ) : settings.remoteProvider === 'anthropic' ? (
                    <select
                      style={s.select}
                      value={settings.remoteModel || DEFAULT_MODELS['anthropic']}
                      onChange={(e) => updateSetting({ remoteModel: e.target.value })}
                    >
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                      <option value="claude-opus-4-6">claude-opus-4-6</option>
                    </select>
                  ) : (
                    <input
                      style={s.input}
                      type="text"
                      value={settings.remoteModel}
                      onChange={(e) => updateSetting({ remoteModel: e.target.value })}
                      placeholder={DEFAULT_MODELS[settings.remoteProvider] ?? ''}
                    />
                  )}
                </>
              )}

              {/* Test connection */}
              <button style={s.testBtn} onClick={handleTestConnection}>
                Test Connection
              </button>
              {testResult && <p style={s.testResult}>{testResult}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    width: 320,
    padding: 20,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: '#1e293b',
  },
  header: { marginBottom: 16 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#2563eb' },
  subtitle: { margin: '2px 0 0', fontSize: 12, color: '#64748b' },
  statusBar: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
    padding: '8px 12px', borderRadius: 8, backgroundColor: '#f1f5f9', fontSize: 13,
  },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  statusText: { color: '#475569' },
  splitRow: {
    display: 'flex', marginBottom: 4, borderRadius: 8, overflow: 'hidden',
  },
  splitMain: {
    flex: 1, padding: '10px 16px', border: 'none',
    backgroundColor: '#2563eb', color: '#fff', fontSize: 14,
    fontWeight: 600, cursor: 'pointer',
  },
  splitChevron: {
    width: 36, padding: 0, border: 'none',
    borderLeft: '1px solid rgba(255,255,255,0.3)',
    backgroundColor: '#2563eb', color: '#fff', fontSize: 14,
    cursor: 'pointer',
  },
  engineMenu: {
    marginBottom: 8, borderRadius: 8, overflow: 'hidden',
    border: '1px solid #e2e8f0', backgroundColor: '#fff',
  },
  engineOption: {
    width: '100%', padding: '8px 14px', border: 'none',
    borderBottom: '1px solid #f1f5f9', backgroundColor: '#fff',
    color: '#1e293b', fontSize: 13, cursor: 'pointer', textAlign: 'left' as const,
  },
  hint: { margin: '8px 0 12px', fontSize: 12, color: '#94a3b8', lineHeight: 1.4 },
  settingsToggle: {
    width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
    borderRadius: 8, backgroundColor: '#f8fafc', color: '#475569',
    fontSize: 13, cursor: 'pointer', marginBottom: 8,
  },
  settingsPanel: {
    padding: 12, borderRadius: 8, border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
    marginBottom: 4, marginTop: 10, textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  toggleRow: { display: 'flex', gap: 4, marginBottom: 4 },
  toggleActive: {
    flex: 1, padding: '6px 10px', border: '2px solid #2563eb',
    borderRadius: 6, backgroundColor: '#eff6ff', color: '#2563eb',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  toggleInactive: {
    flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, backgroundColor: '#fff', color: '#64748b',
    fontSize: 12, cursor: 'pointer',
  },
  select: {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
    backgroundColor: '#fff',
  },
  input: {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
    backgroundColor: '#fff', boxSizing: 'border-box' as const,
  },
  testBtn: {
    width: '100%', marginTop: 10, padding: '6px 12px', border: 'none',
    borderRadius: 6, backgroundColor: '#475569', color: '#fff',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  testResult: {
    marginTop: 6, fontSize: 11, color: '#64748b', lineHeight: 1.4, wordBreak: 'break-all' as const,
  },
  slider: {
    width: '100%', margin: '4px 0', cursor: 'pointer',
    accentColor: '#2563eb',
  },
  sliderLabels: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, color: '#94a3b8', marginBottom: 4,
  },
};
