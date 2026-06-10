import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { loadProtocol } from '../../../store/simulatorSlice';

const PROTOCOLS = [
  {
    id: 'rip',
    name: 'RIP',
    fullName: 'Routing Information Protocol',
    scope: 'Small, Private Networks',
    color: '#10b981',
    type: 'Distance Vector',
    metric: 'Hop Count (max 15)',
    convergence: 'Slow (30s updates)',
    scalability: 'Low — max 15 hops',
    useCase: 'Small office, home networks, lab environments',
    pros: ['Easy to configure', 'Low resource usage', 'Supported everywhere'],
    cons: ['Max 15 hops', 'Slow convergence', 'No VLSM (v1)', 'Bandwidth-unaware'],
    example: 'A small company with 3 routers and 5 subnets',
    commands: ['router rip', 'version 2', 'network 10.0.0.0', 'no auto-summary'],
  },
  {
    id: 'eigrp-ospf',
    name: 'EIGRP / OSPF',
    fullName: 'Enhanced Interior Gateway / Open Shortest Path First',
    scope: 'Large, Private Networks',
    color: '#3b82f6',
    type: 'Advanced Distance Vector / Link-State',
    metric: 'Composite (EIGRP) / Cost based on bandwidth (OSPF)',
    convergence: 'Fast (sub-second with EIGRP, seconds with OSPF)',
    scalability: 'High — supports thousands of routes',
    useCase: 'Enterprise campuses, data centers, large branch networks',
    pros: ['Fast convergence', 'Scalable', 'Supports VLSM & CIDR', 'Load balancing'],
    cons: ['More complex to configure', 'EIGRP is Cisco-proprietary (mostly)', 'OSPF requires area design'],
    example: 'An enterprise with 50+ routers across multiple sites',
    commands: [
      '# OSPF',
      'router ospf 1',
      'network 10.0.0.0 0.0.255.255 area 0',
      '',
      '# EIGRP',
      'router eigrp 100',
      'network 10.0.0.0',
    ],
  },
  {
    id: 'bgp',
    name: 'BGP',
    fullName: 'Border Gateway Protocol',
    scope: 'Internet & Private (iBGP)',
    color: '#ef4444',
    type: 'Path Vector',
    metric: 'AS Path, Policies, Attributes',
    convergence: 'Slow (designed for stability over speed)',
    scalability: 'Internet-scale — 900k+ routes in global table',
    useCase: 'ISPs, multi-homed networks, cloud providers, internet backbone',
    pros: ['Internet-scale', 'Policy-based routing', 'Multi-homed support', 'AS path control'],
    cons: ['Complex configuration', 'Slow convergence by design', 'Security concerns (hijacking)'],
    example: 'An ISP peering with other ISPs, or a company with two internet links',
    commands: ['router bgp 65001', 'neighbor 203.0.113.1 remote-as 65002', 'network 198.51.100.0 mask 255.255.255.0'],
  },
];

const SCENARIOS = [
  { network: 'Home office — 1 router, 3 devices', answer: 'rip', reason: 'Simple, small network — RIP is sufficient' },
  { network: 'University campus — 30 buildings, 200 subnets', answer: 'eigrp-ospf', reason: 'Large private network needs fast convergence and scalability' },
  { network: 'ISP connecting to 5 other providers', answer: 'bgp', reason: 'Inter-AS routing requires BGP for policy control' },
  { network: 'Branch office — 5 routers, 10 VLANs', answer: 'rip', reason: 'Small enough for RIP, but OSPF would also work' },
  { network: 'Multi-site enterprise with MPLS backbone', answer: 'eigrp-ospf', reason: 'OSPF areas map well to MPLS topology' },
  { network: 'Cloud provider with dual ISP uplinks', answer: 'bgp', reason: 'Multi-homed internet requires BGP for path selection' },
  { network: 'Data center with 500 servers in 20 racks', answer: 'eigrp-ospf', reason: 'OSPF with stub areas keeps routing table manageable' },
];

function ProtocolCard({ protocol, isSelected, onClick }) {
  return (
    <div
      className={`nlab-protocol-card ${isSelected ? 'nlab-protocol-card-active' : ''}`}
      style={{ '--proto-color': protocol.color }}
      onClick={onClick}
    >
      <div className="nlab-protocol-card-header">
        <span className="nlab-protocol-badge" style={{ background: protocol.color + '22', color: protocol.color }}>
          {protocol.name}
        </span>
        <span className="nlab-protocol-scope">{protocol.scope}</span>
      </div>
      <h4 className="nlab-protocol-fullname">{protocol.fullName}</h4>
      <div className="nlab-protocol-meta">
        <span>Type: {protocol.type}</span>
        <span>Metric: {protocol.metric}</span>
      </div>
    </div>
  );
}

