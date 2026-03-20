import { useState } from 'react';

const FLOW_STEPS = [
  {
    id: 'browser',
    label: 'Browser',
    icon: '🌐',
    color: '#94a3b8',
    detail: 'User visits https://auth.example.com — port 443 (HTTPS)',
  },
  {
    id: 'caddy-tls',
    label: 'Caddy — TLS',
    icon: '🔒',
    color: '#818cf8',
    detail: 'Caddy terminates TLS. Manages its own Let\'s Encrypt certificates automatically. The connection is now decrypted internally.',
  },
  {
    id: 'coraza',
    label: 'Coraza WAF',
    icon: '🛡️',
    color: '#fbbf24',
    detail: 'Web Application Firewall (Coraza module). Inspects the request for injection attacks, XSS, malformed headers. Blocks bad traffic before it reaches Keycloak.',
  },
  {
    id: 'cors',
    label: 'CORS Check',
    icon: '🔗',
    color: '#60a5fa',
    detail: 'Cross-Origin Resource Sharing headers are added. Controls which frontend domains are allowed to make API calls to Keycloak.',
  },
  {
    id: 'keycloak',
    label: 'Keycloak :8080',
    icon: '🗝️',
    color: '#34d399',
    detail: 'Keycloak runs on internal port 8080 (plain HTTP). It never sees the internet directly — Caddy is the only entry point.',
  },
];

const CADDYFILE = `{
  # Global options block
  email admin@example.com
}

auth.example.com {
  # TLS is automatic (Let's Encrypt)

  # Coraza WAF — blocks malicious requests
  coraza_waf {
    directives \`
      SecRuleEngine On
      Include @owasp_crs/*.conf
    \`
  }

  # CORS headers
  header {
    Access-Control-Allow-Origin "https://app.example.com"
    Access-Control-Allow-Methods "GET, POST, OPTIONS"
  }

  # Reverse proxy to Keycloak
  reverse_proxy localhost:8080
}`;

export default function ReverseProxy() {
  const [activeStep, setActiveStep] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState(-1);

  function simulate() {
    if (animating) return;
    setAnimating(true);
    setAnimStep(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= FLOW_STEPS.length) {
        clearInterval(interval);
        setAnimating(false);
        setAnimStep(-1);
      } else {
        setAnimStep(i);
      }
    }, 700);
  }

  const selected = activeStep !== null ? FLOW_STEPS[activeStep] : null;

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Reverse Proxy — Caddy + Keycloak</h3>
      <p className="nlab-hint">
        A <strong>reverse proxy</strong> sits in front of your application and handles TLS, security filtering, and routing.
        The application itself (Keycloak) only runs on an internal port and is never directly exposed.
      </p>

      {/* Flow diagram */}
      <div className="rp-flow">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.id} className="rp-flow-item">
            <button
              className={`rp-node ${activeStep === i ? 'rp-node-selected' : ''} ${animStep === i ? 'rp-node-animating' : ''}`}
              style={{ borderColor: activeStep === i || animStep === i ? step.color : undefined }}
              onClick={() => setActiveStep(activeStep === i ? null : i)}
            >
              <span className="rp-node-icon">{step.icon}</span>
              <span className="rp-node-label" style={{ color: step.color }}>{step.label}</span>
            </button>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`rp-arrow ${animStep > i ? 'rp-arrow-done' : ''}`}>
                ───►
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rp-sim-bar">
        <button className="btn btn-primary" onClick={simulate} disabled={animating}>
          {animating ? 'Request in flight...' : '▶ Simulate Request'}
        </button>
        <span className="nlab-hint" style={{ margin: 0 }}>Click a node for details, or simulate a full request flow.</span>
      </div>

      {selected && (
        <div className="rp-detail" style={{ borderColor: selected.color }}>
          <span className="rp-detail-icon">{selected.icon}</span>
          <div>
            <div className="rp-detail-title" style={{ color: selected.color }}>{selected.label}</div>
            <p className="rp-detail-desc">{selected.detail}</p>
          </div>
        </div>
      )}

      {/* Port map */}
      <div className="nlab-sub-title" style={{ marginTop: '1.5rem' }}>Port mapping</div>
      <div className="rp-ports">
        <div className="rp-port-row">
          <code className="rp-port-code" style={{ color: '#818cf8' }}>:443</code>
          <span className="rp-port-arrow">→</span>
          <span className="rp-port-desc">Caddy (public, TLS)</span>
        </div>
        <div className="rp-port-row">
          <code className="rp-port-code" style={{ color: '#34d399' }}>:8080</code>
          <span className="rp-port-arrow">→</span>
          <span className="rp-port-desc">Keycloak (internal only, plain HTTP)</span>
        </div>
        <div className="rp-port-row">
          <code className="rp-port-code" style={{ color: '#f87171' }}>:80</code>
          <span className="rp-port-arrow">→</span>
          <span className="rp-port-desc">Caddy (redirects to :443 automatically)</span>
        </div>
      </div>

      {/* Caddyfile */}
      <div className="nlab-sub-title" style={{ marginTop: '1.5rem' }}>Caddyfile</div>
      <p className="nlab-hint">The Caddyfile configures all of this in ~20 lines. Indentation defines the directive hierarchy — as learned in today's lab.</p>
      <pre className="rp-caddyfile">{CADDYFILE}</pre>

      {/* Caddy validate tip */}
      <div className="rp-tip">
        <span>💡</span>
        <span>Always run <code>caddy validate --config Caddyfile</code> before restarting — it catches syntax errors without taking down the server.</span>
      </div>

      {/* Why reverse proxy */}
      <div className="nlab-sub-title" style={{ marginTop: '1.5rem' }}>Why not expose Keycloak directly?</div>
      <div className="rp-reasons">
        {[
          { icon: '🔒', title: 'TLS in one place', desc: 'Caddy handles certificates automatically. No need to configure TLS in every backend service.' },
          { icon: '🛡️', title: 'WAF protection', desc: 'Coraza blocks OWASP Top 10 attacks before they reach Keycloak.' },
          { icon: '🔗', title: 'Single entry point', desc: 'Only Caddy is internet-facing. Keycloak, databases, and internal services are on private ports.' },
          { icon: '⚡', title: 'Easy to swap', desc: 'If you replace Keycloak with a different IdP, just update the reverse_proxy target. No firewall changes.' },
        ].map(r => (
          <div key={r.title} className="rp-reason">
            <span className="rp-reason-icon">{r.icon}</span>
            <div>
              <div className="rp-reason-title">{r.title}</div>
              <div className="rp-reason-desc">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
