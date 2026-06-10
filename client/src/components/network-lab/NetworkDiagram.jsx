export default function NetworkDiagram({ gateway, devices }) {
  // Group by apartment
  const apartments = {};
  devices.forEach(d => {
    if (!apartments[d.apartmentNumber]) apartments[d.apartmentNumber] = [];
    apartments[d.apartmentNumber].push(d);
  });
  const aptNumbers = Object.keys(apartments).map(Number).sort((a, b) => a - b);
  const hasMultiple = aptNumbers.length > 0 && apartments[aptNumbers[0]].length > 1;

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Network Topology</h3>
      <div className="nlab-diagram">
        {/* Internet */}
        <div className="nlab-node nlab-internet">
          <span className="nlab-node-icon">&#127760;</span>
          <span className="nlab-node-label">Internet</span>
        </div>
        <div className="nlab-connector" />

        {/* Router */}
        <div className="nlab-node nlab-router">
          <span className="nlab-node-icon">&#128225;</span>
          <div className="nlab-node-info">
            <span className="nlab-node-label">Router (Gateway)</span>
            <code className="nlab-node-ip">{gateway}</code>
          </div>
        </div>
        <div className="nlab-connector" />

        {/* Switch */}
        <div className="nlab-node nlab-switch">
          <span className="nlab-node-icon">&#128260;</span>
          <span className="nlab-node-label">Switch</span>
        </div>

        {/* Device tree */}
        <div className="nlab-tree">
          {hasMultiple ? (
            // Grouped by apartment
            aptNumbers.map((aptNum, ai) => {
              const aptDevices = apartments[aptNum];
              return (
                <div key={aptNum} className="nlab-tree-group">
                  <div className="nlab-tree-item">
                    <span className="nlab-tree-branch">{ai === aptNumbers.length - 1 ? '\u2514' : '\u251C'}\u2500</span>
                    <span className="nlab-tree-apt-label">Apt-{aptNum} ({aptDevices.length} devices)</span>
                  </div>
                  <div className={`nlab-tree-sub ${ai === aptNumbers.length - 1 ? 'nlab-tree-sub-last' : ''}`}>
                    {aptDevices.map((device, di) => (
                      <div key={device.id} className="nlab-tree-item">
                        <span className="nlab-tree-branch">{di === aptDevices.length - 1 ? '\u2514' : '\u251C'}\u2500</span>
                        <div className="nlab-tree-device">
                          <span className="nlab-tree-name">{device.deviceType}</span>
                          <code className="nlab-tree-ip">{device.ipAddress}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            // Flat list
            devices.map((device, i) => (
              <div key={device.id} className="nlab-tree-item">
                <span className="nlab-tree-branch">{i === devices.length - 1 ? '\u2514' : '\u251C'}\u2500</span>
                <div className="nlab-tree-device">
                  <span className="nlab-tree-name">{device.deviceName}</span>
                  <code className="nlab-tree-ip">{device.ipAddress}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
