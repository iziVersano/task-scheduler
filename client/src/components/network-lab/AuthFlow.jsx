import { useState } from 'react';

const KERBEROS_STEPS = [
  {
    id: 'login',
    from: '👤 Client (Alice)',
    to: '🏛️ AS (Auth Server)',
    label: 'Step 1 — Login request',
    msg: 'Alice enters her password. The client hashes it and sends a login request to the Authentication Server (part of KDC).',
    color: '#818cf8',
    arrow: 'right',
    detail: 'No password is sent over the network — only a hash.',
  },
  {
    id: 'tgt',
    from: '🏛️ AS (Auth Server)',
    to: '👤 Client (Alice)',
    label: 'Step 2 — Ticket Granting Ticket (TGT)',
    msg: 'The AS verifies Alice\'s credentials and issues a TGT — a time-limited, encrypted "master ticket". Valid for 8–10 hours.',
    color: '#34d399',
    arrow: 'left',
    detail: 'The TGT is encrypted with the KDC\'s secret key. The client cannot decrypt it — it just stores it.',
  },
  {
    id: 'tgs-req',
    from: '👤 Client (Alice)',
    to: '🎟️ TGS (Ticket Granting Server)',
    label: 'Step 3 — Request a Service Ticket',
    msg: 'Alice wants to access SAP. She sends her TGT to the Ticket Granting Server and says "I need access to SAP".',
    color: '#fbbf24',
    arrow: 'right',
    detail: 'The TGT proves who Alice is. She never has to re-enter her password.',
  },
  {
    id: 'service-ticket',
    from: '🎟️ TGS',
    to: '👤 Client (Alice)',
    label: 'Step 4 — Service Ticket',
    msg: 'The TGS checks if Alice is authorized to use SAP. If yes, it issues a Service Ticket encrypted for the SAP server.',
    color: '#34d399',
    arrow: 'left',
    detail: 'Alice still cannot read this ticket — it\'s encrypted with SAP\'s key.',
  },
  {
    id: 'sap',
    from: '👤 Client (Alice)',
    to: '🏢 SAP Service',
    label: 'Step 5 — Present Service Ticket',
    msg: 'Alice sends the Service Ticket to SAP. SAP decrypts it with its own key and grants access — Single Sign-On achieved.',
    color: '#60a5fa',
    arrow: 'right',
    detail: 'SAP never needed to ask Alice for a password — it trusts the KDC.',
  },
  {
    id: 'done',
    from: '🏢 SAP',
    to: '👤 Client (Alice)',
    label: 'Step 6 — Access granted ✅',
    msg: 'Alice is now authenticated and authorized. She can use SAP for the duration of the ticket (typically 8 hours). No more password prompts.',
    color: '#34d399',
    arrow: 'left',
    detail: 'This is why logging in once in the morning gets you into email, SAP, file shares, printers — all automatically.',
  },
];

const FIDO2_STEPS = [
  {
    label: '1. Registration',
    msg: 'Alice registers a YubiKey with the system. The device generates a public/private key pair. The public key is stored on the server. The private key never leaves the device.',
    icon: '🔐',
    color: '#818cf8',
  },
  {
    label: '2. Login challenge',
    msg: 'Alice plugs in her YubiKey. The server sends a random challenge string.',
    icon: '❓',
    color: '#fbbf24',
  },
  {
    label: '3. Biometric confirm',
    msg: 'Alice touches the YubiKey (capacitive sensor). The device signs the challenge with her private key.',
    icon: '👆',
    color: '#60a5fa',
  },
  {
    label: '4. Verification',
    msg: 'The server verifies the signature with Alice\'s stored public key. No password was ever transmitted or stored.',
    icon: '✅',
    color: '#34d399',
  },
];

