const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const CODE_TTL_MS = 15 * 60 * 1000;   // a code works for 15 minutes
const CODE_GAP_MS = 60 * 1000;        // one email a minute per account
const CODE_DAY_MAX = 5;               // and five a day

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

async function sendEmail(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from, to: [to], subject: subject, text: text, html: html }),
  });
  if (!r.ok) throw new Error('resend ' + r.status);
}

// Forgot PIN: email a six digit code to the address saved on the account.
// The reply is the same whether or not the name exists or has an email, so this
// can't be used to find out who has an account.
exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  if (!(process.env.RESEND_API_KEY && process.env.RESEND_FROM)) return json(503, { error: 'disabled' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  const key = nameKey(typeof body.name === 'string' ? body.name : '');
  const generic = json(200, { ok: true });
  if (key.length < 3) return generic;

  const users = getStore({ name: 'users' });
  const rec = await users.get(key, { type: 'json' });
  if (!rec || !rec.email) return generic;

  const now = Date.now(), r = rec.reset || {};
  const day = Math.floor(now / 86400000);
  const sentToday = r.day === day ? (r.sentToday || 0) : 0;
  if (now - (r.sentAt || 0) < CODE_GAP_MS) return json(429, { error: 'gap' });
  if (sentToday >= CODE_DAY_MAX) return json(429, { error: 'daymax' });

  const code = String(crypto.randomInt(100000, 1000000));
  rec.reset = { hash: sha(code + ':' + key + ':' + rec.salt), exp: now + CODE_TTL_MS, tries: 0, sentAt: now, day: day, sentToday: sentToday + 1 };
  await users.setJSON(key, rec);
  try {
    await sendEmail(rec.email, 'Your Courier Run PIN reset code',
      'Your code to reset the PIN for ' + rec.name + ' is ' + code + '.\n\nIt works for 15 minutes. If you did not ask for this, you can ignore this email and nothing will change.',
      '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111"><p>Your code to reset the PIN for <b>' + rec.name + '</b> is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">' + code + '</p><p>It works for 15 minutes. If you did not ask for this, you can ignore this email and nothing will change.</p><p style="color:#666;font-size:13px">Courier Run</p></div>');
  } catch (e) {
    console.error('reset email failed', e);
    rec.reset.hash = null; await users.setJSON(key, rec);
    return json(502, { error: 'send' });
  }
  return generic;
};
