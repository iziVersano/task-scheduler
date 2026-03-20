import { useState } from 'react';

const API = '/api';
const CATEGORIES = ['Networking', 'Linux', 'Security', 'Cloud', 'Scripting'];
const SAFE_CMD = /^[a-zA-Z0-9.\-\s\/:_=]+$/;

export default function LabEditor({ lab, onSave, onClose }) {
  const [title, setTitle]             = useState(lab.title);
  const [category, setCategory]       = useState(lab.category);
  const [concept, setConcept]         = useState(lab.concept);
  const [instructions, setInstructions] = useState([...lab.instructions]);
  const [commands, setCommands]       = useState([...lab.commands]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const updateInstruction = (i, val) => {
    const copy = [...instructions];
    copy[i] = val;
    setInstructions(copy);
  };
  const removeInstruction = (i) => setInstructions(instructions.filter((_, idx) => idx !== i));
  const addInstruction = () => setInstructions([...instructions, '']);

  const updateCommand = (i, val) => {
    const copy = [...commands];
    copy[i] = val;
    setCommands(copy);
  };
  const removeCommand = (i) => setCommands(commands.filter((_, idx) => idx !== i));
  const addCommand = () => setCommands([...commands, '']);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate commands
    const filtered = commands.filter(c => c.trim());
    for (const cmd of filtered) {
      if (!SAFE_CMD.test(cmd)) {
        setError(`Unsafe command: "${cmd}" — only letters, numbers, dots, hyphens, slashes, underscores allowed`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/labs/${encodeURIComponent(lab.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          concept: concept.trim(),
          instructions: instructions.filter(s => s.trim()),
          commands: filtered,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Edit Lab</h2>
            <span className="modal-sub">Source: {lab.sourceTranscript}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          <div className="lab-editor-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Category</label>
              <select className="lab-select" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Concept</label>
              <input value={concept} onChange={e => setConcept(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Instructions ({instructions.length} steps)</label>
            <div className="instruction-list">
              {instructions.map((step, i) => (
                <div key={i} className="instruction-item">
                  <span className="instruction-num">{i + 1}.</span>
                  <input
                    value={step}
                    onChange={e => updateInstruction(i, e.target.value)}
                    placeholder={`Step ${i + 1}`}
                  />
                  <button type="button" className="btn-icon" onClick={() => removeInstruction(i)} title="Remove step">✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-sm btn-neutral" onClick={addInstruction}>+ Add Step</button>
          </div>

          <div className="form-group">
            <label>Commands ({commands.length})</label>
            <div className="instruction-list">
              {commands.map((cmd, i) => (
                <div key={i} className="instruction-item">
                  <input
                    className="cmd-input"
                    value={cmd}
                    onChange={e => updateCommand(i, e.target.value)}
                    placeholder="command"
                  />
                  <button type="button" className="btn-icon" onClick={() => removeCommand(i)} title="Remove command">✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-sm btn-neutral" onClick={addCommand}>+ Add Command</button>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Lab'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
