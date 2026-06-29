import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../apiClient.js';

// ── MCQ Section ───────────────────────────────────────────────────────────────
function MCQSection({ date }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});
  const [score, setScore] = useState(null);

  useEffect(() => {
    if (!date) return;
    setQuestions(null); setAnswers({}); setSubmitted({}); setScore(null);
    apiFetch(`/api/mcq/${date}`)
      .then(r => r.json())
      .then(d => { if (d.questions) setQuestions(d.questions); })
      .catch(() => {});
  }, [date]);

  function pick(qid, letter) {
    if (submitted[qid]) return;
    setAnswers(a => ({ ...a, [qid]: letter }));
  }

  function submit(qid) {
    if (!answers[qid]) return;
    setSubmitted(s => ({ ...s, [qid]: true }));
  }

  function checkAll() {
    if (!questions) return;
    const newSub = {};
    questions.forEach(q => { newSub[q.id] = true; });
    setSubmitted(newSub);
    const correct = questions.filter(q => answers[q.id] === q.correct).length;
    setScore({ correct, total: questions.length });
  }

  if (!questions) return null;

  const DIFF_LABEL = { associate: 'SAA-C03', practitioner: 'CLF-C02' };
  const DIFF_COLOR = { associate: '#7c3aed', practitioner: '#0369a1' };

  const optionStyle = (q, letter) => {
    const isSelected = answers[q.id] === letter;
    const isDone = submitted[q.id];
    const isCorrect = letter === q.correct;
    if (!isDone) return {
      background: isSelected ? '#1e3a5f' : '#0f172a',
      border: `1px solid ${isSelected ? '#3b82f6' : '#1e293b'}`,
      color: isSelected ? '#dbeafe' : '#cbd5e1',
    };
    if (isCorrect) return { background: '#052e16', border: '1px solid #16a34a', color: '#86efac' };
    if (isSelected && !isCorrect) return { background: '#450a0a', border: '1px solid #dc2626', color: '#fca5a5' };
    return { background: '#0f172a', border: '1px solid #1e293b', color: '#475569' };
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#93c5fd' }}>📝 Practice MCQs</h2>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>SAA-C03 / CLF-C02 style · {questions.length} questions</div>
        </div>
        <button onClick={checkAll} style={{ padding: '0.35rem 0.8rem', borderRadius: 6, cursor: 'pointer', background: '#1e3a5f', color: '#dbeafe', border: '1px solid #3b82f6', fontSize: '0.82rem' }}>
          Check all
        </button>
      </div>

      {/* Score banner */}
      {score !== null && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', borderRadius: 8, background: score.correct >= score.total * 0.7 ? '#052e16' : '#450a0a', border: `1px solid ${score.correct >= score.total * 0.7 ? '#16a34a' : '#dc2626'}`, color: score.correct >= score.total * 0.7 ? '#86efac' : '#fca5a5', fontWeight: 600, fontSize: '0.9rem' }}>
          {score.correct >= score.total * 0.7 ? '🎉' : '📚'} Score: {score.correct} / {score.total} ({Math.round(score.correct / score.total * 100)}%)
          {score.correct < score.total * 0.7 && ' — review the explanations below'}
        </div>
      )}

      {/* Questions */}
      {questions.map((q, qi) => {
        const done = submitted[q.id];
        const chosen = answers[q.id];
        return (
          <div key={q.id} style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 10, padding: '1.1rem 1.25rem', marginBottom: '1rem' }}>
            {/* Q header */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <span style={{ minWidth: 24, height: 24, borderRadius: '50%', background: '#1e293b', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{qi + 1}</span>
              <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 10, background: DIFF_COLOR[q.difficulty] + '22', color: DIFF_COLOR[q.difficulty], border: `1px solid ${DIFF_COLOR[q.difficulty]}44`, fontWeight: 600 }}>{DIFF_LABEL[q.difficulty] || q.difficulty}</span>
              <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.55, fontSize: '0.9rem', flex: 1 }}>{q.question}</p>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 32 }}>
              {['A', 'B', 'C', 'D'].map(letter => (
                <button key={letter} onClick={() => pick(q.id, letter)} style={{ textAlign: 'left', padding: '0.45rem 0.75rem', borderRadius: 6, cursor: done ? 'default' : 'pointer', fontSize: '0.85rem', lineHeight: 1.45, transition: 'all 0.1s', ...optionStyle(q, letter) }}>
                  <strong style={{ marginRight: 8, opacity: 0.7 }}>{letter}.</strong>{q.options[letter]}
                  {done && letter === q.correct && <span style={{ marginLeft: 8, fontSize: '0.75rem' }}>✓</span>}
                  {done && letter === chosen && letter !== q.correct && <span style={{ marginLeft: 8, fontSize: '0.75rem' }}>✗</span>}
                </button>
              ))}
            </div>

            {/* Submit / Explanation */}
            {!done ? (
              <div style={{ marginLeft: 32, marginTop: 8 }}>
                <button onClick={() => submit(q.id)} disabled={!chosen} style={{ padding: '0.3rem 0.7rem', borderRadius: 6, cursor: chosen ? 'pointer' : 'not-allowed', background: chosen ? '#1e3a5f' : '#0f172a', color: chosen ? '#dbeafe' : '#475569', border: `1px solid ${chosen ? '#3b82f6' : '#1e293b'}`, fontSize: '0.78rem' }}>
                  Submit
                </button>
              </div>
            ) : (
              <div style={{ marginLeft: 32, marginTop: 10, background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 6, padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.6 }}>
                <strong style={{ color: '#7dd3fc' }}>Explanation:</strong> {q.explanation}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Mermaid ───────────────────────────────────────────────────────────────────
let mermaidReady = null;
function loadMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = new Promise((resolve) => {
    if (window.mermaid) { window.mermaid.initialize({ startOnLoad: false, theme: 'dark' }); resolve(window.mermaid); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    s.onload = () => { window.mermaid.initialize({ startOnLoad: false, theme: 'dark' }); resolve(window.mermaid); };
    document.head.appendChild(s);
  });
  return mermaidReady;
}

function MermaidDiagram({ code }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSvg(''); setErr('');
    loadMermaid().then(async (m) => {
      try {
        const { svg: result } = await m.render('mmd-' + Math.random().toString(36).slice(2), code);
        if (!cancelled) setSvg(result);
      } catch (e) { if (!cancelled) setErr(e.message || 'Diagram error'); }
    });
    return () => { cancelled = true; };
  }, [code]);
  if (err) return <pre style={{ color: '#f87171', fontSize: '0.78rem', background: '#1a0a0a', padding: '0.75rem', borderRadius: 6, overflowX: 'auto' }}>{err}</pre>;
  if (!svg) return <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '0.5rem 0' }}>Rendering…</div>;
  return <div style={{ margin: '0.75rem 0 1rem', overflowX: 'auto', background: '#0f172a', borderRadius: 8, padding: '1rem', border: '1px solid #1e293b' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).filter(Boolean).map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k} style={{ color: '#f1f5f9' }}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={k} style={{ background: '#1e293b', color: '#7dd3fc', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.85em' }}>{p.slice(1, -1)}</code>;
    if (/^_[^_]+_$/.test(p)) return <em key={k} style={{ color: '#94a3b8' }}>{p.slice(1, -1)}</em>;
    return <span key={k}>{p}</span>;
  });
}

