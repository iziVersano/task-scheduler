require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('./iam-middleware');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM        = process.env.KEYCLOAK_REALM || 'task-scheduler';
const CLIENT_ID    = process.env.KEYCLOAK_CLIENT_ID;
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;

const KC_ADMIN     = `${KEYCLOAK_URL}/admin/realms/${REALM}`;
const TOKEN_URL    = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

// Obtain a short-lived admin token via client_credentials grant.
// The backend client needs the realm-management roles: view-users, view-realm.
async function getAdminToken() {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak token request failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── GET /api/iam/users ────────────────────────────────────────────────────
// Returns all realm users with their realm role mappings attached.
router.get('/iam/users', async (req, res) => {
  try {
    const token = await getAdminToken();

    const users = await fetch(`${KC_ADMIN}/users?max=200`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    if (!Array.isArray(users)) {
      return res.status(502).json({ error: 'Unexpected Keycloak response', detail: users });
    }

    // Fetch realm roles for every user in parallel
    const withRoles = await Promise.all(
      users.map(async (u) => {
        try {
          const roles = await fetch(
            `${KC_ADMIN}/users/${u.id}/role-mappings/realm`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then(r => r.json());
          return {
            id:        u.id,
            username:  u.username,
            email:     u.email || null,
            firstName: u.firstName || null,
            lastName:  u.lastName  || null,
            enabled:   u.enabled,
            roles:     Array.isArray(roles) ? roles : [],
          };
        } catch {
          return { id: u.id, username: u.username, enabled: u.enabled, roles: [] };
        }
      })
    );

    res.json(withRoles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/iam/roles ─────────────────────────────────────────────────────
// Returns all realm-level roles.
router.get('/iam/roles', async (req, res) => {
  try {
    const token = await getAdminToken();
    const roles = await fetch(`${KC_ADMIN}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    if (!Array.isArray(roles)) {
      return res.status(502).json({ error: 'Unexpected Keycloak response', detail: roles });
    }

    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
