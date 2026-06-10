import { calculateSubnet, ipToBinary } from './networkUtils.js';

export default function SubnetCalculator({ networkIp, prefix }) {
  const info = calculateSubnet(networkIp, prefix);

  const rows = [
    ['Network Address', info.networkAddress],
    ['Subnet Mask', `${info.subnetMask} (/${info.prefix})`],
    ['First Host', info.firstHost],
    ['Last Host', info.lastHost],
    ['Broadcast', info.broadcast],
    ['Available Hosts', `${info.totalHosts} (256 - 2 = network + broadcast)`],
  ];

  const maskBinary = ipToBinary(info.subnetMask);

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Subnet Details</h3>
      <table className="nlab-info-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="nlab-info-label">{label}</td>
              <td className="nlab-info-value">{value}</td>
            </tr>
          ))}
          <tr>
            <td className="nlab-info-label">Mask (binary)</td>
            <td className="nlab-info-value nlab-mask-inline">
              {maskBinary.map((octet, i) => (
                <span key={i}>
                  {i > 0 && '.'}
                  {octet.split('').map((bit, j) => (
                    <span key={j} className={bit === '1' ? 'nlab-bit-net-inline' : 'nlab-bit-host-inline'}>{bit}</span>
                  ))}
                </span>
              ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
