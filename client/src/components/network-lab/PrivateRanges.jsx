import { PRIVATE_RANGES, SPECIAL_ADDRESSES } from './networkUtils.js';

export default function PrivateRanges() {
  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Private IP Ranges (RFC 1918)</h3>
      <p className="nlab-hint">These addresses are never routed on the public internet. Every home router (Fritzbox) uses them internally.</p>

      <table className="nlab-ranges-table">
        <thead>
          <tr>
            <th>Range (CIDR)</th>
            <th>From</th>
            <th>To</th>
            <th>Hosts</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>
          {PRIVATE_RANGES.map(r => (
            <tr key={r.range}>
              <td><code className="nlab-ip">{r.range}</code></td>
              <td><code className="nlab-ip">{r.from}</code></td>
              <td><code className="nlab-ip">{r.to}</code></td>
              <td>{r.hosts}</td>
              <td className="nlab-range-desc">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="nlab-sub-title">Special Addresses</h4>
      <div className="nlab-special-cards">
        {SPECIAL_ADDRESSES.map(a => (
          <div key={a.address} className="nlab-special-card">
            <code className="nlab-special-ip">{a.address}</code>
            <span className="nlab-special-name">{a.name}</span>
            <span className="nlab-special-desc">{a.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
