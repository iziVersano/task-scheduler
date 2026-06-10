import { useState, useCallback, createContext, useContext, useEffect } from 'react';
import { CLOUDS, CLOUD_META } from './types.js';
import { apiFetch } from '../../apiClient.js';
import {
  createIdentity,
  createPermission,
  checkAccess,
  generateDemoData,
  getCloudEquivalents,
} from './iamEngine.js';

/* ─── Inline translation dictionary ─── */

const dict = {
  en: {
    title: 'Multi-Cloud IAM Lab',
    loadDemo: 'Load Demo Data',
    resetAll: 'Reset All',
    allClouds: 'All Clouds',
    permBindings: 'Permission Bindings',
    // Tabs
    tabIdentities: 'Identities & Permissions',
    tabChecker: 'Access Checker',
    tabConcepts: 'Concept Map',
    // Identity form
    createIdentity: 'Create Identity',
    cloud: 'Cloud',
    name: 'Name',
    role: 'Role',
    selectRole: 'Select role...',
    addBtn: '+ Add',
    // Permission form
    addPermission: 'Add Permission',
    identity: 'Identity',
    selectIdentity: 'Select identity...',
    resource: 'Resource',
    selectResource: 'Select resource...',
    actions: 'Actions',
    grantPermission: '+ Grant Permission',
    // Table
    type: 'Type',
    permissions: 'Permissions',
    noPerms: 'No permissions',
    delete: 'Delete',
    noIdentities: 'No identities',
    noIdentitiesFor: 'No identities for',
    createOneAbove: 'Create one above.',
    yet: 'yet',
    // Access checker
    accessChecker: 'Access Checker',
    accessSubtitle: 'Simulate an access request to see if it would be allowed or denied.',
    action: 'Action',
    selectAction: 'Select action...',
    checkAccess: 'Check Access',
    allowed: 'ALLOWED',
    denied: 'DENIED',
    checkerEmpty: 'Create some identities first, or load demo data to use the access checker.',
    // Concept map
    conceptTitle: 'Cloud IAM Concept Mapping',
    conceptSubtitle: 'How identity and access concepts map across the three major clouds.',
    concept: 'Concept',
    // Access reasons
    noPermsFor: 'No permissions found for',
    onResource: 'on resource',
    isGranted: 'is granted',
    hasPermsOn: 'has permissions on',
    butNotFor: 'but not for action',
    allowedActions: 'Allowed actions',
    // App Users tab
    tabAppUsers: 'App Users',
    appUsersTitle: 'App Users (Keycloak)',
    appUsersSubtitle: 'Live users from Keycloak realm task-scheduler.',
    appUsersUsername: 'Username',
    appUsersEmail: 'Email',
    appUsersStatus: 'Status',
    appUsersRoles: 'Realm Roles',
    appUsersActive: 'Active',
    appUsersDisabled: 'Disabled',
    appUsersLoading: 'Loading users from Keycloak...',
    appUsersError: 'Could not load users. Is Keycloak running?',
    // Lang toggle
    langLabel: 'DE',
  },
  de: {
    title: 'Multi-Cloud IAM Labor',
    loadDemo: 'Demodaten laden',
    resetAll: 'Alles zurücksetzen',
    allClouds: 'Alle Clouds',
    permBindings: 'Berechtigungsbindungen',
    tabIdentities: 'Identitäten & Berechtigungen',
    tabChecker: 'Zugriffsprüfung',
    tabConcepts: 'Konzeptkarte',
    createIdentity: 'Identität erstellen',
    cloud: 'Cloud',
    name: 'Name',
    role: 'Rolle',
    selectRole: 'Rolle wählen...',
    addBtn: '+ Hinzufügen',
    addPermission: 'Berechtigung hinzufügen',
    identity: 'Identität',
    selectIdentity: 'Identität wählen...',
    resource: 'Ressource',
    selectResource: 'Ressource wählen...',
    actions: 'Aktionen',
    grantPermission: '+ Berechtigung erteilen',
    type: 'Typ',
    permissions: 'Berechtigungen',
    noPerms: 'Keine Berechtigungen',
    delete: 'Löschen',
    noIdentities: 'Keine Identitäten',
    noIdentitiesFor: 'Keine Identitäten für',
    createOneAbove: 'Erstelle eine oben.',
    yet: 'vorhanden',
    accessChecker: 'Zugriffsprüfung',
    accessSubtitle: 'Simuliere eine Zugriffsanfrage, um zu sehen, ob sie erlaubt oder verweigert wird.',
    action: 'Aktion',
    selectAction: 'Aktion wählen...',
    checkAccess: 'Zugriff prüfen',
    allowed: 'ERLAUBT',
    denied: 'VERWEIGERT',
    checkerEmpty: 'Erstelle zuerst Identitäten oder lade Demodaten, um die Zugriffsprüfung zu nutzen.',
    conceptTitle: 'Cloud-IAM-Konzeptzuordnung',
    conceptSubtitle: 'Wie Identitäts- und Zugriffskonzepte über die drei großen Clouds abgebildet werden.',
    concept: 'Konzept',
    noPermsFor: 'Keine Berechtigungen gefunden für',
    onResource: 'auf Ressource',
    isGranted: 'hat Zugriff auf',
    hasPermsOn: 'hat Berechtigungen auf',
    butNotFor: 'aber nicht für Aktion',
    allowedActions: 'Erlaubte Aktionen',
    // App Users tab
    tabAppUsers: 'App-Benutzer',
    appUsersTitle: 'App-Benutzer (Keycloak)',
    appUsersSubtitle: 'Live-Benutzer aus dem Keycloak-Realm task-scheduler.',
    appUsersUsername: 'Benutzername',
    appUsersEmail: 'E-Mail',
    appUsersStatus: 'Status',
    appUsersRoles: 'Realm-Rollen',
    appUsersActive: 'Aktiv',
    appUsersDisabled: 'Deaktiviert',
    appUsersLoading: 'Benutzer von Keycloak werden geladen...',
    appUsersError: 'Benutzer konnten nicht geladen werden. Läuft Keycloak?',
    langLabel: 'EN',
  },
};

