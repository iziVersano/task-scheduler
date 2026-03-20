import { useState } from 'react';

const INITIAL_TREE = {
  id: 'root',
  type: 'dc',
  label: 'dc=dci,dc=example,dc=com',
  children: [
    {
      id: 'ou-admins',
      type: 'ou',
      label: 'ou=Admins',
      children: [
        { id: 'cn-root', type: 'user', label: 'cn=root' },
        { id: 'cn-sysop', type: 'user', label: 'cn=sysop' },
      ],
    },
    {
      id: 'ou-developers',
      type: 'ou',
      label: 'ou=Developers',
      children: [
        { id: 'cn-alice', type: 'user', label: 'cn=alice' },
        { id: 'cn-bob', type: 'user', label: 'cn=bob' },
        { id: 'cn-charlie', type: 'user', label: 'cn=charlie' },
      ],
    },
    {
      id: 'ou-testers',
      type: 'ou',
      label: 'ou=Testers',
      children: [
        { id: 'cn-diana', type: 'user', label: 'cn=diana' },
      ],
    },
    {
      id: 'ou-computers',
      type: 'ou',
      label: 'ou=Computers',
      children: [
        { id: 'cn-srv01', type: 'computer', label: 'cn=srv01' },
        { id: 'cn-ws-alice', type: 'computer', label: 'cn=ws-alice' },
      ],
    },
    {
      id: 'ou-groups',
      type: 'ou',
      label: 'ou=Groups',
      children: [
        { id: 'cn-vpn-users', type: 'group', label: 'cn=vpn-users' },
        { id: 'cn-dev-team', type: 'group', label: 'cn=dev-team' },
      ],
    },
  ],
};

const TYPE_META = {
  dc:       { icon: '🌐', color: '#818cf8', badge: 'DC' },
  ou:       { icon: '📁', color: '#fbbf24', badge: 'OU' },
  user:     { icon: '👤', color: '#34d399', badge: 'User' },
  computer: { icon: '🖥️', color: '#60a5fa', badge: 'Computer' },
  group:    { icon: '👥', color: '#f472b6', badge: 'Group' },
};

function buildDn(node, ancestors) {
  const parts = [...ancestors.map(a => a.label), node.label];
  return parts.join(',');
}

