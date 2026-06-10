export default function IPv6Preview() {
  const examples = [
    { addr: '::1', name: 'Loopback', desc: 'Same as 127.0.0.1 in IPv4' },
    { addr: 'fe80::1', name: 'Link-Local', desc: 'Auto-configured on every interface, not routed' },
    { addr: '2001:db8::1', name: 'Global Unicast', desc: 'Publicly routable, 1:1 communication' },
    { addr: 'ff02::1', name: 'Multicast (all nodes)', desc: 'Replaces broadcast in IPv6' },
  ];

  const rules = [
    { rule: 'Leading zeros can be dropped', before: '2001:0db8:0000:0001', after: '2001:db8:0:1' },
    { rule: 'One group of consecutive all-zero blocks can be replaced with ::', before: '2001:0db8:0000:0000:0000:0000:0000:0001', after: '2001:db8::1' },
    { rule: ':: can only appear ONCE', before: '2001:0000:0000:0001:0000:0000:0000:0001', after: '2001::1:0:0:0:1 (not 2001::1::1)' },
  ];

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">IPv6 Overview</h3>
      <p className="nlab-hint">128-bit addresses written in hexadecimal. Much larger address space than IPv4 (4.3 billion vs 340 undecillion).</p>

      <div className="nlab-ipv6-comparison">
        <div className="nlab-ipv6-box">
          <span className="nlab-ipv6-label">IPv4</span>
          <code>192.168.10.1</code>
          <span className="nlab-ipv6-detail">32 bits, 4 decimal octets</span>
        </div>
        <span className="nlab-ipv6-vs">vs</span>
        <div className="nlab-ipv6-box">
          <span className="nlab-ipv6-label">IPv6</span>
          <code>2001:0db8:85a3:0000:0000:8a2e:0370:7334</code>
          <span className="nlab-ipv6-detail">128 bits, 8 hex groups of 16 bits</span>
        </div>
      </div>

      <h4 className="nlab-sub-title">Abbreviation Rules</h4>
      <div className="nlab-ipv6-rules">
        {rules.map((r, i) => (
          <div key={i} className="nlab-ipv6-rule">
            <span className="nlab-rule-name">{r.rule}</span>
            <div className="nlab-rule-example">
              <code className="nlab-rule-before">{r.before}</code>
              <span className="nlab-rule-arrow">{'->'}</span>
              <code className="nlab-rule-after">{r.after}</code>
            </div>
          </div>
        ))}
      </div>

      <h4 className="nlab-sub-title">Special Addresses</h4>
      <div className="nlab-special-cards">
        {examples.map(e => (
          <div key={e.addr} className="nlab-special-card">
            <code className="nlab-special-ip">{e.addr}</code>
            <span className="nlab-special-name">{e.name}</span>
            <span className="nlab-special-desc">{e.desc}</span>
          </div>
        ))}
      </div>

      <div className="nlab-ipv6-benefits">
        <h4 className="nlab-sub-title">Key Differences from IPv4</h4>
        <ul className="nlab-benefit-list">
          <li>No broadcast — replaced by multicast (more efficient)</li>
          <li>No NAT needed — enough addresses for every device</li>
          <li>Auto-configuration (SLAAC) — devices can self-assign addresses</li>
          <li>IPsec built-in — encryption support by default</li>
          <li>Simplified headers — more efficient packet processing</li>
        </ul>
      </div>
    </div>
  );
}
