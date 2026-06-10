import { useState } from 'react';
import { isValidIp, isInSameSubnet } from './networkUtils.js';

export default function DeviceManager({ devices, setDevices, prefix, gateway }) {
  const [editingId, setEditingId] = useState(null);
  const [editIp, setEditIp] = useState('');
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const startEdit = (device) => {
    setEditingId(device.id);
    setEditIp(device.ipAddress);
    setEditName(device.deviceName);
    setError('');
  };

  const saveEdit = (device) => {
    if (!isValidIp(editIp)) {
      setError('Invalid IP address');
      return;
    }
    if (!isInSameSubnet(editIp, gateway, prefix)) {
      setError('IP not in the same subnet');
      return;
    }
    if (editIp === gateway) {
      setError('Cannot use gateway IP');
      return;
    }
    if (devices.some(d => d.id !== device.id && d.ipAddress === editIp)) {
      setError('IP already assigned');
      return;
    }

    setDevices(devices.map(d =>
      d.id === device.id ? { ...d, ipAddress: editIp, deviceName: editName } : d
    ));
    setEditingId(null);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
  };

  // Group by apartment
  const apartments = {};
  devices.forEach(d => {
    if (!apartments[d.apartmentNumber]) apartments[d.apartmentNumber] = [];
    apartments[d.apartmentNumber].push(d);
  });
  const aptNumbers = Object.keys(apartments).map(Number).sort((a, b) => a - b);
  const hasMultiplePerApt = aptNumbers.length > 0 && apartments[aptNumbers[0]].length > 1;

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">
        Devices ({devices.length})
        {hasMultiplePerApt && (
          <span className="nlab-panel-subtitle"> — {aptNumbers.length} apartments</span>
        )}
      </h3>
      {error && <div className="nlab-error">{error}</div>}
      <div className="nlab-device-table-wrap">
        <table className="nlab-device-table">
          <thead>
            <tr>
              <th>Apt</th>
              <th>Device Name</th>
              {hasMultiplePerApt && <th>Type</th>}
              <th>IP Address</th>
              <th>MAC Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {aptNumbers.map(aptNum => {
              const aptDevices = apartments[aptNum];
              return aptDevices.map((device, idx) => (
                <tr key={device.id} className={idx === 0 && hasMultiplePerApt ? 'nlab-apt-first' : ''}>
                  <td className="nlab-device-num">{idx === 0 ? aptNum : ''}</td>
                  <td>
                    {editingId === device.id
                      ? <input className="nlab-inline-input" value={editName} onChange={e => setEditName(e.target.value)} />
                      : <span className="nlab-device-name">{device.deviceName}</span>
                    }
                  </td>
                  {hasMultiplePerApt && (
                    <td><span className="nlab-device-type">{device.deviceType}</span></td>
                  )}
                  <td>
                    {editingId === device.id
                      ? <input className="nlab-inline-input nlab-ip-input" value={editIp} onChange={e => setEditIp(e.target.value)} />
                      : <code className="nlab-ip">{device.ipAddress}</code>
                    }
                  </td>
                  <td><code className="nlab-mac">{device.macAddress}</code></td>
                  <td>
                    {editingId === device.id ? (
                      <div className="nlab-edit-actions">
                        <button className="btn-sm btn-ok" onClick={() => saveEdit(device)}>Save</button>
                        <button className="btn-sm btn-neutral" onClick={cancelEdit}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn-sm btn-neutral" onClick={() => startEdit(device)}>Edit</button>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
