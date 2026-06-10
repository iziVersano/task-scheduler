import { useState } from 'react';
import { ipToBinary, binaryToIp, isValidIp, maskToBinary, getNetworkHostParts } from './networkUtils.js';

export default function BinaryConverter({ prefix }) {
  const [ip, setIp] = useState('192.168.10.1');

  const valid = isValidIp(ip);
  const octets = valid ? ipToBinary(ip) : [];
  const maskBin = maskToBinary(prefix);
  const parts = valid ? getNetworkHostParts(ip, prefix) : null;

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Binary / Decimal Converter</h3>
      <p className="nlab-hint">Each octet is 8 bits (0-255). The subnet mask determines which bits belong to the network (blue) vs host (red) portion.</p>

      <div className="nlab-field" style={{ maxWidth: 220, marginBottom: '1rem' }}>
        <label>IP Address</label>
        <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.10.1" />
      </div>

      {valid && (
        <>
          <div className="nlab-binary-grid">
            <div className="nlab-binary-header">
              <span>Decimal</span>
              <span>Binary (8 bits per octet)</span>
              <span>Powers of 2</span>
            </div>
            {octets.map((bin, i) => (
              <div key={i} className="nlab-binary-row">
                <span className="nlab-binary-decimal">{parseInt(bin, 2)}</span>
                <span className="nlab-binary-bits">
                  {bin.split('').map((bit, j) => {
                    const globalBit = i * 8 + j;
                    const isNetwork = globalBit < prefix;
                    return (
                      <span key={j} className={`nlab-bit ${isNetwork ? 'nlab-bit-net' : 'nlab-bit-host'}`}>
                        {bit}
                      </span>
                    );
                  })}
                </span>
                <span className="nlab-binary-powers">
                  {[128, 64, 32, 16, 8, 4, 2, 1].map((v, j) => (
                    <span key={j} className={`nlab-power ${bin[j] === '1' ? 'nlab-power-active' : ''}`}>
                      {bin[j] === '1' ? v : ''}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="nlab-mask-visual">
            <div className="nlab-mask-label">Subnet Mask /{prefix}:</div>
            <div className="nlab-mask-bits">
              {maskBin.split('').map((bit, i) => (
                <span key={i} className={`nlab-bit ${bit === '1' ? 'nlab-bit-net' : 'nlab-bit-host'}`}>
                  {bit}
                </span>
              ))}
            </div>
            <div className="nlab-mask-legend">
              <span className="nlab-legend-net">{prefix} network bits</span>
              <span className="nlab-legend-host">{32 - prefix} host bits</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
