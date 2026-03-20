import { useState, useCallback, useEffect } from 'react';
import NetworkBuilder from './NetworkBuilder.jsx';
import SubnetCalculator from './SubnetCalculator.jsx';
import DeviceManager from './DeviceManager.jsx';
import NetworkDiagram from './NetworkDiagram.jsx';
import PingSimulator from './PingSimulator.jsx';
import BinaryConverter from './BinaryConverter.jsx';
import PrivateRanges from './PrivateRanges.jsx';
import IPv6Preview from './IPv6Preview.jsx';
import NatDiagram from './NatDiagram.jsx';
import RoutingSimulator from './routing/RoutingSimulator.jsx';
import LdapTree from './LdapTree.jsx';
import RbacSim from './RbacSim.jsx';
import AuthFlow from './AuthFlow.jsx';
import ReverseProxy from './ReverseProxy.jsx';
import { generateDevices, isValidIp } from './networkUtils.js';

const DEFAULT_CONFIG = {
  networkIp: '192.168.178.0',
  prefix: 24,
  gateway: '192.168.178.1',
  aptCount: 20,
  devicesPerApt: 1,
};

export default function NetworkLabPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [devices, setDevices] = useState([]);
  const [tab, setTab] = useState('devices');

  const regenerate = useCallback(() => {
    if (!isValidIp(config.networkIp) || !isValidIp(config.gateway)) return;
    setDevices(generateDevices(config.networkIp, config.prefix, config.gateway, config.aptCount, config.devicesPerApt));
  }, [config.networkIp, config.prefix, config.gateway, config.aptCount, config.devicesPerApt]);

  useEffect(() => { regenerate(); }, [regenerate]);

  const tabs = [
    { id: 'devices', label: 'Devices' },
    { id: 'diagram', label: 'Topology' },
    { id: 'ping', label: 'Ping Sim' },
    { id: 'binary', label: 'Binary' },
    { id: 'ranges', label: 'IP Ranges' },
    { id: 'ipv6', label: 'IPv6' },
    { id: 'nat', label: 'NAT' },
    { id: 'routing', label: 'Routing' },
    { id: 'ldap', label: 'LDAP Tree' },
    { id: 'rbac', label: 'RBAC Sim' },
    { id: 'authflow', label: 'Auth Flow' },
    { id: 'reverseproxy', label: 'Reverse Proxy' },
  ];

  return (
    <div className="nlab-page">
      <div className="nlab-header-row">
        <h2 className="nlab-title">Network Simulation Lab</h2>
        <button className="btn btn-ghost" onClick={regenerate}>Regenerate Devices</button>
      </div>

      <div className="nlab-top-row">
        <NetworkBuilder config={config} setConfig={setConfig} />
        <SubnetCalculator networkIp={config.networkIp} prefix={config.prefix} />
      </div>

      <div className="nlab-tab-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nlab-tab ${tab === t.id ? 'nlab-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <DeviceManager devices={devices} setDevices={setDevices} prefix={config.prefix} gateway={config.gateway} />
      )}
      {tab === 'diagram' && (
        <NetworkDiagram gateway={config.gateway} devices={devices} />
      )}
      {tab === 'ping' && (
        <PingSimulator devices={devices} gateway={config.gateway} prefix={config.prefix} />
      )}
      {tab === 'binary' && (
        <BinaryConverter prefix={config.prefix} />
      )}
      {tab === 'ranges' && (
        <PrivateRanges />
      )}
      {tab === 'ipv6' && (
        <IPv6Preview />
      )}
      {tab === 'nat' && (
        <NatDiagram />
      )}
      {tab === 'routing' && (
        <RoutingSimulator />
      )}
      {tab === 'ldap' && (
        <LdapTree />
      )}
      {tab === 'rbac' && (
        <RbacSim />
      )}
      {tab === 'authflow' && (
        <AuthFlow />
      )}
      {tab === 'reverseproxy' && (
        <ReverseProxy />
      )}
    </div>
  );
}
