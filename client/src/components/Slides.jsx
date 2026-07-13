import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../apiClient.js';

export default function Slides() {
  const [days, setDays] = useState([]);
  const [activeDay, setActiveDay] = useState(null);
  const [slides, setSlides] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState('');
  const [lightbox, setLightbox] = useState(null);

  const loadDays = useCallback(async () => {
    const res = await apiFetch('/api/slides/days');
    const data = await res.json();
    setDays(data);
    setActiveDay(prev => prev || data[0]?.day || null);
  }, []);

  const loadSlides = useCallback(async (day) => {
    if (!day) { setSlides([]); return; }
    const res = await apiFetch(`/api/slides/${day}`);
    setSlides(await res.json());
  }, []);

  useEffect(() => { loadDays(); }, [loadDays]);
  useEffect(() => { loadSlides(activeDay); }, [activeDay, loadSlides]);

  const capture = async () => {
    setCapturing(true);
    setStatus('');
    try {
      const res = await apiFetch('/api/slides/capture', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setStatus(`⚠ ${data.error || 'Capture failed'}`); return; }
      setStatus(`✅ Saved ${data.filename}`);
      await loadDays();
      setActiveDay(data.day);
      await loadSlides(data.day);
    } catch (e) {
      setStatus(`⚠ ${e.message}`);
    } finally {
      setCapturing(false);
      setTimeout(() => setStatus(''), 4000);
    }
  };

  const remove = async (filename) => {
    if (!confirm(`Delete ${filename}?`)) return;
    await apiFetch(`/api/slides/${activeDay}/${filename}`, { method: 'DELETE' });
    await loadSlides(activeDay);
    await loadDays();
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>🖼 Class Slides</h2>
        <button
          onClick={capture}
          disabled={capturing}
          style={{
            padding: '0.5rem 1rem', fontSize: '1rem', cursor: capturing ? 'wait' : 'pointer',
            background: '#2d7d46', color: '#fff', border: 'none', borderRadius: 6,
          }}
        >
          {capturing ? '⏳ Capturing…' : '📸 Capture slide'}
        </button>
        <button onClick={loadDays} style={{ padding: '0.5rem 0.8rem', borderRadius: 6 }}>↻ Refresh</button>
        {status && <span style={{ fontSize: '0.9rem' }}>{status}</span>}
      </div>

      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0 }}>
        Captures the live Google Meet tab. Click whenever the instructor shows a slide or diagram.
      </p>

      {/* Day selector */}
      {days.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {days.map(d => (
            <button
              key={d.day}
              onClick={() => setActiveDay(d.day)}
              style={{
                padding: '0.35rem 0.7rem', borderRadius: 16, border: '1px solid #555',
                background: d.day === activeDay ? '#2d7d46' : 'transparent',
                color: d.day === activeDay ? '#fff' : 'inherit', cursor: 'pointer',
              }}
            >
              {d.day} ({d.count})
            </button>
          ))}
        </div>
      )}

      {slides.length === 0 && (
        <p style={{ color: '#888' }}>No slides captured{activeDay ? ` for ${activeDay}` : ''} yet.</p>
      )}

      {/* Thumbnail grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
        {slides.map(s => (
          <div key={s.filename} style={{ border: '1px solid #444', borderRadius: 8, overflow: 'hidden', background: '#1b1b1b' }}>
            <img
              src={s.url}
              alt={s.filename}
              loading="lazy"
              onClick={() => setLightbox(s.url)}
              style={{ width: '100%', display: 'block', cursor: 'zoom-in' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
              <span>{s.filename.replace('.png', '').replace(/-/g, ':')}</span>
              <span style={{ display: 'flex', gap: '0.5rem' }}>
                <a href={s.url} download={s.filename} style={{ textDecoration: 'none' }}>⬇</a>
                <button onClick={() => remove(s.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e66' }}>🗑</button>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} alt="slide" style={{ maxWidth: '95%', maxHeight: '95%' }} />
        </div>
      )}
    </div>
  );
}
