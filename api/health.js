const { handle, tick } = require('../lib/game-engine.cjs');

const ROOM_KEY = 'plot-twist-engine:rooms';
const LOCK_KEY = 'plot-twist-engine:lock';
const STATE_TTL_SECONDS = 8 * 60 * 60;
const LOCK_TTL_MS = 10_000;
const memoryRooms = globalThis.__plot_twist_memory_rooms || (globalThis.__plot_twist_memory_rooms = new Map());

function usingRedis() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis(command) {
  if (!usingRedis()) return undefined;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || 'Room storage request failed.');
  }
  return result.result;
}

async function readRooms() {
  if (!usingRedis()) {
    return new Map(memoryRooms);
  }
  const value = await redis(['GET', ROOM_KEY]);
  return value ? new Map(JSON.parse(value)) : new Map();
}

async function saveRooms(rooms) {
  if (!usingRedis()) {
    memoryRooms.clear();
    for (const [key, room] of rooms.entries()) {
      memoryRooms.set(key, room);
    }
    return;
  }
  await redis(['SET', ROOM_KEY, JSON.stringify(Array.from(rooms.entries())), 'EX', STATE_TTL_SECONDS]);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function acquireLock() {
  if (!usingRedis()) return 'memory-lock';
  const token = require('node:crypto').randomUUID();
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await redis(['SET', LOCK_KEY, token, 'NX', 'PX', LOCK_TTL_MS]);
    if (result === 'OK') return token;
    await delay(100);
  }
  throw new Error('The room is busy. Please try again.');
}

async function releaseLock(token) {
  if (!usingRedis() || token === 'memory-lock') return;
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  await redis(['EVAL', script, '1', LOCK_KEY, token]);
}

function expiredRoomNeedsTick(rooms, code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room || !room.epoch || !['vote', 'play'].includes(room.phase)) return false;
  const duration = room.phase === 'vote' ? 18_000 : 40_000;
  return Date.now() >= room.epoch + duration;
}

function capture(req, res, rooms) {
  return new Promise(resolve => {
    let status = 200;
    let headers = {};
    const buffered = {
      writeHead(code, values) { status = code; headers = values || {}; },
      end(body) { resolve({ status, headers, body }); }
    };
    handle(req, buffered, rooms).catch(error => resolve({
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: error.message || 'Request failed' })
    }));
  });
}

function reply(res, result) {
  res.writeHead(result.status, result.headers);
  res.end(result.body);
}

module.exports = async function api(req, res) {
  let token;
  try {
    const url = new URL(req.url, 'https://vercel.invalid');
    const isStateRead = req.method === 'GET' && url.pathname === '/api/state';

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return reply(res, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        body: JSON.stringify({ status: 'ok', service: 'plot-twist-engine', redis: usingRedis() })
      });
    }

    if (isStateRead) {
      let rooms = await readRooms();
      const roomCode = url.searchParams.get('room');
      if (expiredRoomNeedsTick(rooms, roomCode)) {
        token = await acquireLock();
        rooms = await readRooms();
        tick(rooms);
        await saveRooms(rooms);
        await releaseLock(token);
        token = undefined;
      }
      return reply(res, await capture(req, res, rooms));
    }

    token = await acquireLock();
    const rooms = await readRooms();
    tick(rooms);
    const result = await capture(req, res, rooms);
    await saveRooms(rooms);
    await releaseLock(token);
    token = undefined;
    return reply(res, result);
  } catch (error) {
    if (token) {
      try { await releaseLock(token); } catch {}
    }
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ error: error.message || 'The multiplayer service is temporarily unavailable.' }));
  }
};