const conceptsDe = {
  'Machine Identity': 'Maschinenidentität',
  'Permission Binding': 'Berechtigungsbindung',
  'Permission Set': 'Berechtigungssatz',
  'Scope': 'Geltungsbereich',
  'Temporary Credentials': 'Temporäre Anmeldedaten',
  'Audit Log': 'Prüfprotokoll',
};

const LangContext = createContext('en');

function useT() {
  const lang = useContext(LangContext);
  return (key) => dict[lang]?.[key] ?? dict.en[key] ?? key;
}

function useLang() {
  return useContext(LangContext);
}

/* ─── Sub-components ─── */

function CloudFilter({ selected, setSelected }) {
  const t = useT();
  return (
    <div className="iam-cloud-filter">
      <button
        className={`iam-filter-btn ${selected === 'all' ? 'iam-filter-active' : ''}`}
        onClick={() => setSelected('all')}
      >
        {t('allClouds')}
      </button>
      {CLOUDS.map((c) => (
        <button
          key={c}
          className={`iam-filter-btn ${selected === c ? 'iam-filter-active' : ''}`}
          style={selected === c ? { borderColor: CLOUD_META[c].color, color: CLOUD_META[c].color } : {}}
          onClick={() => setSelected(c)}
        >
          {CLOUD_META[c].icon} {CLOUD_META[c].label}
        </button>
      ))}
    </div>
  );
}

function IdentityForm({ onAdd }) {
  const t = useT();
  const [cloud, setCloud] = useState('gcp');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !role) return;
    onAdd(cloud, name.trim(), role);
    setName('');
    setRole('');
  };

  return (
    <form className="iam-form" onSubmit={handleSubmit}>
      <h3 className="iam-form-title">{t('createIdentity')}</h3>
      <div className="iam-form-grid">
        <label className="iam-label">
          {t('cloud')}
          <select className="iam-select" value={cloud} onChange={(e) => { setCloud(e.target.value); setRole(''); }}>
            {CLOUDS.map((c) => (
              <option key={c} value={c}>{CLOUD_META[c].label} — {CLOUD_META[c].identityLabel}</option>
            ))}
          </select>
        </label>
        <label className="iam-label">
          {t('name')}
          <input
            className="iam-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={cloud === 'gcp' ? 'my-sa@project.iam' : cloud === 'aws' ? 'MyLambdaRole' : 'deploy-sp-prod'}
          />
        </label>
        <label className="iam-label">
          {t('role')}
          <select className="iam-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t('selectRole')}</option>
            {CLOUD_META[cloud].defaultRoles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary iam-add-btn" type="submit" disabled={!name.trim() || !role}>
          {t('addBtn')} {CLOUD_META[cloud].identityLabel}
        </button>
      </div>
    </form>
  );
}

