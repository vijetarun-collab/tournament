'use strict';

const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const TEAMS = [1, 2, 3, 4, 5, 6];
const DEFAULT_NAMES = { 1: 'Red', 2: 'Amber', 3: 'Green', 4: 'Teal', 5: 'Blue', 6: 'Violet' };
const KEY = 'buzzer:game';
const FAIL_KEY = 'buzzer:pin_fails';

let redis = null;
function client() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Redis is not configured');
    redis = new Redis({ url, token });
  }
  return redis;
}

// The Redis client may hand back JSON fields as text or as parsed values.
function parse(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }
  return v;
}

function normalize(h) {
  h = h || {};
  const namesIn = parse(h.names, {}) || {};
  const scoresIn = parse(h.scores, {}) || {};
  const exIn = parse(h.excluded, []);
  const names = {};
  const scores = {};
  TEAMS.forEach((t) => {
    const n = typeof namesIn[t] === 'string' ? namesIn[t].trim() : '';
    names[t] = n || DEFAULT_NAMES[t];
    scores[t] = Number(scoresIn[t]) || 0;
  });
  const w = Number(h.winner);
  return {
    round: Number(h.round) || 0,
    attempt: Number(h.attempt) || 0,
    open: Number(h.open) === 1 || h.open === true,
    excluded: Array.isArray(exIn) ? exIn.map(Number).filter((t) => TEAMS.indexOf(t) >= 0) : [],
    names,
    scores,
    winner: TEAMS.indexOf(w) >= 0 ? w : 0,
  };
}

function serialize(g) {
  return {
    round: g.round,
    attempt: g.attempt,
    open: g.open ? 1 : 0,
    excluded: JSON.stringify(g.excluded),
    names: JSON.stringify(g.names),
    scores: JSON.stringify(g.scores),
  };
}

async function load() {
  const h = await client().hgetall(KEY);
  return normalize(h);
}

async function save(g) {
  await client().hset(KEY, serialize(g));
}

function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b) || {}; } catch (e) { return {}; }
  }
  return typeof b === 'object' ? b : {};
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientIp(req) {
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Returns true when the PIN is right, or { status, error } when it is not.
async function checkPin(req, pin) {
  const expected = process.env.HOST_PIN;
  if (!expected) return { status: 500, error: 'HOST_PIN is not set on the server' };
  const r = client();
  const failKey = FAIL_KEY + ':' + clientIp(req);
  const fails = Number(await r.get(failKey)) || 0;
  if (fails >= 20) return { status: 429, error: 'Too many wrong attempts. Try again in 15 minutes.' };
  if (safeEqual(pin == null ? '' : pin, expected)) return true;
  const n = await r.incr(failKey);
  if (Number(n) === 1) await r.expire(failKey, 900);
  return { status: 401, error: 'Wrong PIN' };
}

module.exports = {
  TEAMS, DEFAULT_NAMES, KEY,
  client, normalize, serialize, load, save, readBody, checkPin,
};