function TreeNode({ node, ancestors, selected, onSelect, onAddUser, onRemove, depth }) {
  const [open, setOpen] = useState(true);
  const meta = TYPE_META[node.type];
  const isLeaf = !node.children || node.children.length === 0;
  const dn = buildDn(node, ancestors);
  const isSelected = selected === node.id;
  const newAncestors = [...ancestors, node];

  return (
    <div className="ldap-node-wrap" style={{ marginLeft: depth > 0 ? '1.4rem' : 0 }}>
      <div
        className={`ldap-node ${isSelected ? 'ldap-node-selected' : ''}`}
        onClick={() => onSelect(node.id, dn, node.type, meta)}
      >
        {!isLeaf && (
          <button
            className="ldap-toggle"
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        {isLeaf && <span className="ldap-toggle-spacer" />}
        <span className="ldap-node-icon">{meta.icon}</span>
        <span className="ldap-node-label" style={{ color: meta.color }}>{node.label}</span>
        <span className="ldap-node-badge" style={{ borderColor: meta.color, color: meta.color }}>{meta.badge}</span>
        {node.type === 'ou' && (
          <button
            className="ldap-add-btn"
            title="Add user to this OU"
            onClick={e => { e.stopPropagation(); onAddUser(node.id); }}
          >+</button>
        )}
        {node.type === 'user' && (
          <button
            className="ldap-rm-btn"
            title="Remove"
            onClick={e => { e.stopPropagation(); onRemove(node.id); }}
          >✕</button>
        )}
      </div>
      {!isLeaf && open && (
        <div className="ldap-children">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              ancestors={newAncestors}
              selected={selected}
              onSelect={onSelect}
              onAddUser={onAddUser}
              onRemove={onRemove}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function removeFromTree(tree, id) {
  return {
    ...tree,
    children: tree.children
      ? tree.children
          .filter(c => c.id !== id)
          .map(c => removeFromTree(c, id))
      : undefined,
  };
}

function addToOu(tree, ouId, newUser) {
  if (tree.id === ouId) {
    return { ...tree, children: [...(tree.children || []), newUser] };
  }
  return {
    ...tree,
    children: tree.children ? tree.children.map(c => addToOu(c, ouId, newUser)) : undefined,
  };
}

export default function LdapTree() {
  const [tree, setTree] = useState(INITIAL_TREE);
  const [selected, setSelected] = useState(null);
  const [selectedDn, setSelectedDn] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [newName, setNewName] = useState('');
  const [targetOu, setTargetOu] = useState(null);

  function handleSelect(id, dn, type, meta) {
    setSelected(id);
    setSelectedDn(dn);
    setSelectedMeta({ type, ...meta });
  }

  function handleAddUser(ouId) {
    setTargetOu(ouId);
    setNewName('');
  }

  function confirmAdd() {
    if (!newName.trim()) return;
    const id = 'cn-' + newName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const newUser = { id, type: 'user', label: `cn=${newName.trim().toLowerCase()}` };
    setTree(t => addToOu(t, targetOu, newUser));
    setTargetOu(null);
    setNewName('');
  }

  function handleRemove(id) {
    if (selected === id) { setSelected(null); setSelectedDn(null); setSelectedMeta(null); }
    setTree(t => removeFromTree(t, id));
  }

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">LDAP Directory Tree</h3>
      <p className="nlab-hint">
        Objects are addressed by their full <strong>Distinguished Name (DN)</strong> — a path from the leaf up to the root, separated by commas.
        Click any node to see its DN. Use <code>+</code> to add a user to an OU.
      </p>

      <div className="ldap-layout">
        <div className="ldap-tree-wrap">
          <TreeNode
            node={tree}
            ancestors={[]}
            selected={selected}
            onSelect={handleSelect}
            onAddUser={handleAddUser}
            onRemove={handleRemove}
            depth={0}
          />

          {targetOu && (
            <div className="ldap-add-form">
              <span className="ldap-add-label">New user in {targetOu}:</span>
              <input
                className="nlab-field input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmAdd()}
                placeholder="username"
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={confirmAdd}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setTargetOu(null)}>Cancel</button>
            </div>
          )}
        </div>

        <div className="ldap-detail">
          {selectedDn ? (
            <>
              <div className="ldap-detail-title">Selected object</div>
              <div className="ldap-detail-type">
                <span style={{ fontSize: '1.5rem' }}>{selectedMeta?.icon}</span>
                <span style={{ color: selectedMeta?.color, fontWeight: 600 }}>{selectedMeta?.badge}</span>
              </div>
              <div className="ldap-detail-label">Distinguished Name (DN)</div>
              <code className="ldap-dn">{selectedDn}</code>

              <div className="ldap-dn-parts">
                {selectedDn.split(',').map((part, i) => (
                  <div key={i} className="ldap-dn-part">
                    <span className="ldap-dn-part-key">{part.split('=')[0].toUpperCase()}</span>
                    <span className="ldap-dn-part-eq">=</span>
                    <span className="ldap-dn-part-val">{part.split('=')[1]}</span>
                  </div>
                ))}
              </div>

              <div className="ldap-ldif-wrap">
                <div className="ldap-detail-label">LDAP search filter</div>
                <code className="ldap-ldif">
                  ldapsearch -x -b "{selectedDn}"
                </code>
              </div>
            </>
          ) : (
            <div className="ldap-detail-empty">
              Click a node to see its Distinguished Name (DN)
            </div>
          )}

          <div className="ldap-legend">
            <div className="ldap-detail-label" style={{ marginBottom: '0.5rem' }}>Object types</div>
            {Object.entries(TYPE_META).map(([type, m]) => (
              <div key={type} className="ldap-legend-item">
                <span>{m.icon}</span>
                <span className="ldap-node-badge" style={{ borderColor: m.color, color: m.color }}>{m.badge}</span>
                <span className="ldap-legend-desc">
                  {type === 'dc' && 'Domain Component — root of the tree'}
                  {type === 'ou' && 'Organizational Unit — container/folder'}
                  {type === 'user' && 'User account object'}
                  {type === 'computer' && 'Computer/workstation object'}
                  {type === 'group' && 'Security or distribution group'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
