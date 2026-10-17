'use strict';

const { TEAMS, KEY, client, load, readBody } = require('../lib/game');

// First team to reach Redis HSETNX wins. HSETNX only writes the winner field
// when it is empty, so two simultaneous taps can never both win.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const team = Number(readBody(req).team);
  if (TEAMS.indexOf(team) < 0) return res.status(400).json({ error: 'Unknown team' });

  try {
    let state = await load();
    let won = false;
    let reason = '';

    if (!state.round || !state.open) {
      reason = 'closed';
    } else if (state.winner) {
      reason = 'late';
    } else if (state.excluded.indexOf(team) >= 0) {
      reason = 'locked';
    } else {
      const set = await client().hsetnx(KEY, 'winner', team);
      won = Number(set) === 1;
      if (!won) reason = 'late';
      state = await load();
    }

    res.status(200).json({ ok: true, won, reason, state });
  } catch (e) {
    res.status(500).json({ error: 'Game server unavailable' });
  }
};
