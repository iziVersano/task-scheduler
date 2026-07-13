import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Difficulty score: higher = harder. Words not in list score 1 (unknown).
const TECH_DIFFICULTY = {
  // Very hard (domain-specific, long, compound German)
  Verfügbarkeitszone: 10, Verschlüsselung: 10, Authentifizierung: 10, Autorisierung: 10,
  Versionierung: 10, Virtualisierung: 10, Lastverteilung: 10, Sicherheitsgruppe: 10,
  Umgebungsvariable: 10, Fehlerbehebung: 10, Datenübertragung: 10, Schlüsselpaar: 10,
  Infrastruktur: 9, Automatisierung: 9, Zugriffsrechte: 9, Betriebssystem: 9,
  Berechtigungen: 9, Kommandozeile: 9, Konfiguration: 9, Microservice: 9,
  // Hard
  Architektur: 8, Überwachung: 8, Bereitstellung: 8, Schnittstelle: 8,
  Deployment: 8, Autoscaling: 8, Skalierung: 8, Richtlinie: 8,
  Zertifikat: 8, Protokoll: 8, Endpunkt: 8, Integration: 8,
  // Medium-hard
  Repository: 7, Repositorium: 7, Virtuell: 7, Container: 7,
  Gateway: 7, Subnetz: 7, Cluster: 7, Firewall: 7, Pipeline: 7,
  Monitoring: 7, Debugging: 7, Rollback: 7, Snapshot: 7, Routing: 7,
  // Medium
  Netzwerk: 6, Instanz: 6, Dienst: 6, Prozess: 6, Verzeichnis: 6,
  Bandbreite: 6, Berechtigung: 6, Datenbank: 6, Speicher: 6,
  Kernel: 6, Daemon: 6, Backup: 6, Variable: 6, Parameter: 6,
  // Easier (common in IT context)
  Server: 4, Client: 4, Branch: 4, Commit: 4, Build: 4,
  Paket: 4, Datei: 4, Skript: 4, Image: 4, Port: 4,
  Terminal: 4, Update: 4, Staging: 4, Region: 4,
};

const COMMON_WORDS = new Set([
  'Und','Aber','Oder','Wenn','Dann','Also','Genau','Okay','Wir','Ihr',
  'Das','Die','Der','Den','Des','Dem','Ein','Eine','Einen','Einem','Einer',
  'Ist','Hat','War','Wird','Werden','Haben','Nicht','Noch','Auch','Schon',
  'Mal','Mehr','Hier','Dort','Jetzt','Weil','Dass','Nach','Über','Unter',
  'Durch','Zwischen','Kann','Müssen','Sollen','Wollen','Alle','Alle',
  'Damit','Dabei','Davon','Dazu','Daran','Darauf','Darum','Diese','Dieser',
  'Dieses','Diesen','Diesem','Sehr','Viel','Immer','Einfach','Natürlich',
  'Eigentlich','Vielleicht','Genauso','Irgendwie','Erstmal','Nochmal',
]);

function extractTechWords(text) {
  const counts = new Map();

  // Count known vocab
  for (const word of Object.keys(TECH_DIFFICULTY)) {
    const pattern = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = text.match(pattern);
    if (matches) counts.set(word, matches.length);
  }

  // Count capitalized German nouns not already found
  const nouns = text.match(/\b[A-ZÄÖÜ][a-zäöüß]{4,}\b/g) || [];
  for (const w of nouns) {
    if (!counts.has(w) && !COMMON_WORDS.has(w)) {
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }

  // Score = difficulty * log(count+1) — rare hard words beat frequent easy ones
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count, difficulty: TECH_DIFFICULTY[word] || 5 }))
    .sort((a, b) => (b.difficulty * Math.log(b.count + 1)) - (a.difficulty * Math.log(a.count + 1)))
    .slice(0, 10);
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button onClick={copy} className="btn btn-ghost" style={{ fontSize: '0.82rem', minWidth: 90 }}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  );
}

