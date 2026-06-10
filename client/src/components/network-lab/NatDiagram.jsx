export default function NatDiagram() {
  const steps = [
    { from: 'Laptop (192.168.178.42)', action: 'Sends request to ikea.co.jp', arrow: 'right' },
    { from: 'Fritzbox Router', action: 'Replaces source 192.168.178.42 with public IP 85.214.47.12', arrow: 'right' },
    { from: 'Internet', action: 'Packet travels with public source IP 85.214.47.12', arrow: 'right' },
    { from: 'ikea.co.jp (104.18.22.7)', action: 'Responds to 85.214.47.12', arrow: 'left' },
    { from: 'Fritzbox Router', action: 'NAT table lookup: 85.214.47.12:54321 -> 192.168.178.42:54321', arrow: 'left' },
    { from: 'Laptop (192.168.178.42)', action: 'Receives the response', arrow: 'done' },
  ];

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">NAT (Network Address Translation)</h3>
      <p className="nlab-hint">
        Private IPs (192.168.x.x) cannot be routed on the internet. NAT translates them to a public IP at the router, allowing multiple devices to share one public address.
      </p>

      <div className="nlab-nat-diagram">
        <div className="nlab-nat-sides">
          <div className="nlab-nat-side nlab-nat-private">
            <span className="nlab-nat-side-label">Private Network</span>
            <div className="nlab-nat-device">Laptop<br /><code>192.168.178.42</code></div>
            <div className="nlab-nat-device">Phone<br /><code>192.168.178.43</code></div>
            <div className="nlab-nat-device">Smart TV<br /><code>192.168.178.44</code></div>
          </div>

          <div className="nlab-nat-router">
            <span className="nlab-nat-router-label">Router (NAT)</span>
            <div className="nlab-nat-ifaces">
              <div><code>192.168.178.1</code><br /><span className="muted">internal</span></div>
              <div><code>85.214.47.12</code><br /><span className="muted">external (public)</span></div>
            </div>
          </div>

          <div className="nlab-nat-side nlab-nat-public">
            <span className="nlab-nat-side-label">Public Internet</span>
            <div className="nlab-nat-device">ikea.co.jp<br /><code>104.18.22.7</code></div>
          </div>
        </div>
      </div>

      <h4 className="nlab-sub-title">How it works step by step</h4>
      <div className="nlab-nat-steps">
        {steps.map((s, i) => (
          <div key={i} className={`nlab-nat-step ${s.arrow === 'done' ? 'nlab-nat-step-done' : ''}`}>
            <span className="nlab-nat-step-num">{i + 1}</span>
            <div className="nlab-nat-step-content">
              <span className="nlab-nat-step-from">{s.from}</span>
              <span className="nlab-nat-step-action">{s.action}</span>
            </div>
            {s.arrow !== 'done' && (
              <span className={`nlab-nat-step-arrow ${s.arrow === 'left' ? 'nlab-arrow-left' : ''}`}>
                {s.arrow === 'right' ? '>>>' : '<<<'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
