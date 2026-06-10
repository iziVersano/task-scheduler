import { isValidIp, COMMON_PREFIXES } from './networkUtils.js';

export default function NetworkBuilder({ config, setConfig }) {
  const updateField = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const ipError = config.networkIp && !isValidIp(config.networkIp) ? 'Invalid IP' : '';
  const gwError = config.gateway && !isValidIp(config.gateway) ? 'Invalid IP' : '';
  const totalDevices = config.aptCount * config.devicesPerApt;

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Network Configuration</h3>
      <div className="nlab-config-grid">
        <div className="nlab-field">
          <label>Network Address</label>
          <input
            value={config.networkIp}
            onChange={e => updateField('networkIp', e.target.value)}
            placeholder="192.168.178.0"
          />
          {ipError && <span className="nlab-field-error">{ipError}</span>}
        </div>

        <div className="nlab-field">
          <label>Subnet Prefix</label>
          <select
            className="nlab-select"
            value={config.prefix}
            onChange={e => updateField('prefix', parseInt(e.target.value))}
          >
            {COMMON_PREFIXES.map(p => (
              <option key={p.prefix} value={p.prefix}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="nlab-field">
          <label>Gateway</label>
          <input
            value={config.gateway}
            onChange={e => updateField('gateway', e.target.value)}
            placeholder="192.168.178.1"
          />
          {gwError && <span className="nlab-field-error">{gwError}</span>}
        </div>

        <div className="nlab-field">
          <label>Apartments</label>
          <input
            type="number"
            min={1}
            max={200}
            value={config.aptCount}
            onChange={e => updateField('aptCount', Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
          />
        </div>

        <div className="nlab-field">
          <label>Devices per Apartment</label>
          <select
            className="nlab-select"
            value={config.devicesPerApt}
            onChange={e => updateField('devicesPerApt', parseInt(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n} device{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        <div className="nlab-field">
          <label>Total IPs needed</label>
          <div className="nlab-total-devices">{totalDevices} + 1 gateway = {totalDevices + 1}</div>
        </div>
      </div>
    </div>
  );
}
