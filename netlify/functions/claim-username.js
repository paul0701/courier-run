const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const NAME_RE = /^[A-Za-z0-9 _-]{3,16}$/;
const PIN_RE = /^[0-9]{4,6}$/;

// A simple starting filter. It will not catch everything, so keep an eye on the board and use the admin page.
const STEMS = ['fuck', 'shit', 'cunt', 'nigg', 'bitch', 'whore', 'pussy', 'bastard', 'wanker', 'twat', 'rapist', 'hitler', 'porn'];
const TOKENS = ['fag', 'dick', 'cock', 'piss', 'arse', 'ass', 'slut', 'rape', 'retard', 'cum', 'tit', 'tits', 'anal', 'sex', 'sexy', 'nude', 'nazi', 'kkk'];

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function cleanName(raw) { return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''; }
function nameKey(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function norm(s) {
  return s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
}
function blocked(name) {
  const n = norm(name);
  const collapsed = n.replace(/[^a-z]/g, '');
  if (STEMS.some(function (s) { return collapsed.indexOf(s) >= 0; })) return true;
  return n.split(/[^a-z]+/).filter(Boolean).some(function (t) { return TOKENS.indexOf(t) >= 0; });
}
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
  if (!NAME_RE.test(name) || nameKey(name).length < 3) return json(400, { error: 'name' });
  if (!PIN_RE.test(pin)) return json(400, { error: 'pin' });
  if (blocked(name)) return json(400, { error: 'blocked' });

  const users = getStore({ name: 'users', consistency: 'strong' });
  const key = nameKey(name);
  if (await users.get(key, { type: 'json' })) return json(409, { error: 'taken' });

  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pin, salt);
  const token = crypto.randomBytes(32).toString('hex');
  const rec = { name: name, salt: salt.toString('hex'), hash: hash.toString('hex'), tokens: [sha(token)], fails: 0, lastFail: 0, lockUntil: 0, createdAt: Date.now() };
  await users.setJSON(key, rec);

  // If two people claimed the same name at the same moment, only the one whose record survived keeps it.
  const check = await users.get(key, { type: 'json' });
  if (!check || check.salt !== rec.salt) return json(409, { error: 'taken' });

  return json(200, { ok: true, token: token, name: name });
};