export default function AuthFlow() {
  const [mode, setMode] = useState('kerberos');
  const [step, setStep] = useState(0);

  const current = KERBEROS_STEPS[step];

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Authentication Flow</h3>
      <p className="nlab-hint">
        How does <strong>Single Sign-On (SSO)</strong> actually work? Step through Kerberos (Active Directory) or explore FIDO2/Passwordless.
      </p>

      <div className="auth-mode-bar">
        <button
          className={`auth-mode-btn ${mode === 'kerberos' ? 'auth-mode-active' : ''}`}
          onClick={() => { setMode('kerberos'); setStep(0); }}
        >🏛️ Kerberos (Active Directory)</button>
        <button
          className={`auth-mode-btn ${mode === 'fido2' ? 'auth-mode-active' : ''}`}
          onClick={() => setMode('fido2')}
        >🔑 FIDO2 / Passwordless</button>
      </div>

      {mode === 'kerberos' && (
        <div className="auth-kerberos">
          {/* Actors */}
          <div className="auth-actors">
            {['👤 Client', '🏛️ KDC / AS', '🎟️ TGS', '🏢 SAP'].map((a, i) => (
              <div key={i} className="auth-actor">
                <div className="auth-actor-box">{a}</div>
                <div className="auth-actor-line" />
              </div>
            ))}
          </div>

          {/* Current step */}
          <div className="auth-step-card" style={{ borderColor: current.color }}>
            <div className="auth-step-header" style={{ color: current.color }}>
              {current.label}
            </div>
            <div className="auth-step-flow">
              <span className="auth-step-from">{current.from}</span>
              <span className="auth-step-arrow" style={{ color: current.color }}>
                {current.arrow === 'right' ? '──────►' : '◄──────'}
              </span>
              <span className="auth-step-to">{current.to}</span>
            </div>
            <p className="auth-step-msg">{current.msg}</p>
            <div className="auth-step-detail">
              <span className="auth-step-detail-icon">💡</span>
              {current.detail}
            </div>
          </div>

          {/* Progress dots */}
          <div className="auth-progress">
            {KERBEROS_STEPS.map((s, i) => (
              <button
                key={i}
                className={`auth-dot ${i === step ? 'auth-dot-active' : ''} ${i < step ? 'auth-dot-done' : ''}`}
                style={i === step ? { background: current.color } : {}}
                onClick={() => setStep(i)}
                title={s.label}
              />
            ))}
          </div>

          <div className="auth-nav">
            <button
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={() => setStep(s => s - 1)}
            >← Back</button>
            <span className="auth-step-count">{step + 1} / {KERBEROS_STEPS.length}</span>
            {step < KERBEROS_STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Next →</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setStep(0)}>↺ Restart</button>
            )}
          </div>

          <div className="auth-kdc-note">
            <span className="auth-kdc-note-title">What is the KDC?</span>
            The <strong>Key Distribution Center</strong> runs on the Domain Controller. It contains both the <strong>AS</strong> (Authentication Server — issues TGTs) and the <strong>TGS</strong> (Ticket Granting Server — issues Service Tickets). In Active Directory, this is automatically set up on every Domain Controller.
          </div>
        </div>
      )}

      {mode === 'fido2' && (
        <div className="auth-fido2">
          <div className="auth-fido2-intro">
            <strong>No password is ever transmitted or stored.</strong> Authentication is based on a public/private key pair — like SSH certificates — stored on a hardware key (YubiKey) with biometric confirmation.
          </div>

          <div className="auth-fido2-steps">
            {FIDO2_STEPS.map((s, i) => (
              <div key={i} className="auth-fido2-step" style={{ borderLeftColor: s.color }}>
                <div className="auth-fido2-step-header">
                  <span className="auth-fido2-icon">{s.icon}</span>
                  <span className="auth-fido2-label" style={{ color: s.color }}>{s.label}</span>
                </div>
                <p className="auth-fido2-msg">{s.msg}</p>
              </div>
            ))}
          </div>

          <div className="auth-fido2-compare">
            <div className="rbac-section-title" style={{ marginBottom: '0.75rem' }}>Password vs FIDO2</div>
            <table className="rbac-matrix">
              <thead>
                <tr>
                  <th></th>
                  <th>🔒 Password</th>
                  <th>🔑 FIDO2</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Transmitted over network</td><td className="rbac-cell-deny">Yes (hashed)</td><td className="rbac-cell-ok">Never</td></tr>
                <tr><td>Stored on server</td><td className="rbac-cell-deny">Yes (hashed)</td><td className="rbac-cell-ok">Public key only</td></tr>
                <tr><td>Phishing risk</td><td className="rbac-cell-deny">High</td><td className="rbac-cell-ok">None</td></tr>
                <tr><td>Replay attack risk</td><td className="rbac-cell-deny">Yes</td><td className="rbac-cell-ok">None (random challenge)</td></tr>
                <tr><td>Lost device recovery</td><td className="rbac-cell-ok">Easy</td><td className="rbac-cell-deny">Need backup key</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
