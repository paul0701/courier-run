const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

// Moderation: list the board, hide a name from it, or bring it back.
// Needs an environment variable called ADMIN_KEY set in Netlify. Without one, this function refuses everything.
function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  const secret = process.env.ADMIN_KEY;
  if (!secret || secret.length < 12) return json(503, { error: 'not configured' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }
  if (typeof body.key !== 'string' || !same(body.key, secret)) return json(401, { error: 'key' });

  const board = getStore({ name: 'leaderboard' });
  const list = (await board.get('scores', { type: 'json' })) || [];

  if (body.action === 'list') {
    return json(200, { entries: list.slice(0, 100).map(function (e) { return { name: e.name, score: e.score, hidden: !!e.hidden }; }) });
  }
  if (body.action === 'hide' || body.action === 'unhide') {
    const key = nameKey(body.name);
    const entry = list.filter(function (e) { return e.key === key; })[0];
    if (!entry) return json(404, { error: 'not found' });
    entry.hidden = body.action === 'hide';
    await board.setJSON('scores', list);
    return json(200, { ok: true, name: entry.name, hidden: entry.hidden });
  }
  return json(400, { error: 'action' });
};