function PermissionForm({ identities, onAdd }) {
  const t = useT();
  const [identityId, setIdentityId] = useState('');
  const [resource, setResource] = useState('');
  const [actions, setActions] = useState([]);

  const identity = identities.find((i) => i.id === identityId);
  const cloud = identity?.cloud || 'gcp';
  const availableActions = CLOUD_META[cloud].actions;
  const availableResources = CLOUD_META[cloud].resources;

  const toggleAction = (a) => {
    setActions((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identityId || !resource || actions.length === 0) return;
    onAdd(identityId, resource, actions);
    setResource('');
    setActions([]);
  };

  return (
    <form className="iam-form" onSubmit={handleSubmit}>
      <h3 className="iam-form-title">{t('addPermission')}</h3>
      <div className="iam-form-grid">
        <label className="iam-label">
          {t('identity')}
          <select className="iam-select" value={identityId} onChange={(e) => { setIdentityId(e.target.value); setResource(''); setActions([]); }}>
            <option value="">{t('selectIdentity')}</option>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>{CLOUD_META[i.cloud].icon} {i.name}</option>
            ))}
          </select>
        </label>
        <label className="iam-label">
          {t('resource')}
          <select className="iam-select" value={resource} onChange={(e) => setResource(e.target.value)} disabled={!identityId}>
            <option value="">{t('selectResource')}</option>
            {availableResources.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <div className="iam-label">
          {t('actions')}
          <div className="iam-actions-grid">
            {availableActions.map((a) => (
              <label key={a} className="iam-action-chip">
                <input
                  type="checkbox"
                  checked={actions.includes(a)}
                  onChange={() => toggleAction(a)}
                  disabled={!identityId}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
        <button className="btn btn-primary iam-add-btn" type="submit" disabled={!identityId || !resource || actions.length === 0}>
          {t('grantPermission')}
        </button>
      </div>
    </form>
  );
}

function IdentityTable({ identities, permissions, cloudFilter, onDeleteIdentity }) {
  const t = useT();
  const filtered = cloudFilter === 'all' ? identities : identities.filter((i) => i.cloud === cloudFilter);

  if (filtered.length === 0) {
    return (
      <div className="iam-empty">
        {cloudFilter !== 'all'
          ? `${t('noIdentitiesFor')} ${CLOUD_META[cloudFilter].label}. ${t('createOneAbove')}`
          : `${t('noIdentities')} ${t('yet')}. ${t('createOneAbove')}`}
      </div>
    );
  }

  return (
    <div className="iam-table-wrap">
      <table className="iam-table">
        <thead>
          <tr>
            <th>{t('cloud')}</th>
            <th>{t('type')}</th>
            <th>{t('name')}</th>
            <th>{t('role')}</th>
            <th>{t('permissions')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((identity) => {
            const meta = CLOUD_META[identity.cloud];
            const perms = permissions.filter((p) => p.identityId === identity.id);
            return (
              <tr key={identity.id}>
                <td>
                  <span className="iam-cloud-badge" style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '44' }}>
                    {meta.icon} {meta.label}
                  </span>
                </td>
                <td className="iam-type-cell">{meta.identityLabel}</td>
                <td className="iam-name-cell">{identity.name}</td>
                <td><code className="iam-role-code">{identity.role}</code></td>
                <td>
                  {perms.length === 0 ? (
                    <span className="iam-no-perms">{t('noPerms')}</span>
                  ) : (
                    <div className="iam-perm-list">
                      {perms.map((p) => (
                        <div key={p.id} className="iam-perm-item">
                          <span className="iam-perm-resource">{p.resource}</span>
                          <span className="iam-perm-actions">{p.actions.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <button className="btn-sm btn-danger" onClick={() => onDeleteIdentity(identity.id)} title={t('delete')}>
                    {t('delete')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AccessChecker({ identities, permissions }) {
  const t = useT();
  const lang = useLang();
  const [identityId, setIdentityId] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState(null);

  const identity = identities.find((i) => i.id === identityId);
  const cloud = identity?.cloud || 'gcp';

  const handleCheck = (e) => {
    e.preventDefault();
    if (!identity || !resource || !action) return;
    setResult(checkAccess(identity, permissions, resource, action, lang));
  };

  return (
    <div className="iam-checker">
      <h3 className="iam-form-title">{t('accessChecker')}</h3>
      <p className="iam-subtitle">{t('accessSubtitle')}</p>
      <form className="iam-form-grid" onSubmit={handleCheck}>
        <label className="iam-label">
          {t('identity')}
          <select className="iam-select" value={identityId} onChange={(e) => { setIdentityId(e.target.value); setResource(''); setAction(''); setResult(null); }}>
            <option value="">{t('selectIdentity')}</option>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>{CLOUD_META[i.cloud].icon} {i.name}</option>
            ))}
          </select>
        </label>
        <label className="iam-label">
          {t('resource')}
          <select className="iam-select" value={resource} onChange={(e) => { setResource(e.target.value); setResult(null); }} disabled={!identityId}>
            <option value="">{t('selectResource')}</option>
            {CLOUD_META[cloud].resources.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="iam-label">
          {t('action')}
          <select className="iam-select" value={action} onChange={(e) => { setAction(e.target.value); setResult(null); }} disabled={!identityId}>
            <option value="">{t('selectAction')}</option>
            {CLOUD_META[cloud].actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary iam-add-btn" type="submit" disabled={!identityId || !resource || !action}>
          {t('checkAccess')}
        </button>
      </form>
      {result && (
        <div className={`iam-result ${result.result === 'allowed' ? 'iam-result-allowed' : 'iam-result-denied'}`}>
          <span className="iam-result-icon">{result.result === 'allowed' ? '✅' : '🚫'}</span>
          <div>
            <strong>{result.result === 'allowed' ? t('allowed') : t('denied')}</strong>
            <p>{result.reason}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptMap() {
  const t = useT();
  const lang = useLang();
  const equivalents = getCloudEquivalents();
  return (
    <div className="iam-concept-map">
      <h3 className="iam-form-title">{t('conceptTitle')}</h3>
      <p className="iam-subtitle">{t('conceptSubtitle')}</p>
      <div className="iam-table-wrap">
        <table className="iam-table iam-concept-table">
          <thead>
            <tr>
              <th>{t('concept')}</th>
              <th style={{ color: CLOUD_META.gcp.color }}>{CLOUD_META.gcp.icon} GCP</th>
              <th style={{ color: CLOUD_META.aws.color }}>{CLOUD_META.aws.icon} AWS</th>
              <th style={{ color: CLOUD_META.azure.color }}>{CLOUD_META.azure.icon} Azure</th>
            </tr>
          </thead>
          <tbody>
            {equivalents.map((row) => (
              <tr key={row.concept}>
                <td className="iam-concept-label">
                  {lang === 'de' ? (conceptsDe[row.concept] || row.concept) : row.concept}
                </td>
                <td><code>{row.gcp}</code></td>
                <td><code>{row.aws}</code></td>
                <td><code>{row.azure}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page Component ─── */

function AppUsersTab() {
  const t = useT();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/iam/users')
      .then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json();
      })
      .then((data) => { setUsers(data); setLoading(false); })
      .catch(() => { setError(t('appUsersError')); setLoading(false); });
  }, []);

  if (loading) return <div className="iam-empty">{t('appUsersLoading')}</div>;
  if (error)   return <div className="iam-empty" style={{ color: '#ef4444' }}>{error}</div>;

  return (
    <div className="iam-content">
      <div className="iam-form">
        <h3 className="iam-form-title">{t('appUsersTitle')}</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          {t('appUsersSubtitle')}{' '}
          <a href="http://localhost:8080" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
            localhost:8080
          </a>
        </p>
      </div>
      <div className="iam-table-wrap">
        <table className="iam-table">
          <thead>
            <tr>
              <th>{t('appUsersUsername')}</th>
              <th>{t('appUsersEmail')}</th>
              <th>{t('appUsersStatus')}</th>
              <th>{t('appUsersRoles')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="iam-name-cell">{u.username}</td>
                <td>{u.email || '—'}</td>
                <td>
                  <span style={{ color: u.enabled ? '#22c55e' : '#ef4444' }}>
                    {u.enabled ? t('appUsersActive') : t('appUsersDisabled')}
                  </span>
                </td>
                <td>
                  {u.roles?.filter((r) => !r.name.startsWith('default-roles')).map((r) => (
                    <span key={r.id} className="iam-cloud-badge" style={{ marginRight: 4 }}>
                      {r.name}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MultiCloudIAM() {
  const [lang, setLang] = useState('en');
  const [tab, setTab] = useState('identities');
  const [cloudFilter, setCloudFilter] = useState('all');
  const [identities, setIdentities] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [initialized, setInitialized] = useState(false);

  const t = (key) => dict[lang]?.[key] ?? dict.en[key] ?? key;

  const loadDemo = useCallback(() => {
    const { identities: demoIds, permissions: demoPerms } = generateDemoData();
    setIdentities(demoIds);
    setPermissions(demoPerms);
    setInitialized(true);
  }, []);

  const handleAddIdentity = (cloud, name, role) => {
    setIdentities((prev) => [...prev, createIdentity(cloud, name, role)]);
  };

  const handleDeleteIdentity = (id) => {
    setIdentities((prev) => prev.filter((i) => i.id !== id));
    setPermissions((prev) => prev.filter((p) => p.identityId !== id));
  };

  const handleAddPermission = (identityId, resource, actions) => {
    setPermissions((prev) => [...prev, createPermission(identityId, resource, actions)]);
  };

  const handleReset = () => {
    setIdentities([]);
    setPermissions([]);
    setInitialized(false);
  };

  const tabs = [
    { id: 'identities', label: t('tabIdentities') },
    { id: 'checker', label: t('tabChecker') },
    { id: 'concepts', label: t('tabConcepts') },
    { id: 'app-users', label: t('tabAppUsers') },
  ];

  const stats = {
    gcp: identities.filter((i) => i.cloud === 'gcp').length,
    aws: identities.filter((i) => i.cloud === 'aws').length,
    azure: identities.filter((i) => i.cloud === 'azure').length,
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="iam-page">
        <div className="iam-header-row">
          <h2 className="iam-title">{t('title')}</h2>
          <div className="iam-header-actions">
            <button
              className="btn btn-ghost iam-lang-btn"
              onClick={() => setLang((prev) => (prev === 'en' ? 'de' : 'en'))}
              title={lang === 'en' ? 'Auf Deutsch umschalten' : 'Switch to English'}
            >
              {t('langLabel')}
            </button>
            {!initialized && (
              <button className="btn btn-primary" onClick={loadDemo}>{t('loadDemo')}</button>
            )}
            {identities.length > 0 && (
              <button className="btn btn-ghost" onClick={handleReset}>{t('resetAll')}</button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="iam-stats-row">
          {CLOUDS.map((c) => (
            <div key={c} className="iam-stat-card" style={{ borderColor: CLOUD_META[c].color + '66' }}>
              <span className="iam-stat-icon" style={{ color: CLOUD_META[c].color }}>{CLOUD_META[c].icon}</span>
              <div>
                <span className="iam-stat-value">{stats[c]}</span>
                <span className="iam-stat-label">{CLOUD_META[c].label} {CLOUD_META[c].identityLabel}s</span>
              </div>
            </div>
          ))}
          <div className="iam-stat-card" style={{ borderColor: '#64748b66' }}>
            <span className="iam-stat-icon">🔑</span>
            <div>
              <span className="iam-stat-value">{permissions.length}</span>
              <span className="iam-stat-label">{t('permBindings')}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="nlab-tab-bar">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              className={`nlab-tab ${tab === tb.id ? 'nlab-tab-active' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'identities' && (
          <div className="iam-content">
            <IdentityForm onAdd={handleAddIdentity} />
            <PermissionForm identities={identities} onAdd={handleAddPermission} />
            <CloudFilter selected={cloudFilter} setSelected={setCloudFilter} />
            <IdentityTable
              identities={identities}
              permissions={permissions}
              cloudFilter={cloudFilter}
              onDeleteIdentity={handleDeleteIdentity}
            />
          </div>
        )}

        {tab === 'checker' && (
          <div className="iam-content">
            {identities.length === 0 ? (
              <div className="iam-empty">{t('checkerEmpty')}</div>
            ) : (
              <AccessChecker identities={identities} permissions={permissions} />
            )}
          </div>
        )}

        {tab === 'concepts' && (
          <div className="iam-content">
            <ConceptMap />
          </div>
        )}

        {tab === 'app-users' && <AppUsersTab />}
      </div>
    </LangContext.Provider>
  );
}
