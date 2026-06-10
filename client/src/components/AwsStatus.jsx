import { useState, useEffect, useCallback } from 'react';

const BUDGET = 5.0;

// ── primitives ────────────────────────────────────────────────────────────────

function Badge({ ok, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.18rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
      background: ok ? '#14532d33' : '#7f1d1d33',
      color: ok ? '#4ade80' : '#f87171',
      border: `1px solid ${ok ? '#166534' : '#991b1b'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#4ade80' : '#f87171', display: 'inline-block' }} />
      {label}
    </span>
  );
}

function Row({ label, value, sub, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.28rem 0', borderBottom: '1px solid #0f172a' }}>
      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.82rem', fontFamily: mono ? 'monospace' : undefined }}>
        {value}{sub && <span style={{ color: '#475569', fontWeight: 400, fontSize: '0.75rem', marginLeft: '0.3rem' }}>{sub}</span>}
      </span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
      {children}
    </div>
  );
}

// ── panel: the generic container ──────────────────────────────────────────────

function Panel({ title, icon, accent, children, error, fullWidth }) {
  const border = accent || '#334155';
  return (
    <div style={{
      background: '#131c2e', border: `1px solid ${border}`, borderTop: `2px solid ${border}`,
      borderRadius: 10, padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem',
      gridColumn: fullWidth ? '1 / -1' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.1rem' }}>
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e2e8f0', letterSpacing: '0.01em' }}>{title}</span>
      </div>
      {error
        ? <p style={{ color: '#f87171', fontSize: '0.8rem', margin: 0 }}>⚠ {error}</p>
        : children}
    </div>
  );
}

// ── nested sub-panel (e.g. nginx inside EC2) ──────────────────────────────────

function SubPanel({ title, icon, children }) {
  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderLeft: '3px solid #3b82f6', borderRadius: 7, padding: '0.7rem 0.85rem', marginTop: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem' }}>{icon}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '0.03em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── billing bar ───────────────────────────────────────────────────────────────

function BillingBar({ amount }) {
  const pct = Math.min((amount / BUDGET) * 100, 100);
  const color = pct > 90 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#4ade80';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>This month</span>
        <span style={{ color, fontWeight: 700, fontSize: '0.88rem' }}>${amount} <span style={{ color: '#475569', fontWeight: 400, fontSize: '0.75rem' }}>/ ${BUDGET} budget</span></span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 999, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 3 }}>{pct.toFixed(1)}% of budget used</div>
    </div>
  );
}

// ── IAM expandable section ────────────────────────────────────────────────────

function IamDetail({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.73rem' }}>
      <span style={{ color: '#334155' }}>{label}:</span>
      <span style={{ color: '#94a3b8' }}>{value}</span>
    </div>
  );
}

function IamSection({ label, count, items, renderItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #0f172a', padding: '0.28rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.82rem' }}>{count}</span>
          {count > 0 && (
            <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}>
              {open ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>
      {open && items?.length > 0 && (
        <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: '#0a1120', borderRadius: 6, padding: '0.45rem 0.65rem', borderLeft: '2px solid #1e3a5f' }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.2rem' }}>• {item.name}</div>
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AwsStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/aws-status');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <span className="spinner" />
    </div>
  );

  if (error) return (
    <div className="alert alert-error" style={{ margin: '2rem auto', maxWidth: 600 }}>
      ⚠ {error} — make sure the server is running and AWS credentials are set.
    </div>
  );

  const { ec2, s3, lambda, guardduty, billing, iam, vpc, nginx, ebs } = data;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1140, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.25rem', fontWeight: 700 }}>☁ AWS Account Status</h2>
          <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.78rem' }}>
            Account 302263067280 · us-east-1
            {lastRefresh && ` · Last updated ${lastRefresh.toLocaleTimeString()}`}
            {data.cached && ' · (cached)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="https://302263067280.signin.aws.amazon.com/console" target="_blank" rel="noreferrer"
            className="btn btn-primary" style={{ fontSize: '0.82rem', textDecoration: 'none' }}>
            ☁ Open Console
          </a>
          <button className="btn btn-ghost" onClick={fetchStatus} style={{ fontSize: '0.82rem' }}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

        {/* ── Tier label: Account ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7c3aed' }}>Account</span>
          <div style={{ flex: 1, height: 1, background: '#1e1b4b' }} />
        </div>

        {/* Row 1 — Billing + Security */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>

          <Panel title="Billing" icon="💰" accent="#7c3aed" error={billing?.error}>
            {billing && <BillingBar amount={parseFloat(billing.amount)} />}
            {billing && <Row label="Budget" value={`$${BUDGET}`} sub="/ month" />}
            {billing && <Row label="Period" value={billing.start} sub={`→ ${billing.end}`} />}
          </Panel>

          <Panel title="IAM" icon="🔐" accent="#7c3aed" error={iam?.error}>
            {iam && <>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <Badge ok={iam.accountMfaEnabled} label={iam.accountMfaEnabled ? 'Root MFA On' : 'Root MFA Off'} />
                <Badge ok={iam.mfaDevices > 0} label={`${iam.mfaDevices} MFA Device${iam.mfaDevices !== 1 ? 's' : ''}`} />
              </div>
              <IamSection label="Users" count={iam.users} items={iam.userList} renderItem={u => <>
                <IamDetail label="Created" value={u.created ? new Date(u.created).toLocaleDateString() : null} />
                <IamDetail label="Last login" value={u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'} />
                <IamDetail label="Console access" value={u.consoleAccess ? '✅ Yes' : '❌ No'} />
                <IamDetail label="Groups" value={u.groups?.length ? u.groups.join(', ') : 'None'} />
              </>} />
              <IamSection label="Groups" count={iam.groups} items={iam.groupList} renderItem={g => <>
                <IamDetail label="Created" value={g.created ? new Date(g.created).toLocaleDateString() : null} />
                <IamDetail label="Path" value={g.path !== '/' ? g.path : null} />
              </>} />
              <IamSection label="Roles" count={iam.roles} items={iam.roleList} renderItem={r => <>
                <IamDetail label="Created" value={r.created ? new Date(r.created).toLocaleDateString() : null} />
                <IamDetail label="Last used" value={r.lastUsed ? new Date(r.lastUsed).toLocaleDateString() : 'Never'} />
                <IamDetail label="Region" value={r.lastUsedRegion} />
                <IamDetail label="Description" value={r.description} />
              </>} />
              <IamSection label="Policies" count={iam.policies} items={iam.policyList} renderItem={p => <>
                <IamDetail label="Attached to" value={`${p.attached} entit${p.attached !== 1 ? 'ies' : 'y'}`} />
                <IamDetail label="Created" value={p.created ? new Date(p.created).toLocaleDateString() : null} />
                <IamDetail label="Updated" value={p.updated ? new Date(p.updated).toLocaleDateString() : null} />
                <IamDetail label="Description" value={p.description} />
              </>} />
            </>}
          </Panel>

          <Panel title="GuardDuty" icon="🛡" accent="#7c3aed" error={guardduty?.error}>
            {guardduty && <>
              <Badge ok={guardduty.enabled} label={guardduty.enabled ? 'Threat Detection Active' : 'Disabled'} />
              {guardduty.detectorId && <Row label="Detector" value={guardduty.detectorId.slice(0, 16) + '…'} mono />}
              {guardduty.updatedAt && <Row label="Updated" value={new Date(guardduty.updatedAt).toLocaleDateString()} />}
            </>}
          </Panel>

        </div>

        {/* ── Tier label: Compute ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0ea5e9' }}>Compute</span>
          <div style={{ flex: 1, height: 1, background: '#082f49' }} />
        </div>

        {/* Row 2 — EC2 (full width, nginx nested inside) */}
        <Panel title="EC2 Instances" icon="🖥" accent="#0ea5e9" error={ec2?.error} fullWidth>
          {ec2 && <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Badge ok={ec2.running > 0} label={`${ec2.running} Running`} />
              {ec2.stopped > 0 && <Badge ok={false} label={`${ec2.stopped} Stopped`} />}
              <span style={{ color: '#475569', fontSize: '0.78rem', alignSelf: 'center' }}>· {ec2.total} total</span>
            </div>

            {ec2.total === 0 && <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>No instances yet.</p>}

            {ec2.instances?.slice(0, 5).map(i => (
              <div key={i.id} style={{ background: '#0d1a2d', border: '1px solid #1e3a5f', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '0.25rem' }}>
                {/* Instance header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 700 }}>{i.name !== '—' ? i.name : i.id}</span>
                  <Badge ok={i.state === 'running'} label={i.state} />
                </div>
                {/* Instance meta grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.1rem' }}>
                  <Row label="Type" value={i.type} />
                  <Row label="Zone" value={i.az} />
                  {i.publicIp  && <Row label="Public IP"  value={i.publicIp}  mono />}
                  {i.privateIp && <Row label="Private IP" value={i.privateIp} mono />}
                  <Row label="Launched" value={new Date(i.launched).toLocaleString()} />
                  <Row label="Instance ID" value={i.id} mono />
                </div>

                {/* EBS volumes attached to this instance */}
                {ebs && !ebs.error && (() => {
                  const attached = ebs.volumes?.filter(v =>
                    v.attachments.some(a => a.instanceId === i.id)
                  ) || [];
                  const rootVol = attached.find(v => v.attachments.some(a => a.device.includes('sda') || a.device.includes('xvda') || a.device === '/dev/nvme0n1'));
                  const dataVols = attached.filter(v => v !== rootVol);
                  return (
                    <SubPanel title={`EBS Volumes (${attached.length})`} icon="💾">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {attached.length === 0 && (
                          <span style={{ color: '#334155', fontSize: '0.75rem' }}>No volumes attached.</span>
                        )}
                        {attached.map(v => {
                          const att = v.attachments.find(a => a.instanceId === i.id);
                          const isRoot = v === rootVol;
                          return (
                            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', borderBottom: '1px solid #0f172a' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <code style={{ color: '#7dd3fc', fontSize: '0.72rem', fontFamily: 'monospace' }}>{att?.device}</code>
                                {isRoot && <span style={{ fontSize: '0.65rem', color: '#475569', background: '#0f172a', padding: '0.05rem 0.35rem', borderRadius: 4 }}>root</span>}
                                {!isRoot && <span style={{ fontSize: '0.65rem', color: '#4ade80', background: '#052e16', padding: '0.05rem 0.35rem', borderRadius: 4 }}>data</span>}
                              </div>
                              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{v.type}</span>
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>{v.sizeGb} GB</span>
                                <Badge ok={att?.state === 'attached'} label={att?.state} />
                              </div>
                            </div>
                          );
                        })}
                        {dataVols.length === 0 && (
                          <span style={{ color: '#475569', fontSize: '0.72rem', marginTop: '0.15rem' }}>⚠ No extra EBS volume — only root disk.</span>
                        )}
                      </div>
                    </SubPanel>
                  );
                })()}

                {/* Nginx nested inside the instance that runs it */}
                {nginx && (nginx.host === i.publicIp || nginx.host === '3.87.87.182') && (
                  <SubPanel title="nginx web server" icon="⚙">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '0.28rem 0', borderBottom: '1px solid #0f172a' }}>
                        <span style={{ color: '#64748b', fontSize: '0.8rem', marginRight: 'auto' }}>Status</span>
                        <Badge ok={nginx.running} label={nginx.running ? 'active (running)' : nginx.status} />
                      </div>
                      {nginx.pid   && <Row label="PID"          value={nginx.pid}  mono />}
                      {nginx.since && <Row label="Running since" value={new Date(nginx.since).toLocaleString()} />}
                      <Row label="Serving" value={`http://${nginx.host}`} mono />
                    </div>
                  </SubPanel>
                )}
              </div>
            ))}

            {/* Lambda nested under compute */}
            {lambda && !lambda.error && lambda.total > 0 && (
              <SubPanel title="Lambda Functions" icon="λ">
                <Row label="Total functions" value={lambda.total} />
                {lambda.functions?.slice(0, 5).map(f => (
                  <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid #0f172a' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{f.name}</span>
                    <span style={{ color: '#475569', fontSize: '0.72rem' }}>{f.runtime}</span>
                  </div>
                ))}
              </SubPanel>
            )}
            {lambda && !lambda.error && lambda.total === 0 && (
              <SubPanel title="Lambda Functions" icon="λ">
                <p style={{ color: '#334155', fontSize: '0.78rem', margin: 0 }}>No functions deployed.</p>
              </SubPanel>
            )}
          </>}
        </Panel>

        {/* ── Tier label: Networking ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#10b981' }}>Networking</span>
          <div style={{ flex: 1, height: 1, background: '#064e3b' }} />
        </div>

        {/* Row 3 — VPC full width */}
        <Panel title="VPC & Networking" icon="🌐" accent="#10b981" error={vpc?.error} fullWidth>
          {vpc && <>
            <Row label="Total VPCs" value={vpc.total} />
            {vpc.total === 0 && <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>No VPCs found.</p>}
            {vpc.vpcs?.map(v => (
              <div key={v.id} style={{ background: '#0d1a2d', border: '1px solid #064e3b', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.88rem' }}>
                    {v.name !== '—' ? v.name : v.id}
                    {v.isDefault && <span style={{ marginLeft: '0.5rem', color: '#334155', fontSize: '0.7rem', fontWeight: 400 }}>(default)</span>}
                  </span>
                  <Badge ok={v.state === 'available'} label={v.state} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.1rem', marginBottom: '0.5rem' }}>
                  <Row label="CIDR" value={v.cidr} mono />
                  <Row label="Subnets" value={v.subnets.length} />
                  {v.internetGateway && <Row label="Internet Gateway" value={v.internetGateway.id} mono />}
                </div>

                {v.subnets.length > 0 && (
                  <>
                    <SectionLabel>Subnets</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.3rem' }}>
                      {v.subnets.map(s => (
                        <div key={s.id} style={{ background: '#0a1120', borderRadius: 6, padding: '0.4rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #0f2d1a' }}>
                          <div>
                            <div style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>{s.name !== '—' ? s.name : s.id}</div>
                            <div style={{ color: '#334155', fontSize: '0.7rem', fontFamily: 'monospace' }}>{s.cidr} · {s.az}</div>
                          </div>
                          <Badge ok={s.public} label={s.public ? 'Public' : 'Private'} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {v.routeTables.length > 0 && (
                  <details style={{ marginTop: '0.6rem' }}>
                    <summary style={{ color: '#334155', fontSize: '0.73rem', cursor: 'pointer' }}>Route Tables ({v.routeTables.length})</summary>
                    {v.routeTables.map(rt => (
                      <div key={rt.id} style={{ marginTop: '0.3rem', background: '#0a1120', borderRadius: 6, padding: '0.35rem 0.6rem' }}>
                        <div style={{ color: '#475569', fontSize: '0.73rem', marginBottom: '0.2rem' }}>{rt.id} {rt.main && <span style={{ color: '#f59e0b' }}>(main)</span>}</div>
                        {rt.routes?.filter(r => r.destination).map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                            <span style={{ color: '#334155', fontFamily: 'monospace' }}>{r.destination}</span>
                            <span style={{ color: r.target === 'local' ? '#4ade80' : '#60a5fa', fontFamily: 'monospace' }}>{r.target}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
          </>}
        </Panel>

        {/* ── Tier label: Storage ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f59e0b' }}>Storage</span>
          <div style={{ flex: 1, height: 1, background: '#451a03' }} />
        </div>

        {/* Row 4 — S3 + EBS side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Panel title="S3 Buckets" icon="🪣" accent="#f59e0b" error={s3?.error}>
          {s3 && <>
            <Row label="Total buckets" value={s3.total} />
            {s3.total === 0 && <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>No buckets yet.</p>}
            {s3.buckets?.slice(0, 5).map(b => (
              <div key={b.name} style={{ background: '#0d1a2d', border: '1px solid #451a03', borderRadius: 8, padding: '0.6rem 0.9rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.85rem' }}>{b.name}</div>
                  <div style={{ color: '#475569', fontSize: '0.73rem', marginTop: '0.1rem' }}>
                    {b.region && `📍 ${b.region}`} · ACL: {b.acl} · {new Date(b.created).toLocaleDateString()}
                  </div>
                </div>
                <Badge ok={!b.isPublic} label={b.isPublic ? '🌐 Public' : '🔒 Private'} />
              </div>
            ))}
          </>}
        </Panel>

        <Panel title="EBS Volumes" icon="💾" accent="#f59e0b" error={ebs?.error}>
          {ebs && <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Badge ok={ebs.total > 0} label={`${ebs.total} Volume${ebs.total !== 1 ? 's' : ''}`} />
              {ebs.volumes?.filter(v => v.state === 'in-use').length > 0 && (
                <Badge ok label={`${ebs.volumes.filter(v => v.state === 'in-use').length} In-use`} />
              )}
              {ebs.volumes?.filter(v => v.state === 'available').length > 0 && (
                <Badge ok={false} label={`${ebs.volumes.filter(v => v.state === 'available').length} Unattached`} />
              )}
            </div>
            {ebs.total === 0 && <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>No volumes found.</p>}
            {ebs.volumes?.map(v => {
              const isRoot = v.attachments.some(a =>
                a.device?.includes('sda') || a.device?.includes('xvda') || a.device === '/dev/nvme0n1'
              );
              return (
                <div key={v.id} style={{ background: '#0d1a2d', border: `1px solid ${isRoot ? '#1e3a5f' : '#451a03'}`, borderTop: `2px solid ${isRoot ? '#0ea5e9' : '#f59e0b'}`, borderRadius: 8, padding: '0.7rem 0.9rem', marginTop: '0.35rem' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>
                        {v.name !== '—' ? v.name : v.id}
                      </span>
                      <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.4rem', borderRadius: 4, background: isRoot ? '#082f49' : '#052e16', color: isRoot ? '#38bdf8' : '#4ade80', fontWeight: 600 }}>
                        {isRoot ? 'root' : 'data'}
                      </span>
                    </div>
                    <Badge ok={v.state === 'in-use'} label={v.state} />
                  </div>

                  {/* Volume ID */}
                  <div style={{ color: '#334155', fontFamily: 'monospace', fontSize: '0.72rem', marginBottom: '0.45rem' }}>{v.id}</div>

                  {/* Core specs grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.1rem' }}>
                    <Row label="Size"       value={`${v.sizeGb} GB`} />
                    <Row label="Type"       value={v.type} mono />
                    <Row label="AZ"         value={v.az} />
                    <Row label="Encrypted"  value={v.encrypted ? '✅ Yes' : '❌ No'} />
                    {v.iops        && <Row label="IOPS"        value={v.iops.toLocaleString()} />}
                    {v.throughput  && <Row label="Throughput"  value={`${v.throughput} MB/s`} />}
                    {v.multiAttach && <Row label="Multi-Attach" value="Enabled" />}
                    <Row label="Created"    value={new Date(v.created).toLocaleDateString()} />
                    {v.snapshotId  && <Row label="Snapshot"    value={v.snapshotId.slice(0, 22) + '…'} mono />}
                  </div>

                  {/* Attachments */}
                  {v.attachments.length > 0 && (
                    <div style={{ marginTop: '0.55rem', background: '#060e1c', border: '1px solid #1e2d40', borderRadius: 6, padding: '0.5rem 0.7rem' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: '0.35rem' }}>Attached to</div>
                      {v.attachments.map((a, idx) => {
                        const inst = ec2?.instances?.find(i => i.id === a.instanceId);
                        return (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.1rem' }}>
                            <Row label="Instance"   value={inst ? (inst.name !== '—' ? inst.name : inst.id) : a.instanceId} mono={!inst} />
                            <Row label="Device"     value={a.device} mono />
                            <Row label="State"      value={a.state} />
                            {a.attachTime && <Row label="Since" value={new Date(a.attachTime).toLocaleString()} />}
                            <Row label="On terminate" value={a.deleteOnTermination ? 'Delete' : 'Keep'} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {v.attachments.length === 0 && (
                    <div style={{ marginTop: '0.45rem', color: '#475569', fontSize: '0.75rem' }}>⚠ Unattached — not in use</div>
                  )}
                </div>
              );
            })}
          </>}
        </Panel>

        </div>{/* end Storage grid */}

        {/* ── Tier label: Guides ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa' }}>Guides</span>
          <div style={{ flex: 1, height: 1, background: '#2e1065' }} />
        </div>

        {/* EBS Disk Management Guide */}
        <Panel title="Managing EC2 Disks via CLI (EBS Volumes)" icon="💾" accent="#a78bfa" fullWidth>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0, lineHeight: 1.6 }}>
            AWS CLI manages infrastructure — attaching/detaching EBS volumes. Actual disk setup
            (partitioning, formatting, mounting) runs <em>inside</em> the EC2 instance over SSH or SSM.
          </p>

          {/* Architecture flow */}
          <div style={{ background: '#0d1526', border: '1px solid #2e1065', borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['Local Machine', 'AWS CLI', 'EC2 Instance', 'Linux Disk Commands'].map((step, i, arr) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 6, padding: '0.25rem 0.65rem', color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {step}
                </span>
                {i < arr.length - 1 && <span style={{ color: '#4338ca', fontSize: '0.85rem' }}>→</span>}
              </div>
            ))}
          </div>

          {/* Per-instance connect commands from live data */}
          <SectionLabel>Connect to Your Instance</SectionLabel>
          {ec2?.instances?.filter(i => i.state === 'running').length === 0 && (
            <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>No running instances found.</p>
          )}
          {ec2?.instances?.filter(i => i.state === 'running').map(i => (
            <div key={i.id} style={{ background: '#0a1120', border: '1px solid #1e2d40', borderRadius: 8, padding: '0.7rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem' }}>{i.name !== '—' ? i.name : i.id}</span>
                <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '0.72rem' }}>{i.id}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div style={{ background: '#060e1c', border: '1px solid #1e3a5f', borderLeft: '3px solid #3b82f6', borderRadius: 6, padding: '0.55rem 0.7rem' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.73rem', marginBottom: '0.35rem' }}>SSH</div>
                  <pre style={{ margin: 0, fontSize: '0.72rem', color: '#7dd3fc', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`ssh -i ~/lab-key.pem ec2-user@${i.publicIp || i.privateIp}`}
                  </pre>
                </div>
                <div style={{ background: '#060e1c', border: '1px solid #1e3a5f', borderLeft: '3px solid #8b5cf6', borderRadius: 6, padding: '0.55rem 0.7rem' }}>
                  <div style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '0.73rem', marginBottom: '0.35rem' }}>SSM</div>
                  <pre style={{ margin: 0, fontSize: '0.72rem', color: '#7dd3fc', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`aws ssm start-session --target ${i.id}`}
                  </pre>
                </div>
              </div>
            </div>
          ))}

          {/* Per-instance disk overview from live EBS data */}
          <SectionLabel>Attached Disks (live)</SectionLabel>
          {ec2?.instances?.filter(i => i.state === 'running').map(i => {
            const vols = ebs?.volumes?.filter(v => v.attachments.some(a => a.instanceId === i.id)) || [];
            return (
              <div key={i.id} style={{ background: '#0a1120', border: '1px solid #1e2d40', borderRadius: 8, padding: '0.65rem 0.9rem', marginBottom: '0.4rem' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {i.name !== '—' ? i.name : i.id}
                  <span style={{ color: '#334155', fontWeight: 400, marginLeft: '0.4rem' }}>· run lsblk to see device names</span>
                </div>
                {vols.length === 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>No volumes attached.</span>}
                {vols.map(v => {
                  const att = v.attachments.find(a => a.instanceId === i.id);
                  const isRoot = att?.device?.includes('sda') || att?.device?.includes('xvda') || att?.device === '/dev/nvme0n1';
                  return (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', borderBottom: '1px solid #0f172a' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <code style={{ color: '#7dd3fc', fontSize: '0.73rem' }}>{att?.device}</code>
                        <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: 4, background: isRoot ? '#0f172a' : '#052e16', color: isRoot ? '#475569' : '#4ade80' }}>
                          {isRoot ? 'root' : 'data'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{v.type}</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.75rem' }}>{v.sizeGb} GB</span>
                        <Badge ok={v.state === 'in-use'} label={v.state} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Disk setup steps */}
          <SectionLabel>Disk Setup Flow</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[
              { step: '1', label: 'Partition', cmd: 'fdisk /dev/nvme1n1' },
              { step: '2', label: 'Format',    cmd: 'mkfs.ext4 /dev/nvme1n1p1' },
              { step: '3', label: 'Mount',     cmd: 'mount /dev/nvme1n1p1 /data' },
              { step: '4', label: 'Persist',   cmd: 'echo "/dev/nvme1n1p1 /data ext4 defaults 0 2" >> /etc/fstab' },
            ].map(({ step, label, cmd }) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: '#0d1526', border: '1px solid #1e2d40', borderRadius: 7, padding: '0.45rem 0.75rem' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#1e1b4b', border: '1px solid #4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a5b4fc', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>{step}</span>
                <span style={{ color: '#64748b', fontSize: '0.75rem', width: 60, flexShrink: 0 }}>{label}</span>
                <code style={{ color: '#7dd3fc', fontSize: '0.74rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd}</code>
              </div>
            ))}
          </div>

          {/* Key takeaway */}
          <SectionLabel>Key Takeaway</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 7, padding: '0.65rem 0.85rem' }}>
              <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.25rem' }}>AWS CLI — Control Plane</div>
              <p style={{ margin: 0, color: '#475569', fontSize: '0.76rem', lineHeight: 1.5 }}>
                Attach, detach, snapshot, resize EBS volumes. Operates on AWS infrastructure.
              </p>
            </div>
            <div style={{ background: '#0d1526', border: '1px solid #1e3a5f', borderRadius: 7, padding: '0.65rem 0.85rem' }}>
              <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.25rem' }}>EC2 Terminal — Data Plane</div>
              <p style={{ margin: 0, color: '#475569', fontSize: '0.76rem', lineHeight: 1.5 }}>
                Partition, format, mount, and use the disk. Operates inside the OS.
              </p>
            </div>
          </div>

        </Panel>

      </div>
    </div>
  );
}
