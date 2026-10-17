'use strict';

const { load } = require('../lib/game');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const state = await load();
    res.status(200).json(state);
  } catch (e) {
    res.status(500).json({ error: 'Game server unavailable' });
  }
};
