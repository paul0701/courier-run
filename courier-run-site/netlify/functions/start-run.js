const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

// Called when a run begins. Hands the game a one-use run id and notes the start time on the server.
exports.handler = async function (event) {
  connectLambda(event);
  const runs = getStore({ name: 'runs', consistency: 'strong' });
  const runId = crypto.randomUUID();
  await runs.setJSON(runId, { startedAt: Date.now() });

  // Now and then, tidy away runs that were started but never finished (older than 3 hours).
  if (Math.random() < 0.02) {
    try {
      const listing = await runs.list();
      let removed = 0;
      for (const b of listing.blobs || []) {
        if (removed >= 50) break;
        const r = await runs.get(b.key, { type: 'json' });
        if (r && Date.now() - r.startedAt > 3 * 60 * 60 * 1000) { await runs.delete(b.key); removed++; }
      }
    } catch (e) { /* tidying is optional */ }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ runId })
  };
};
