const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function header(event, name) {
  const h = event.headers || {};
  const found = Object.keys(h).filter(function (k) { return k.toLowerCase() === name; })[0];
  return found ? h[found] : '';
}

exports.handler = async function (event) {
  connectLambda(event);
  const board = getStore({ name: 'leaderboard' });
  const list = ((await board.get('scores', { type: 'json' })) || []).filter(function (e) { return !e.hidden; });

  let me = null;
  const name = header(event, 'x-cr-name'), token = header(event, 'x-cr-token');
  if (name && token) {
    const users = getStore({ name: 'users' });
    const key = nameKey(name);
    const user = await users.get(key, { type: 'json' });
    if (user && (user.tokens || []).indexOf(sha(token)) >= 0) {
      const idx = list.findIndex(function (e) { return e.key === key; });
      me = { name: user.name, best: idx >= 0 ? list[idx].score : 0, rank: idx >= 0 ? idx + 1 : null };
    }
  }
  return json(200, {
    top: list.slice(0, 20).map(function (e) { return { name: e.name, score: e.score }; }),
    me: me
  });
};