function ScreenshotButton() {
  const [state, setState] = useState('idle');
  const [imgUrl, setImgUrl] = useState(null);
  const [err, setErr] = useState(null);

  const capture = useCallback(async () => {
    setState('loading');
    setImgUrl(null);
    setErr(null);
    try {
      const res = await fetch('/api/meet/screenshot');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setImgUrl(URL.createObjectURL(blob));
      setState('done');
    } catch (e) {
      setErr(e.message);
      setState('error');
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
      <button onClick={capture} className="btn btn-ghost" style={{ fontSize: '0.82rem', minWidth: 120 }} disabled={state === 'loading'}>
        {state === 'loading' ? '⏳ Capturing…' : '📸 Screenshot'}
      </button>
      {state === 'error' && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>⚠ {err}</span>}
      {imgUrl && (
        <div style={{ position: 'relative' }}>
          <img src={imgUrl} alt="Meet screenshot" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #334155', display: 'block' }} />
          <a href={imgUrl} download="meet-screenshot.png"
            style={{ position: 'absolute', top: 8, right: 8, background: '#0f172a', color: '#94a3b8', fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: 4, textDecoration: 'none' }}>
            ↓ Save
          </a>
        </div>
      )}
    </div>
  );
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function parseBlocks(text) {
  const blocks = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const timeMatch = line.match(/^\[(\d{2}:\d{2})\]$/);
    if (timeMatch) {
      if (current) blocks.push(current);
      current = { time: timeMatch[1], lines: [] };
    } else if (current) {
      if (line === '--- logged in ---' || line === '--- logged out ---') {
        current.lines.push({ type: 'system', text: line });
      } else if (line.startsWith('*** ALERT')) {
        const m = line.match(/\*\*\* ALERT \[.*?\]: (.*?): "(.*)"$/s);
        if (m) current.lines.push({ type: 'alert', speaker: m[1], text: m[2] });
        else    current.lines.push({ type: 'alert', speaker: '', text: line });
      } else {
        current.lines.push({ type: 'speech', text: line });
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function LastQuestionModal({ transcript, onClose }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setState('loading');
    fetch('/api/captions/last-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setResult(d);
        setState('done');
      })
      .catch(e => { setErr(e.message); setState('error'); });
  }, [transcript]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
          padding: '1.75rem', maxWidth: 560, width: '100%', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'none', border: 'none', color: '#475569',
            fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1,
          }}
        >✕</button>

        <h3 style={{ margin: '0 0 1.1rem', color: '#f1f5f9', fontSize: '1rem', fontWeight: 700 }}>
          ❓ Last Instructor Question
        </h3>

        {state === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#64748b' }}>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: '0.85rem' }}>Analyzing transcript…</span>
          </div>
        )}

        {state === 'error' && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: 0 }}>⚠ {err}</p>
        )}

        {state === 'done' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 8, padding: '0.9rem 1rem' }}>
              <div style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question</div>
              <p style={{ color: '#e2e8f0', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>{result.question}</p>
            </div>
            <div style={{ background: '#0f2a1a', border: '1px solid #1a4731', borderRadius: 8, padding: '0.9rem 1rem' }}>
              <div style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Answer</div>
              <p style={{ color: '#e2e8f0', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>{result.answer}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <CopyButton text={`Q: ${result.question}\n\nA: ${result.answer}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryModal({ text, date, range, onClose }) {
  const [summary, setSummary] = useState('');
  const [state, setState] = useState('loading'); // loading | done | error
  const [err, setErr] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setSummary('');
    setState('loading');

    (async () => {
      try {
        const res = await fetch('/api/recap/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          setSummary(s => s + chunk);
        }
        setState('done');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setErr(e.message);
        setState('error');
      }
    })();

    return () => ctrl.abort();
  }, [text]);

  const tokens = Math.round(text.length / 4); // rough estimate for display

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
          padding: '1.75rem', maxWidth: 720, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'none', border: 'none', color: '#475569',
            fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1,
          }}
        >✕</button>

        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.25rem', color: '#f1f5f9', fontSize: '1rem', fontWeight: 700 }}>
            ✨ AI Summary
          </h3>
          <div style={{ color: '#475569', fontSize: '0.75rem' }}>
            {date} · {range.from} → {range.to} · ~{tokens.toLocaleString()} tokens · Claude Opus 4.8
          </div>
        </div>

        {state === 'loading' && summary === '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#64748b' }}>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: '0.85rem' }}>Reading the transcript and thinking…</span>
          </div>
        )}

        {state === 'error' && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: 0 }}>⚠ {err}</p>
        )}

        {summary && (
          <pre
            style={{
              flex: 1,
              margin: 0,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 8,
              padding: '1rem 1.1rem',
              color: '#e2e8f0',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              fontFamily: 'inherit',
              whiteSpace: 'pre-wrap',
              overflowY: 'auto',
            }}
          >
            {summary}
            {state === 'loading' && <span style={{ color: '#60a5fa' }}>▍</span>}
          </pre>
        )}

        {state === 'done' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.82rem' }}
              onClick={() => {
                const win = window.open('', '_blank');
                if (!win) return;
                const html = summary
                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br>');
                win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>AI Summary – ${date} ${range.from}–${range.to}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; color: #1e293b; line-height: 1.7; }
  h1 { font-size: 1.3rem; border-bottom: 2px solid #3b82f6; padding-bottom: .4rem; margin-bottom: .5rem; }
  .meta { color: #64748b; font-size: .8rem; margin-bottom: 1.75rem; }
  .body { font-size: .95rem; white-space: pre-wrap; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>AI Summary</h1>
<div class="meta">${date} · ${range.from} → ${range.to}</div>
<div class="body">${html}</div>
</body></html>`);
                win.document.close();
                win.focus();
                setTimeout(() => win.print(), 400);
              }}
            >
              ⬇ Export PDF
            </button>
            <CopyButton text={summary} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DailyRecap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo]   = useState('');
  const [applied, setApplied] = useState(null); // { from, to } — set on Recap click
  const [showTech, setShowTech] = useState(false);
  const [showLastQ, setShowLastQ] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const techRef = useRef(null);

  useEffect(() => {
    fetch('/api/captions/today')
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d.timestamps?.length) {
          // Default: last 2 minutes
          const last = d.timestamps[d.timestamps.length - 1];
          const lastMins = toMinutes(last);
          const fromDefault = d.timestamps.find(t => toMinutes(t) >= lastMins - 2) || last;
          setFrom(fromDefault);
          setTo(last);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allBlocks = useMemo(() => data?.text ? parseBlocks(data.text) : [], [data]);

  const filteredBlocks = useMemo(() => {
    if (!applied) return [];
    const fromM = toMinutes(applied.from);
    const toM   = toMinutes(applied.to);
    return allBlocks.filter(b => {
      const bm = toMinutes(b.time);
      return bm >= fromM && bm <= toM;
    });
  }, [allBlocks, applied]);

  // Reconstruct plain text from filtered blocks for copy
  const filteredText = useMemo(() =>
    filteredBlocks.map(b => [`[${b.time}]`, ...b.lines.map(l => l.text)].join('\n')).join('\n\n'),
  [filteredBlocks]);

  const techWords = useMemo(() => filteredText ? extractTechWords(filteredText) : [], [filteredText]); // [{word,count,difficulty}]

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <span className="spinner" />
    </div>
  );

  if (!data?.found) return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
        <p style={{ color: '#94a3b8', margin: 0 }}>No captions found for today ({data?.date}).</p>
      </div>
    </div>
  );

  const selectStyle = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', fontSize: '0.82rem', padding: '0.3rem 0.5rem', cursor: 'pointer',
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.25rem', fontWeight: 700 }}>📖 Daily Recap</h2>
          <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.8rem' }}>
            {data.date} · {filteredBlocks.length} block{filteredBlocks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <CopyButton text={filteredText} />
          {applied && filteredBlocks.length > 0 && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.82rem' }}
              onClick={() => { setShowTech(t => !t); setTimeout(() => techRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }}
            >
              🇩🇪 Tech Words {showTech ? '▲' : '▼'}
            </button>
          )}
          {data?.text && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.82rem' }}
              onClick={() => setShowLastQ(true)}
            >
              ❓ Last Question
            </button>
          )}
          {filteredText && (
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.82rem' }}
              onClick={() => setShowSummary(true)}
            >
              ✨ Summarize
            </button>
          )}
          <ScreenshotButton />
        </div>
      </div>

      {/* Time range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '0.6rem 0.9rem' }}>
        <span style={{ color: '#475569', fontSize: '0.8rem' }}>From</span>
        <select value={from} onChange={e => setFrom(e.target.value)} style={selectStyle}>
          {data.timestamps.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ color: '#475569', fontSize: '0.8rem' }}>To</span>
        <select value={to} onChange={e => setTo(e.target.value)} style={selectStyle}>
          {data.timestamps.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ color: '#334155', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
          {data.timestamps.length} timestamps in file
        </span>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.75rem', marginLeft: 'auto' }}
          onClick={() => {
            const f = data.timestamps[0];
            const t = data.timestamps[data.timestamps.length - 1];
            setFrom(f); setTo(t);
            setApplied({ from: f, to: t });
          }}
        >
          Show all
        </button>
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.82rem' }}
          onClick={() => setApplied({ from, to })}
        >
          Recap
        </button>
      </div>

      {/* Timeline */}
      {filteredBlocks.length === 0
        ? <p style={{ color: '#475569', fontSize: '0.85rem' }}>{applied ? 'No blocks in selected range.' : 'Set a time range and click Recap.'}</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredBlocks.map((block, bi) => (
              <div key={bi} style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ width: 42, flexShrink: 0, paddingTop: '0.15rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>
                    {block.time}
                  </span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {block.lines.map((l, li) => {
                    if (l.type === 'system') return (
                      <div key={li} style={{ color: '#334155', fontSize: '0.75rem', fontStyle: 'italic' }}>{l.text}</div>
                    );
                    if (l.type === 'alert') return (
                      <div key={li} style={{ background: '#1e3a5f', borderLeft: '3px solid #3b82f6', borderRadius: '0 6px 6px 0', padding: '0.4rem 0.65rem' }}>
                        {l.speaker && <span style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, display: 'block', marginBottom: '0.15rem' }}>{l.speaker}</span>}
                        <span style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.5 }}>{l.text}</span>
                      </div>
                    );
                    return (
                      <div key={li} style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.6 }}>{l.text}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Last Question Modal */}
      {showLastQ && (
        <LastQuestionModal transcript={data.text} onClose={() => setShowLastQ(false)} />
      )}

      {/* AI Summary Modal */}
      {showSummary && (
        <SummaryModal
          text={filteredText}
          date={data.date}
          range={applied || { from, to }}
          onClose={() => setShowSummary(false)}
        />
      )}

      {/* Tech Words Panel */}
      {showTech && applied && techWords.length > 0 && (
        <div ref={techRef} style={{ marginTop: '1.5rem', background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <div>
              <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.9rem' }}>🇩🇪 Technical German Words</span>
              <span style={{ color: '#334155', fontSize: '0.75rem', marginLeft: '0.6rem' }}>{techWords.length} found in selected range</span>
            </div>
            <CopyButton text={techWords.map(({ word, count }) => `${word} (×${count})`).join('\n')} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {techWords.map(({ word, count, difficulty }, i) => {
              const accent = difficulty >= 9 ? '#f87171' : difficulty >= 7 ? '#fb923c' : '#60a5fa';
              return (
                <span key={word} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  background: '#0f172a', border: `1px solid ${accent}22`, borderRadius: 6,
                  padding: '0.3rem 0.7rem', fontSize: '0.82rem', color: '#e2e8f0',
                }}>
                  <span style={{ color: '#334155', fontSize: '0.68rem', fontWeight: 700 }}>#{i + 1}</span>
                  <span style={{ color: accent, fontWeight: 600 }}>{word}</span>
                  <span style={{ color: '#334155', fontSize: '0.7rem' }}>×{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
