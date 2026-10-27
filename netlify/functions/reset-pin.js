const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const PIN_RE = /^[0-9]{6}$/;
const MAX_TRIES = 5;

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function scrypt(pin, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(pin, salt, 32, function (err, key) { if (err) reject(err); else resolve(key); });
  });
}

// Reset: the emailed code plus a new PIN. Signs the player in and signs every
// other device out.
exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  const key = nameKey(typeof body.name === 'string' ? body.name : '');
  const code = (typeof body.code === 'string' ? body.code : '').trim();
  const pin = (typeof body.pin === 'string' ? body.pin : '').trim();
  if (!PIN_RE.test(pin)) return json(400, { error: 'pin' });

  const users = getStore({ name: 'users' });
  const rec = await users.get(key, { type: 'json' });
  const r = rec && rec.reset;
  const wrong = json(403, { error: 'code' });
  if (!r || !r.hash || r.exp < Date.now()) return wrong;
  if ((r.tries || 0) >= MAX_TRIES) return json(429, { error: 'tries' });

  const want = sha(code + ':' + key + ':' + rec.salt);
  if (!(want.length === r.hash.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(r.hash)))) {
    rec.reset.tries = (r.tries || 0) + 1; await users.setJSON(key, rec);
    return wrong;
  }

  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pin, salt);
  const token = crypto.randomBytes(32).toString('hex');
  rec.salt = salt.toString('hex'); rec.hash = hash.toString('hex');
  rec.tokens = [sha(token)];   // sign out other devices
  rec.fails = 0; rec.lastFail = 0; rec.lockUntil = 0;
  delete rec.reset;
  await users.setJSON(key, rec);
  return json(200, { ok: true, token: token, name: rec.name });
};
