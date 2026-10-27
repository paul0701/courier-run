const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function maskEmail(e) {
  if (!e) return null;
  const at = e.indexOf('@'); if (at < 1) return e;
  const u = e.slice(0, at), d = e.slice(at + 1);
  return (u.length <= 2 ? u[0] + '*' : u[0] + '****' + u[u.length - 1]) + '@' + d;
}

// Add, change or clear the recovery email. Needs the signed-in token.
exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  const key = nameKey(typeof body.name === 'string' ? body.name : '');
  const token = typeof body.token === 'string' ? body.token : '';
  const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const email = raw === '' ? '' : (EMAIL_RE.test(raw) && raw.length <= 254 ? raw : null);
  if (email === null) return json(400, { error: 'email' });

  const users = getStore({ name: 'users' });
  const rec = await users.get(key, { type: 'json' });
  if (!rec || !token || (rec.tokens || []).indexOf(sha(token)) < 0) return json(401, { error: 'auth' });

  rec.email = email || null;
  await users.setJSON(key, rec);
  return json(200, { ok: true, email: maskEmail(rec.email) });
};