function Markdown({ text }) {
  const segments = [];
  // Split out mermaid blocks AND fenced code blocks
  const fenceRe = /^```(\w*)\n([\s\S]*?)^```/gm;
  let last = 0, m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'md', src: text.slice(last, m.index) });
    if (m[1] === 'mermaid') segments.push({ type: 'mermaid', src: m[2].trim() });
    else segments.push({ type: 'code', lang: m[1], src: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: 'md', src: text.slice(last) });

  const out = [];
  segments.forEach((seg, si) => {
    if (seg.type === 'mermaid') { out.push(<MermaidDiagram key={`mmd-${si}`} code={seg.src} />); return; }
    if (seg.type === 'code') {
      out.push(
        <pre key={`code-${si}`} style={{ background: '#0d1117', border: '1px solid #1e293b', borderRadius: 8, padding: '1rem', overflowX: 'auto', fontSize: '0.82rem', color: '#e2e8f0', margin: '0.75rem 0 1rem', lineHeight: 1.6 }}>
          <code>{seg.src}</code>
        </pre>
      );
      return;
    }
    const lines = seg.src.split('\n');
    let bullets = null;
    let tableLines = null;
    let blockquoteLines = null;

    const flushBullets = () => {
      if (!bullets) return;
      out.push(<ul key={`ul-${si}-${out.length}`} style={{ margin: '0.25rem 0 0.75rem', paddingLeft: '1.3rem', lineHeight: 1.7 }}>{bullets.map((b, i) => <li key={i} style={{ marginBottom: 4 }}>{renderInline(b, `li-${si}-${out.length}-${i}`)}</li>)}</ul>);
      bullets = null;
    };
    const flushTable = () => {
      if (!tableLines) return;
      const [header, , ...rows] = tableLines;
      const headers = header.split('|').map(h => h.trim()).filter(Boolean);
      out.push(
        <div key={`tbl-${si}-${out.length}`} style={{ overflowX: 'auto', margin: '0.5rem 0 1rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.84rem' }}>
            <thead>
              <tr>{headers.map((h, i) => <th key={i} style={{ background: '#1e3a5f', color: '#93c5fd', padding: '0.4rem 0.75rem', border: '1px solid #1e293b', textAlign: 'left', whiteSpace: 'nowrap' }}>{renderInline(h, `th-${si}-${i}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split('|').map(c => c.trim()).filter(Boolean);
                return <tr key={ri} style={{ background: ri % 2 === 0 ? '#0f172a' : '#0b1120' }}>{cells.map((c, ci) => <td key={ci} style={{ padding: '0.35rem 0.75rem', border: '1px solid #1e293b', color: '#cbd5e1' }}>{renderInline(c, `td-${si}-${ri}-${ci}`)}</td>)}</tr>;
              })}
            </tbody>
          </table>
        </div>
      );
      tableLines = null;
    };
    const flushBlockquote = () => {
      if (!blockquoteLines) return;
      out.push(
        <blockquote key={`bq-${si}-${out.length}`} style={{ borderLeft: '3px solid #3b82f6', margin: '0.75rem 0', padding: '0.5rem 0.9rem', color: '#94a3b8', background: '#0b1928', borderRadius: '0 6px 6px 0', fontStyle: 'italic', lineHeight: 1.7 }}>
          {blockquoteLines.map((l, i) => <span key={i}>{i > 0 && <br />}{renderInline(l, `bq-${si}-${i}`)}</span>)}
        </blockquote>
      );
      blockquoteLines = null;
    };
    const flush = () => { flushBullets(); flushTable(); flushBlockquote(); };

    lines.forEach((raw, idx) => {
      const line = raw.replace(/\s+$/, '');

      // blockquote
      if (/^>\s*/.test(line)) {
        flushBullets(); flushTable();
        (blockquoteLines ||= []).push(line.replace(/^>\s*/, ''));
        return;
      }
      flushBlockquote();

      // table row or separator
      if (/^\|/.test(line)) {
        flushBullets();
        (tableLines ||= []).push(line);
        return;
      }
      flushTable();

      // bullet
      if (/^\s*-\s+/.test(line)) { (bullets ||= []).push(line.replace(/^\s*-\s+/, '')); return; }
      flushBullets();

      const k = `${si}-${idx}`;
      if (/^#\s+/.test(line)) out.push(<h1 key={k} style={{ fontSize: '1.4rem', margin: '0.5rem 0 0.75rem', color: '#fff' }}>{renderInline(line.replace(/^#\s+/, ''), `h1-${k}`)}</h1>);
      else if (/^##\s+/.test(line)) out.push(<h2 key={k} style={{ fontSize: '1.1rem', margin: '1.1rem 0 0.4rem', color: '#93c5fd', borderBottom: '1px solid #1e293b', paddingBottom: 4 }}>{renderInline(line.replace(/^##\s+/, ''), `h2-${k}`)}</h2>);
      else if (/^###\s+/.test(line)) out.push(<h3 key={k} style={{ fontSize: '0.95rem', margin: '0.8rem 0 0.3rem', color: '#cbd5e1' }}>{renderInline(line.replace(/^###\s+/, ''), `h3-${k}`)}</h3>);
      else if (line.trim() === '---') out.push(<hr key={k} style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '1rem 0' }} />);
      else if (line.trim() === '' || /^<!--/.test(line.trim())) out.push(<div key={k} style={{ height: 6 }} />);
      else out.push(<p key={k} style={{ margin: '0.25rem 0', lineHeight: 1.65 }}>{renderInline(line, `p-${k}`)}</p>);
    });
    flush();
  });
  return <div>{out}</div>;
}

// ── Collapsible lab section ────────────────────────────────────────────────────
function LabSection({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: '1rem', border: '1px solid #1e3a5f', borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', background: open ? '#1e3a5f' : '#0f172a', color: '#93c5fd', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 700 }}
      >
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open && (
        <div style={{ padding: '1rem 1.25rem', background: '#080f1a' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Split summary text into main + labs sections ───────────────────────────────
function splitTabs(text) {
  const MARKER = '<!-- LABS_TAB -->';
  const idx = text.indexOf(MARKER);
  if (idx === -1) return { summary: text, labs: null };
  const summary = text.slice(0, idx).trim();
  const labsRaw = text.slice(idx + MARKER.length).trim();
  // Split labs by ## headings into collapsible chunks
  const labChunks = [];
  const labSections = labsRaw.split(/(?=^## )/m);
  for (const sec of labSections) {
    if (!sec.trim()) continue;
    const titleMatch = sec.match(/^## (.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Lab';
    labChunks.push({ title, content: sec });
  }
  return { summary, labs: labChunks };
}

// ── Date grid ─────────────────────────────────────────────────────────────────
function DateGrid({ dates, selected, onSelect }) {
  if (!dates.length) return null;
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Class days</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dates.map(d => {
          const isToday = d === new Date().toISOString().slice(0, 10);
          const isSel = d === selected;
          const label = new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          return (
            <button key={d} onClick={() => onSelect(d)} style={{
              padding: '0.3rem 0.65rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: isSel ? 700 : 400,
              background: isSel ? '#2563eb' : isToday ? '#1e3a5f' : '#0f172a',
              color: isSel ? '#fff' : isToday ? '#93c5fd' : '#94a3b8',
              border: isSel ? '1px solid #3b82f6' : isToday ? '1px solid #3b82f6' : '1px solid #1e293b',
              transition: 'all 0.15s',
            }}>
              {label}{isToday ? ' 📍' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PDF export ────────────────────────────────────────────────────────────────
async function exportSummaryPdf(date, text) {
  const win = window.open('', '_blank');
  if (!win) return;

  // Re-render all mermaid diagrams with a light theme for print
  const mermaid = await loadMermaid();
  // Temporarily switch to light theme for rendering
  mermaid.initialize({ startOnLoad: false, theme: 'default' });

  const fenceRe = /^```mermaid\n([\s\S]*?)^```/gm;
  const parts = [];
  let last = 0, m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'md', src: text.slice(last, m.index) });
    parts.push({ type: 'mermaid', src: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'md', src: text.slice(last) });

  const htmlParts = await Promise.all(parts.map(async (p, i) => {
    if (p.type === 'mermaid') {
      try {
        const { svg } = await mermaid.render(`pdf-mmd-${i}`, p.src);
        return `<div style="margin:1rem 0;border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;overflow:auto">${svg}</div>`;
      } catch {
        return `<pre style="color:#64748b">[Diagram error]</pre>`;
      }
    }
    // Convert markdown to HTML
    return p.src
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^\s*- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[^]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n{2,}/g, '</p><p>');
  }));

  // Restore dark theme for the app
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Class Summary ${date}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1.5rem; color: #1e293b; line-height: 1.65; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #3b82f6; padding-bottom: .4rem; margin-bottom: 1.25rem; }
  h2 { font-size: 1.1rem; margin: 1.4rem 0 .4rem; color: #1d4ed8; border-bottom: 1px solid #dbeafe; padding-bottom: .2rem; }
  h3 { font-size: .95rem; margin: 1rem 0 .3rem; color: #334155; }
  ul { margin: .25rem 0 .75rem; padding-left: 1.4rem; }
  li { margin-bottom: 4px; }
  code { background: #f1f5f9; color: #0369a1; padding: .1rem .35rem; border-radius: 4px; font-size: .88em; }
  strong { color: inherit; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1rem 0; }
  blockquote { border-left: 3px solid #3b82f6; margin: .75rem 0; padding: .4rem .75rem; color: #475569; background: #f8fafc; border-radius: 0 6px 6px 0; }
  svg { max-width: 100%; height: auto; }
  p { margin: .3rem 0; }
  .meta { color: #64748b; font-size: .8rem; margin-bottom: 1.5rem; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Class Summary</h1><div class="meta">${date}</div>
<div>${htmlParts.join('')}</div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── Main component ────────────────────────────────────────────────────────────
const LOOP_PERIOD_MIN = 10;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ClassSummary() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [text, setText] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('summary');

  // Load available dates
  const loadDates = useCallback(async () => {
    try {
      const res = await apiFetch('/api/live-summary/dates');
      const data = await res.json();
      setDates(data.dates || []);
    } catch {}
  }, []);

  // Load summary for selected date
  const load = useCallback(async (date) => {
    setLoading(true);
    try {
      const isToday = date === todayStr();
      const url = isToday ? '/api/live-summary' : `/api/live-summary?date=${date}`;
      const res = await apiFetch(url);
      const data = await res.json();
      setText(data.text || '');
      setUpdatedAt(data.updatedAt || null);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadDates(); }, [loadDates]);

  useEffect(() => {
    load(selectedDate);
    // Only auto-refresh for today
    if (selectedDate !== todayStr()) return;
    const id = setInterval(() => load(selectedDate), 15000);
    return () => clearInterval(id);
  }, [selectedDate, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isToday = selectedDate === todayStr();

  const nextUpdate = (() => {
    const d = new Date(now);
    const nextMark = (Math.floor(d.getMinutes() / LOOP_PERIOD_MIN) + 1) * LOOP_PERIOD_MIN;
    const next = new Date(d); next.setMinutes(nextMark, 0, 0);
    return next;
  })();
  const nextInSec = Math.max(0, Math.round((nextUpdate.getTime() - now) / 1000));
  const nextInLabel = `${Math.floor(nextInSec / 60)}m ${String(nextInSec % 60).padStart(2, '0')}s`;
  const nextAtLabel = nextUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const updated = updatedAt ? new Date(updatedAt) : null;
  const ago = (() => {
    if (!updated) return null;
    const mins = Math.floor((Date.now() - updated.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  })();
  const fullTime = updated
    ? updated.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : null;

  return (
    <div style={{ padding: '1.5rem 1rem', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid #334155', borderRadius: 12, padding: '1rem 1.25rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎙 Class Summaries
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
            {isToday ? "Auto-updated from today's transcript · refreshes every 15s" : `Viewing ${selectedDate}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {updated && (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#064e3b', color: '#6ee7b7', border: '1px solid #065f46',
                borderRadius: 20, padding: '0.3rem 0.7rem', fontSize: '0.8rem', fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                {isToday ? `Updated ${ago}` : fullTime}
              </div>
              {isToday && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>{fullTime}</div>}
            </>
          )}
          {isToday && (
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              ⏱ next update in <strong style={{ color: '#cbd5e1' }}>{nextInLabel}</strong>
              <span style={{ color: '#64748b' }}>(at {nextAtLabel})</span>
            </div>
          )}
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <button onClick={() => load(selectedDate)} style={{
              padding: '0.35rem 0.8rem', borderRadius: 6, cursor: 'pointer',
              background: '#1e3a5f', color: '#dbeafe', border: '1px solid #3b82f6',
            }}>↻ Refresh</button>
            {text && (
              <button onClick={() => exportSummaryPdf(selectedDate, text)} style={{
                padding: '0.35rem 0.8rem', borderRadius: 6, cursor: 'pointer',
                background: '#1e3a5f', color: '#dbeafe', border: '1px solid #3b82f6',
              }}>⬇ Export PDF</button>
            )}
          </div>
        </div>
      </div>

      {/* Date grid */}
      <DateGrid dates={dates} selected={selectedDate} onSelect={setSelectedDate} />

      {/* Body */}
      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : text ? (() => {
        const { summary, labs } = splitTabs(text);
        const tabs = [{ id: 'summary', label: '📖 Summary' }, ...(labs ? [{ id: 'labs', label: '🧪 Labs' }] : [])];
        return (
          <>
            {/* Tab bar — only shown if labs exist */}
            {labs && (
              <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    padding: '0.4rem 1rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: activeTab === t.id ? 700 : 400,
                    background: activeTab === t.id ? '#1e3a5f' : '#0f172a',
                    color: activeTab === t.id ? '#dbeafe' : '#64748b',
                    border: `1px solid ${activeTab === t.id ? '#3b82f6' : '#1e293b'}`,
                  }}>{t.label}</button>
                ))}
              </div>
            )}

            {activeTab === 'summary' && (
              <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: '1.5rem 1.75rem', color: '#e2e8f0', fontSize: '0.93rem' }}>
                <Markdown text={summary} />
              </div>
            )}

            {activeTab === 'labs' && labs && (
              <div style={{ color: '#e2e8f0', fontSize: '0.93rem' }}>
                {labs.map((lab, i) => (
                  <LabSection key={i} title={lab.title}>
                    <Markdown text={lab.content} />
                  </LabSection>
                ))}
              </div>
            )}

            <MCQSection date={selectedDate} />
          </>
        );
      })() : (
        <div style={{
          background: '#0b1120', border: '1px dashed #334155', borderRadius: 12,
          padding: '2rem', textAlign: 'center', color: '#888',
        }}>
          {isToday ? 'No summary yet — start the loop when class begins.' : `No summary saved for ${selectedDate}.`}
        </div>
      )}
    </div>
  );
}
