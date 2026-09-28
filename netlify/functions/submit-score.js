const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

// The most points the game can really award per second, plus a little extra at the start.
// Best play at top speed comes out near 70 a second, so 90 leaves room and real runs are never turned away.
const BASE_ALLOWANCE = 40;
const POINTS_PER_SECOND = 90;
const MIN_RUN_MS = 1500;
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const KEEP = 200;

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}
function nameKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

exports.handler = async function (event) {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }

  const score = body.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 1000000) return json(400, { error: 'score' });
  if (typeof body.runId !== 'string' || typeof body.token !== 'string' || typeof body.name !== 'string') return json(400, { error: 'invalid' });

  // 1. Who is this? The name plus the token their device was given when they logged in.
  const users = getStore({ name: 'users' });
  const key = nameKey(body.name);
  const user = key ? await users.get(key, { type: 'json' }) : null;
  const tokenHash = sha(body.token);
  if (!user || (user.tokens || []).indexOf(tokenHash) < 0) return json(401, { error: 'login' });

  // 2. Was there a real run? Each run id works once, whatever the outcome.
  const runs = getStore({ name: 'runs' });
  const run = await runs.get(body.runId, { type: 'json' });
  if (!run) return json(409, { error: 'run' });
  await runs.delete(body.runId);

  // 3. Is the score possible in the time that passed?
  const elapsed = Date.now() - run.startedAt;
  if (elapsed < MIN_RUN_MS || elapsed > MAX_RUN_MS) return json(403, { error: 'implausible' });
  if (score > BASE_ALLOWANCE + POINTS_PER_SECOND * (elapsed / 1000)) return json(403, { error: 'implausible' });

  // 4. Keep each player's best.
  const board = getStore({ name: 'leaderboard' });
  const list = (await board.get('scores', { type: 'json' })) || [];
  let entry = list.filter(function (e) { return e.key === key; })[0];
  let improved = false;
  if (!entry) { entry = { key: key, name: user.name, score: score, at: Date.now() }; list.push(entry); improved = true; }
  else if (score > entry.score) { entry.score = score; entry.at = Date.now(); improved = true; }
  entry.name = user.name;
  list.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
  await board.setJSON('scores', list.slice(0, KEEP));

  const visible = list.filter(function (e) { return !e.hidden; });
  const rank = visible.findIndex(function (e) { return e.key === key; }) + 1;
  return json(200, {
    ok: true, improved: improved, best: entry.score, rank: rank || null,
    top: visible.slice(0, 10).map(function (e) { return { name: e.name, score: e.score }; })
  });
};
