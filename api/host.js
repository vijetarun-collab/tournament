'use strict';

const { TEAMS, DEFAULT_NAMES, KEY, client, load, save, readBody, checkPin } = require('../lib/game');

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = readBody(req);

  try {
    const gate = await checkPin(req, body.pin);
    if (gate !== true) return res.status(gate.status).json({ error: gate.error });

    const r = client();
    const g = await load();
    const team = Number(body.team);

    switch (body.action) {
      case 'check':
        break;

      case 'open': {
        // Close first and clear the old winner, then open, so no stale tap can slip in.
        g.round += 1;
        g.attempt = 0;
        g.excluded = [];
        g.open = false;
        await save(g);
        await r.hdel(KEY, 'winner');
        await r.hset(KEY, { open: 1 });
        break;
      }

      case 'close':
        g.open = false;
        await save(g);
        break;

      case 'correct': {
        if (!g.winner) return res.status(409).json({ error: 'No team has buzzed yet' });
        g.scores[g.winner] += clampInt(body.points, 0, 100000);
        g.open = false;
        await save(g);
        break;
      }

      case 'wrong': {
        if (!g.winner) return res.status(409).json({ error: 'No team has buzzed yet' });
        if (g.excluded.indexOf(g.winner) < 0) g.excluded.push(g.winner);
        g.attempt += 1;
        g.open = g.excluded.length < TEAMS.length;
        // Save the lock-out and new attempt while the old winner still blocks buzzes, then clear it.
        await save(g);
        await r.hdel(KEY, 'winner');
        break;
      }

      case 'none':
        g.open = false;
        await save(g);
        break;

      case 'adjust': {
        if (TEAMS.indexOf(team) < 0) return res.status(400).json({ error: 'Unknown team' });
        g.scores[team] += clampInt(body.delta, -1000, 1000);
        await save(g);
        break;
      }

      case 'rename': {
        if (TEAMS.indexOf(team) < 0) return res.status(400).json({ error: 'Unknown team' });
        const name = String(body.name == null ? '' : body.name).trim().slice(0, 20);
        g.names[team] = name || DEFAULT_NAMES[team];
        await save(g);
        break;
      }

      case 'resetScores':
        TEAMS.forEach((t) => { g.scores[t] = 0; });
        await save(g);
        break;

      case 'resetAll':
        await r.del(KEY);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(200).json({ ok: true, state: await load() });
  } catch (e) {
    const msg = e && (e.message === 'Redis is not configured') ? e.message : 'Game server unavailable';
    res.status(500).json({ error: msg });
  }
};
