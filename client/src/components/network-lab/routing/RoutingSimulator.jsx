import NetworkCanvas from './NetworkCanvas.jsx';
import ControlsPanel from './ControlsPanel.jsx';
import RouteTable from './RouteTable.jsx';
import PacketFlow from './PacketFlow.jsx';
import ProtocolSelector from './ProtocolSelector.jsx';

export default function RoutingSimulator() {
  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Network Routing Simulator</h3>
      <p className="nlab-routing-intro">
        Build a VPC-style network, define routes on routers, and send packets to visualize routing decisions with longest-prefix matching.
        Drag nodes to rearrange. The default preset shows a two-subnet topology.
      </p>

      <ProtocolSelector />

      <div className="nlab-routing-layout">
        <div className="nlab-routing-canvas-wrap">
          <NetworkCanvas />
        </div>
        <div className="nlab-routing-sidebar">
          <ControlsPanel />
          <RouteTable />
          <PacketFlow />
        </div>
      </div>
    </div>
  );
}
