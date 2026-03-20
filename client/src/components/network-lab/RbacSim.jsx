import { useState } from 'react';

const ROLES = {
  Admin: {
    color: '#f87171',
    icon: '🔑',
    desc: 'Full access — break-glass level',
    permissions: {
      'Production DB':  { Read: true,  Write: true,  Delete: true,  Deploy: true  },
      'Dev Server':     { Read: true,  Write: true,  Delete: true,  Deploy: true  },
      'Source Code':    { Read: true,  Write: true,  Delete: true,  Deploy: true  },
      'Audit Logs':     { Read: true,  Write: false, Delete: false, Deploy: false },
      'Admin Panel':    { Read: true,  Write: true,  Delete: true,  Deploy: true  },
    },
  },
  Developer: {
    color: '#34d399',
    icon: '💻',
    desc: 'Dev server + source code only',
    permissions: {
      'Production DB':  { Read: false, Write: false, Delete: false, Deploy: false },
      'Dev Server':     { Read: true,  Write: true,  Delete: false, Deploy: true  },
      'Source Code':    { Read: true,  Write: true,  Delete: false, Deploy: false },
      'Audit Logs':     { Read: false, Write: false, Delete: false, Deploy: false },
      'Admin Panel':    { Read: false, Write: false, Delete: false, Deploy: false },
    },
  },
  Tester: {
    color: '#60a5fa',
    icon: '🧪',
    desc: 'Read-only on dev, no production',
    permissions: {
      'Production DB':  { Read: false, Write: false, Delete: false, Deploy: false },
      'Dev Server':     { Read: true,  Write: false, Delete: false, Deploy: false },
      'Source Code':    { Read: true,  Write: false, Delete: false, Deploy: false },
      'Audit Logs':     { Read: false, Write: false, Delete: false, Deploy: false },
      'Admin Panel':    { Read: false, Write: false, Delete: false, Deploy: false },
    },
  },
  ReadOnly: {
    color: '#a78bfa',
    icon: '👁️',
    desc: 'View source code only',
    permissions: {
      'Production DB':  { Read: false, Write: false, Delete: false, Deploy: false },
      'Dev Server':     { Read: false, Write: false, Delete: false, Deploy: false },
      'Source Code':    { Read: true,  Write: false, Delete: false, Deploy: false },
      'Audit Logs':     { Read: false, Write: false, Delete: false, Deploy: false },
      'Admin Panel':    { Read: false, Write: false, Delete: false, Deploy: false },
    },
  },
};

const RESOURCES = Object.keys(ROLES.Admin.permissions);
const ACTIONS = ['Read', 'Write', 'Delete', 'Deploy'];

const RESOURCE_ICONS = {
  'Production DB': '🗄️',
  'Dev Server':    '🖥️',
  'Source Code':   '📂',
  'Audit Logs':    '📋',
  'Admin Panel':   '⚙️',
};

export default function RbacSim() {
  const [role, setRole] = useState('Developer');
  const [resource, setResource] = useState('Dev Server');
  const [action, setAction] = useState('Read');
  const [checked, setChecked] = useState(false);

  const roleData = ROLES[role];
  const allowed = roleData.permissions[resource]?.[action] ?? false;

  function check() { setChecked(true); }
  function reset() { setChecked(false); }

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">RBAC Simulator</h3>
      <p className="nlab-hint">
        Role-Based Access Control — every user gets the <em>minimum permissions</em> needed for their job (Principle of Least Privilege).
        Pick a role, resource, and action to simulate an access check.
      </p>

      <div className="rbac-layout">
        {/* Role picker */}
        <div className="rbac-section">
          <div className="rbac-section-title">1. Choose a Role</div>
          <div className="rbac-role-cards">
            {Object.entries(ROLES).map(([r, d]) => (
              <button
                key={r}
                className={`rbac-role-card ${role === r ? 'rbac-role-active' : ''}`}
                style={{ borderColor: role === r ? d.color : undefined }}
                onClick={() => { setRole(r); setChecked(false); }}
              >
                <span className="rbac-role-icon">{d.icon}</span>
                <span className="rbac-role-name" style={{ color: d.color }}>{r}</span>
                <span className="rbac-role-desc">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Matrix */}
        <div className="rbac-section">
          <div className="rbac-section-title">Permission Matrix — {role}</div>
          <div className="rbac-matrix-wrap">
            <table className="rbac-matrix">
              <thead>
                <tr>
                  <th>Resource</th>
                  {ACTIONS.map(a => <th key={a}>{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map(res => (
                  <tr
                    key={res}
                    className={res === resource ? 'rbac-row-selected' : ''}
                    onClick={() => { setResource(res); setChecked(false); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><span className="rbac-res-icon">{RESOURCE_ICONS[res]}</span> {res}</td>
                    {ACTIONS.map(a => {
                      const ok = roleData.permissions[res][a];
                      return (
                        <td key={a} className={ok ? 'rbac-cell-ok' : 'rbac-cell-deny'}>
                          {ok ? '✓' : '✗'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nlab-hint" style={{ marginTop: '0.4rem' }}>Click a row to select a resource for the check below.</p>
        </div>

        {/* Access check */}
        <div className="rbac-section">
          <div className="rbac-section-title">2. Simulate Access Check</div>
          <div className="rbac-check-row">
            <div className="rbac-check-field">
              <label>Role</label>
              <div className="rbac-check-val" style={{ color: roleData.color }}>{roleData.icon} {role}</div>
            </div>
            <div className="rbac-check-arrow">→</div>
            <div className="rbac-check-field">
              <label>Resource</label>
              <select
                className="nlab-select"
                value={resource}
                onChange={e => { setResource(e.target.value); setChecked(false); }}
              >
                {RESOURCES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="rbac-check-arrow">→</div>
            <div className="rbac-check-field">
              <label>Action</label>
              <select
                className="nlab-select"
                value={action}
                onChange={e => { setAction(e.target.value); setChecked(false); }}
              >
                {ACTIONS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={check}>Check</button>
          </div>

          {checked && (
            <div className={`rbac-result ${allowed ? 'rbac-result-ok' : 'rbac-result-deny'}`}>
              <span className="rbac-result-icon">{allowed ? '✅' : '🚫'}</span>
              <div className="rbac-result-text">
                <strong>{allowed ? 'ACCESS GRANTED' : 'ACCESS DENIED'}</strong>
                <span>
                  {roleData.icon} <em>{role}</em> {allowed ? 'can' : 'cannot'} <strong>{action}</strong> on <strong>{RESOURCE_ICONS[resource]} {resource}</strong>
                </span>
                {!allowed && (
                  <span className="rbac-result-hint">
                    Principle of Least Privilege — this role has no need for this permission.
                  </span>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
            </div>
          )}
        </div>

        {/* ABAC note */}
        <div className="rbac-section rbac-abac-note">
          <div className="rbac-section-title">RBAC vs ABAC</div>
          <div className="rbac-compare">
            <div className="rbac-compare-item">
              <span className="rbac-compare-badge" style={{ background: '#334155' }}>RBAC</span>
              <p>Permissions based on <strong>role</strong>. Simple, widely used. "Developers can write to Dev Server."</p>
            </div>
            <div className="rbac-compare-item">
              <span className="rbac-compare-badge" style={{ background: '#1e293b' }}>ABAC</span>
              <p>Permissions based on <strong>attributes</strong> (department, time of day, location). More granular. "Developers in Berlin can write to Dev Server on weekdays 09:00–17:00."</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
