require('dotenv').config({ path: __dirname + '/.env' });
const { createRemoteJWKSet, jwtVerify } = require('jose');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM        = process.env.KEYCLOAK_REALM || 'task-scheduler';
const CLIENT_ID    = process.env.KEYCLOAK_CLIENT_ID || 'task-scheduler-backend';

const JWKS_URI = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`;
const ISSUER   = `${KEYCLOAK_URL}/realms/${REALM}`;

// Lazily initialised so the server starts even if Keycloak is not yet running.
// The JWKS fetcher caches public keys and re-fetches when key IDs are unknown.
let _JWKS = null;
function getJWKS() {
  if (!_JWKS) _JWKS = createRemoteJWKSet(new URL(JWKS_URI));
  return _JWKS;
}

async function requireAuth(req, res, next) {
  // Skip auth when SKIP_AUTH is set (for development without Keycloak)
  if (process.env.SKIP_AUTH === 'true') {
    req.user = { id: 'dev', username: 'dev', email: null, roles: [] };
    return next();
  }

  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: ISSUER,
      // audience check is intentionally omitted here — Keycloak public clients
      // do not set an audience claim for realm tokens; the issuer check is sufficient.
      // If you need strict audience validation uncomment the line below and set
      // KEYCLOAK_CLIENT_ID to match the `aud` claim in your token.
      // audience: CLIENT_ID,
    });

    req.user = {
      id:       payload.sub,
      username: payload.preferred_username || payload.sub,
      email:    payload.email || null,
      roles:    payload.realm_access?.roles || [],
    };
    next();
  } catch (err) {
    return res.status(401).json({
      error:  'Invalid or expired token',
      detail: err.message,
      code:   'INVALID_TOKEN',
    });
  }
}

module.exports = { requireAuth };
