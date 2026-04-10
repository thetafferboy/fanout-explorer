import { useState, useRef, useEffect } from 'react';
import {
  Search, Zap, Clock, ExternalLink, ChevronDown, ChevronUp,
  Globe, Eye, EyeOff, Copy, Check, AlertCircle, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source { url: string; title?: string }

interface SearchResult {
  id: string;
  prompt: string;
  model: string;
  fanoutQueries: string[];
  sources: Source[];
  responseText: string;
  searchCount: number;
  createdAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'gpt-4o',       label: 'GPT-4o' },
  { value: 'gpt-4o-mini',  label: 'GPT-4o Mini' },
  { value: 'gpt-4.1',      label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-5',        label: 'GPT-5' },
];

// ─── OpenAI call (browser-side) ───────────────────────────────────────────────

async function runSearch(prompt: string, model: string, apiKey: string): Promise<SearchResult> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: prompt,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(body?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json() as any;

  const fanoutQueries: string[] = [];
  const sourcesMap = new Map<string, Source>();
  let responseText = '';
  let searchCount = 0;

  for (const item of data.output ?? []) {
    if (item.type === 'web_search_call') {
      searchCount++;
      const action = item.action;
      if (action) {
        if (Array.isArray(action.queries)) {
          for (const q of action.queries as string[]) {
            if (q && !fanoutQueries.includes(q)) fanoutQueries.push(q);
          }
        }
        if (action.query && !fanoutQueries.includes(action.query)) {
          fanoutQueries.push(action.query as string);
        }
        if (Array.isArray(action.sources)) {
          for (const s of action.sources as any[]) {
            if (s.url && !sourcesMap.has(s.url)) sourcesMap.set(s.url, { url: s.url, title: s.title });
          }
        }
      }
    }
    if (item.type === 'message') {
      for (const content of item.content ?? []) {
        if (content.type === 'output_text') {
          responseText += content.text ?? '';
          for (const ann of content.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url && !sourcesMap.has(ann.url)) {
              sourcesMap.set(ann.url, { url: ann.url, title: ann.title });
            }
          }
        }
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    prompt,
    model,
    fanoutQueries,
    sources: Array.from(sourcesMap.values()),
    responseText,
    searchCount,
    createdAt: Date.now(),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Logo() {
  return (
    <svg aria-label="Fan-Out Explorer" viewBox="0 0 40 40" fill="none"
      style={{ width: 32, height: 32, flexShrink: 0 }}>
      <circle cx="20" cy="20" r="4" fill="#2d9cdb" />
      <line x1="20" y1="16" x2="20" y2="5"  stroke="#2d9cdb"  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="24" x2="20" y2="35" stroke="#2d9cdb"  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="20" x2="5"  y2="20" stroke="#c792ea"  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="20" x2="35" y2="20" stroke="#c792ea"  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17.2" y1="17.2" x2="9"  y2="9"  stroke="#56d364" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22.8" y1="22.8" x2="31" y2="31" stroke="#56d364" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22.8" y1="17.2" x2="31" y2="9"  stroke="#e3b341" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17.2" y1="22.8" x2="9"  y2="31" stroke="#e3b341" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="4"  r="2" fill="rgba(45,156,219,0.7)"  />
      <circle cx="20" cy="36" r="2" fill="rgba(45,156,219,0.7)"  />
      <circle cx="4"  cy="20" r="2" fill="rgba(199,146,234,0.7)" />
      <circle cx="36" cy="20" r="2" fill="rgba(199,146,234,0.7)" />
      <circle cx="8"  cy="8"  r="2" fill="rgba(86,211,100,0.7)"  />
      <circle cx="32" cy="32" r="2" fill="rgba(86,211,100,0.7)"  />
      <circle cx="32" cy="8"  r="2" fill="rgba(227,179,65,0.7)"  />
      <circle cx="8"  cy="32" r="2" fill="rgba(227,179,65,0.7)"  />
    </svg>
  );
}

function QueryChip({ query, index }: { query: string; index: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 12px', borderRadius: 6,
      background: 'var(--query-bg)', border: '1px solid var(--query-border)',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--query-border-hover)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--query-border)')}
    >
      <span className="mono" style={{ fontSize: 11, color: 'var(--query-color)', marginTop: 2, minWidth: 22, flexShrink: 0 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="mono" style={{ fontSize: 13, flex: 1, lineHeight: 1.5, wordBreak: 'break-word' }}>{query}</span>
      <button onClick={copy} aria-label="Copy query" style={{
        background: 'none', border: 'none', padding: 2, flexShrink: 0,
        color: 'var(--fg-subtle)', cursor: 'pointer', marginTop: 1,
        transition: 'color 0.15s',
      }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)')}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function SourceRow({ source, index }: { source: Source; index: number }) {
  const hostname = (() => { try { return new URL(source.url).hostname.replace('www.', ''); } catch { return source.url; } })();
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '7px 12px', borderRadius: 6, textDecoration: 'none',
      background: 'var(--source-bg)', border: '1px solid var(--source-border)',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--source-border-hover)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--source-border)')}
    >
      <Globe size={13} style={{ color: 'var(--source-color)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--source-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostname}</div>
        {source.title && <div style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{source.title}</div>}
      </div>
      <ExternalLink size={11} style={{ flexShrink: 0, color: 'var(--fg-subtle)', marginTop: 2 }} />
    </a>
  );
}

function ResultCard({ result, onRemove }: { result: SearchResult; onRemove: () => void }) {
  const [showResponse, setShowResponse] = useState(false);
  const [showSources, setShowSources] = useState(false);

  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--bg-card)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <p style={{ flex: 1, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{result.prompt}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="mono" style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4,
              background: 'var(--bg-muted)', border: '1px solid var(--border)',
              color: 'var(--fg-muted)',
            }}>{result.model}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
              {new Date(result.createdAt).toLocaleTimeString()}
            </span>
            <button onClick={onRemove} aria-label="Remove" style={{
              background: 'none', border: 'none', padding: 2, color: 'var(--fg-subtle)',
              display: 'flex', alignItems: 'center',
            }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)')}
            ><X size={14} /></button>
          </div>
        </div>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <StatPill icon={<Zap size={12} />} color="var(--query-color)" label={`${result.fanoutQueries.length} fan-out quer${result.fanoutQueries.length === 1 ? 'y' : 'ies'}`} />
          <StatPill icon={<Globe size={12} />} color="var(--source-color)" label={`${result.sources.length} source${result.sources.length !== 1 ? 's' : ''}`} />
          <StatPill icon={<Search size={12} />} color="var(--count-color)" label={`${result.searchCount} search call${result.searchCount !== 1 ? 's' : ''}`} />
        </div>
      </div>

      {/* Fan-out queries */}
      {result.fanoutQueries.length > 0 ? (
        <div style={{ padding: '14px 18px' }}>
          <SectionLabel>Fan-out Queries</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {result.fanoutQueries.map((q, i) => <QueryChip key={i} query={q} index={i} />)}
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--fg-subtle)', fontStyle: 'italic' }}>
          No fan-out queries captured — the model didn't trigger a web search for this prompt.
        </div>
      )}

      {/* Sources */}
      {result.sources.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <ToggleRow label={`Sources (${result.sources.length})`} open={showSources} onClick={() => setShowSources(v => !v)} />
          {showSources && (
            <div style={{ padding: '4px 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
              {result.sources.map((s, i) => <SourceRow key={i} source={s} index={i} />)}
            </div>
          )}
        </div>
      )}

      {/* Response */}
      {result.responseText && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <ToggleRow
            label={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{showResponse ? <EyeOff size={12} /> : <Eye size={12} />}Model Response</span>}
            open={showResponse}
            onClick={() => setShowResponse(v => !v)}
          />
          {showResponse && (
            <div style={{ padding: '4px 18px 18px', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {result.responseText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color }}>
      {icon}
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-subtle)' }}>{children}</p>
  );
}

function ToggleRow({ label, open, onClick }: { label: React.ReactNode; open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 18px', background: 'none', border: 'none',
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
      color: 'var(--fg-subtle)', transition: 'color 0.15s',
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)')}
    >
      <span>{label}</span>
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      border: '2px solid currentColor', borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [prompt, setPrompt]     = useState('');
  const [apiKey, setApiKey]     = useState('');
  const [model, setModel]       = useState('gpt-4o');
  const [showKey, setShowKey]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [results, setResults]   = useState<SearchResult[]>([]);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [prompt]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;
    if (!apiKey.trim()) { setError('Please enter your OpenAI API key.'); return; }
    setError(null);
    setLoading(true);
    try {
      const result = await runSearch(prompt.trim(), model, apiKey.trim());
      setResults(prev => [result, ...prev]);
      setPrompt('');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const removeResult = (id: string) => setResults(prev => prev.filter(r => r.id !== id));

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .result-enter { animation: fadeIn 0.25s ease both; }
        textarea { resize: none; }
        input[type=password]::-ms-reveal { display: none; }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100dvh' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{
          width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)', background: 'var(--bg-card)',
        }} className="sidebar-desktop">
          <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Fan-Out</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Query Explorer</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)', padding: '0 4px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={10} /> Session
            </div>
            {results.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--fg-subtle)', padding: '0 4px', fontStyle: 'italic' }}>No queries yet</p>
              : results.map(r => (
                <button key={r.id} onClick={() => document.getElementById(`result-${r.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'none')}
                >
                  <p style={{ fontSize: 12, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prompt}</p>
                  <p style={{ fontSize: 11, color: 'var(--query-color)', marginTop: 2 }}>{r.fanoutQueries.length} queries · <span className="mono" style={{ color: 'var(--fg-muted)' }}>{r.model}</span></p>
                </button>
              ))
            }
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>
            Calls <span style={{ color: 'var(--accent)' }}>OpenAI Responses API</span> with <span className="mono">web_search</span> tool directly from your browser.
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Mobile header */}
          <header style={{
            display: 'none', alignItems: 'center', gap: 10,
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
          }} className="mobile-header">
            <Logo />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Fan-Out Explorer</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Query Inspector</div>
            </div>
          </header>

          <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '32px 20px 60px' }}>

            {/* Desktop title */}
            <div className="desktop-title" style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 20, fontWeight: 600 }}>Fan-Out Query Explorer</h1>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
                See exactly which search queries ChatGPT fires behind the scenes via the Responses API.
              </p>
            </div>

            {/* ── Form ──────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>

              {/* API key + model row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-…  OpenAI API key"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      width: '100%', height: 38, padding: '0 36px 0 12px',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--fg)', fontSize: 13,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                  <button type="button" onClick={() => setShowKey(v => !v)} aria-label={showKey ? 'Hide key' : 'Show key'}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-subtle)', display: 'flex', padding: 0 }}>
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <select value={model} onChange={e => setModel(e.target.value)}
                  style={{
                    height: 38, padding: '0 10px', background: 'var(--bg-input)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--fg)', fontSize: 13, fontFamily: 'var(--font-mono)',
                    outline: 'none', cursor: 'pointer',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {/* Prompt textarea */}
              <div style={{ position: 'relative' }}>
                <textarea
                  ref={textareaRef}
                  placeholder={"Enter any prompt — e.g. 'What are the best SEO tools in 2025?' — and see which searches ChatGPT fans out to…"}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--fg)', fontSize: 13,
                    fontFamily: 'var(--font-sans)', lineHeight: 1.6,
                    outline: 'none', transition: 'border-color 0.15s',
                    minHeight: 80,
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
                />
              </div>

              {/* Bottom row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                  <span className="mono">⌘↵</span> to submit · Your key goes directly to OpenAI, never stored anywhere.
                </p>
                <button type="submit" disabled={loading || !prompt.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    height: 36, padding: '0 16px', borderRadius: 6,
                    background: loading || !prompt.trim() ? 'var(--bg-muted)' : 'var(--accent)',
                    color: loading || !prompt.trim() ? 'var(--fg-subtle)' : 'var(--accent-fg)',
                    border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {loading ? <><Spinner /> Searching…</> : <><Zap size={14} /> Run</>}
                </button>
              </div>
            </form>

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 8, marginBottom: 20,
                background: 'var(--danger-bg)', border: '1px solid rgba(248,81,73,0.3)',
                color: 'var(--danger)', fontSize: 13,
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1 }}>{error}</span>
                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', padding: 18, marginBottom: 16 }}>
                {[80, 55, 70].map((w, i) => (
                  <div key={i} style={{
                    height: 10, borderRadius: 5, marginBottom: 10,
                    width: `${w}%`, background: 'var(--bg-muted)',
                    animation: `spin 1.5s ${i * 0.2}s ease-in-out infinite alternate`,
                  }} />
                ))}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: 34, borderRadius: 6, background: 'var(--query-bg)', border: '1px solid var(--query-border)' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {results.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, opacity: 0.3 }}>
                  <Logo />
                </div>
                <p style={{ fontSize: 14 }}>Enter a prompt above to see fan-out queries</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Requires an OpenAI API key with access to the Responses API</p>
              </div>
            )}

            {/* Results */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {results.map(r => (
                <div key={r.id} id={`result-${r.id}`} className="result-enter">
                  <ResultCard result={r} onRemove={() => removeResult(r.id)} />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-header { display: flex !important; }
          .desktop-title { display: none !important; }
        }
      `}</style>
    </>
  );
}
