const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const PIN_RE = /^[0-9]{4,6}$/;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function cleanName(raw) { return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''; }
function nameKey(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function scrypt(pin, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(pin, salt, 32, function (err, key) { if (err) reject(err); else resolve(key); });
  });
}
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  const name = cleanName(body.name);
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (name.length < 3 || !PIN_RE.test(pin)) return json(400, { error: 'invalid' });

  const users = getStore({ name: 'users', consistency: 'strong' });
  const key = nameKey(name);
  const rec = await users.get(key, { type: 'json' });
  if (!rec) {
    await scrypt(pin, Buffer.alloc(16)); // same effort as a real check, so timing does not give the answer away
    return json(401, { error: 'bad' });
  }

  const now = Date.now();
  if (rec.lockUntil && rec.lockUntil > now) {
    return json(429, { error: 'locked', retryAfter: Math.ceil((rec.lockUntil - now) / 1000) });
  }

  const tried = await scrypt(pin, Buffer.from(rec.salt, 'hex'));
  const real = Buffer.from(rec.hash, 'hex');
  const ok = tried.length === real.length && crypto.timingSafeEqual(tried, real);

  if (!ok) {
    const stale = rec.lastFail && now - rec.lastFail > LOCK_MS;
    rec.fails = (stale ? 0 : (rec.fails || 0)) + 1;
    rec.lastFail = now;
    let locked = false;
    if (rec.fails >= MAX_FAILS) { rec.lockUntil = now + LOCK_MS; rec.fails = 0; locked = true; }
    await users.setJSON(key, rec);
    if (locked) return json(429, { error: 'locked', retryAfter: Math.ceil(LOCK_MS / 1000) });
    return json(401, { error: 'bad' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  rec.fails = 0; rec.lastFail = 0; rec.lockUntil = 0;
  rec.tokens = [sha(token)].concat(rec.tokens || []).slice(0, 5); // up to five devices at once
  await users.setJSON(key, rec);
  return json(200, { ok: true, token: token, name: rec.name });
};
