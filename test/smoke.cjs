const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { handle } = require("../server");
const health = require("../api/health");

async function call(handler, method, url, body, rooms) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;

  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = String(value);
    }
  };

  await handler(req, res, rooms);
  return res;
}

async function main() {
  const rooms = new Map();

  const createdResponse = await call(handle, "POST", "/api/create", { name: "Host" }, rooms);
  assert.equal(createdResponse.statusCode, 200, "room creation should succeed");
  const host = JSON.parse(createdResponse.body);
  assert.ok(host.code && host.playerId && host.token, "room creation should return a room and player session");

  const joinedResponse = await call(handle, "POST", "/api/join", { name: "Guest", code: host.code }, rooms);
  assert.equal(joinedResponse.statusCode, 200, "joining a room should succeed");
  const guest = JSON.parse(joinedResponse.body);
  assert.ok(guest.playerId && guest.token, "joining should return a player session");

  const startResponse = await call(handle, "POST", "/api/action", {
    room: host.code, player: host.playerId, token: host.token, action: "start"
  }, rooms);
  assert.equal(startResponse.statusCode, 200, "host should be able to start a two-player match");

  const voteStateResponse = await call(handle, "GET", `/api/state?room=${host.code}`, undefined, rooms);
  assert.equal(voteStateResponse.statusCode, 200, "room state should be readable");
  const voteState = JSON.parse(voteStateResponse.body);
  assert.equal(voteState.phase, "vote", "a new match should enter the voting phase");
  assert.ok(voteState.options.length >= 2, "the vote should offer rule twists");

  const option = voteState.options[0].id;
  for (const player of [host, guest]) {
    const voteResponse = await call(handle, "POST", "/api/action", {
      room: host.code, player: player.playerId, token: player.token, action: "vote", option
    }, rooms);
    assert.equal(voteResponse.statusCode, 200, "each player should be able to vote");
  }

  const playStateResponse = await call(handle, "GET", `/api/state?room=${host.code}`, undefined, rooms);
  assert.equal(playStateResponse.statusCode, 200);
  assert.equal(JSON.parse(playStateResponse.body).phase, "play", "votes should launch the round");

  const moveResponse = await call(handle, "POST", "/api/action", {
    room: host.code, player: host.playerId, token: host.token, action: "move", dx: 1, dy: 0
  }, rooms);
  assert.equal(moveResponse.statusCode, 200, "a player should be able to send a move");

  const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
  const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const healthResponse = await call(health, "GET", "/api/health");
    assert.equal(healthResponse.statusCode, 503, "health check should clearly report missing Redis configuration");
    assert.equal(JSON.parse(healthResponse.body).checks.redis, "missing_configuration");
  } finally {
    if (oldUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = oldUrl;
    if (oldToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  }

  console.log("Smoke tests passed: create, join, start, vote, play, move, and Redis configuration diagnostics.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