function ProtocolDetail({ protocol }) {
  return (
    <div className="nlab-protocol-detail">
      <div className="nlab-protocol-detail-grid">
        <div className="nlab-protocol-detail-item">
          <span className="nlab-protocol-detail-label">Convergence</span>
          <span>{protocol.convergence}</span>
        </div>
        <div className="nlab-protocol-detail-item">
          <span className="nlab-protocol-detail-label">Scalability</span>
          <span>{protocol.scalability}</span>
        </div>
        <div className="nlab-protocol-detail-item">
          <span className="nlab-protocol-detail-label">Use Case</span>
          <span>{protocol.useCase}</span>
        </div>
      </div>

      <div className="nlab-protocol-pros-cons">
        <div>
          <h5 className="nlab-proto-list-title" style={{ color: '#10b981' }}>Advantages</h5>
          <ul className="nlab-proto-list">
            {protocol.pros.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        <div>
          <h5 className="nlab-proto-list-title" style={{ color: '#ef4444' }}>Disadvantages</h5>
          <ul className="nlab-proto-list">
            {protocol.cons.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      </div>

      <div className="nlab-protocol-example">
        <span className="nlab-protocol-detail-label">Example Scenario</span>
        <p>{protocol.example}</p>
      </div>

      <div className="nlab-protocol-commands">
        <span className="nlab-protocol-detail-label">Configuration Commands</span>
        <pre className="nlab-protocol-pre">
          {protocol.commands.join('\n')}
        </pre>
      </div>
    </div>
  );
}

export default function ProtocolSelector() {
  const dispatch = useDispatch();
  const [selected, setSelected] = useState('rip');
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [showQuiz, setShowQuiz] = useState(false);

  const activeProtocol = PROTOCOLS.find(p => p.id === selected);

  const handleSelectProtocol = (id) => {
    setSelected(id);
    dispatch(loadProtocol(id));
  };
  const scenario = SCENARIOS[quizIdx];

  const handleQuizAnswer = (id) => {
    setQuizAnswer(id);
  };

  const nextScenario = () => {
    setQuizAnswer(null);
    setQuizIdx((quizIdx + 1) % SCENARIOS.length);
  };

  return (
    <div className="nlab-protocol-section">
      <div className="nlab-protocol-header">
        <div>
          <h4 className="nlab-protocol-title">Protocol Selection Guide</h4>
          <p className="nlab-protocol-subtitle">Choose the right routing protocol based on network size and scope</p>
        </div>
        <button
          className={`btn-sm ${showQuiz ? 'btn-neutral' : 'btn-primary-sm'}`}
          onClick={() => setShowQuiz(!showQuiz)}
        >
          {showQuiz ? 'Back to Guide' : 'Practice Quiz'}
        </button>
      </div>

      {!showQuiz ? (
        <>
          {/* Protocol decision diagram */}
          <div className="nlab-protocol-decision">
            <div className="nlab-decision-flow">
              <div className="nlab-decision-node nlab-decision-start">Network Size?</div>
              <div className="nlab-decision-branches">
                <div className="nlab-decision-branch" style={{ '--branch-color': '#10b981' }}>
                  <div className="nlab-decision-arrow">Small / Private</div>
                  <div className="nlab-decision-result" style={{ borderColor: '#10b981' }}>RIP</div>
                </div>
                <div className="nlab-decision-branch" style={{ '--branch-color': '#3b82f6' }}>
                  <div className="nlab-decision-arrow">Large / Private</div>
                  <div className="nlab-decision-result" style={{ borderColor: '#3b82f6' }}>EIGRP / OSPF</div>
                </div>
                <div className="nlab-decision-branch" style={{ '--branch-color': '#ef4444' }}>
                  <div className="nlab-decision-arrow">Internet / Multi-AS</div>
                  <div className="nlab-decision-result" style={{ borderColor: '#ef4444' }}>BGP</div>
                </div>
              </div>
            </div>
          </div>

          {/* Protocol cards — clicking loads matching topology below */}
          <div className="nlab-protocol-cards">
            {PROTOCOLS.map(p => (
              <ProtocolCard
                key={p.id}
                protocol={p}
                isSelected={selected === p.id}
                onClick={() => handleSelectProtocol(p.id)}
              />
            ))}
          </div>

          <p className="nlab-protocol-topology-hint">
            The network topology below reflects a typical <strong>{activeProtocol?.name}</strong> setup — try sending a packet to see how routing works.
          </p>

          {/* Detail panel */}
          {activeProtocol && <ProtocolDetail protocol={activeProtocol} />}
        </>
      ) : (
        /* Quiz mode */
        <div className="nlab-protocol-quiz">
          <div className="nlab-quiz-scenario">
            <span className="nlab-quiz-label">Scenario {quizIdx + 1}/{SCENARIOS.length}</span>
            <p className="nlab-quiz-question">{scenario.network}</p>
            <p className="nlab-quiz-prompt">Which routing protocol would you choose?</p>
          </div>

          <div className="nlab-quiz-options">
            {PROTOCOLS.map(p => {
              let cls = 'nlab-quiz-option';
              if (quizAnswer) {
                if (p.id === scenario.answer) cls += ' nlab-quiz-correct';
                else if (p.id === quizAnswer && quizAnswer !== scenario.answer) cls += ' nlab-quiz-wrong';
              }
              return (
                <button
                  key={p.id}
                  className={cls}
                  onClick={() => handleQuizAnswer(p.id)}
                  disabled={!!quizAnswer}
                >
                  <span className="nlab-protocol-badge" style={{ background: p.color + '22', color: p.color }}>
                    {p.name}
                  </span>
                  <span>{p.scope}</span>
                </button>
              );
            })}
          </div>

          {quizAnswer && (
            <div className={`nlab-quiz-feedback ${quizAnswer === scenario.answer ? 'nlab-quiz-feedback-ok' : 'nlab-quiz-feedback-err'}`}>
              <p>{quizAnswer === scenario.answer ? 'Correct!' : `Not quite — the best answer is ${PROTOCOLS.find(p => p.id === scenario.answer)?.name}`}</p>
              <p className="nlab-quiz-reason">{scenario.reason}</p>
              <button className="btn-sm btn-ok" onClick={nextScenario}>Next Scenario</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
