const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { handle, tick } = require('./lib/game-engine.cjs');

const PORT = Number(process.env.PORT || 4173);
const rooms = new Map();
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function safeFilePath(requestPath) {
  const normalized = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = normalized.replace(/^\/+/, '');
  const filePath = path.join(ROOT_DIR, safePath);
  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }
  return filePath;
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'content-type': MIME_TYPES[extension] || 'application/octet-stream',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(body);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'plot-twist-engine',
      environment: process.env.NODE_ENV || 'development',
      redisConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      time: new Date().toISOString()
    });
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      await handle(req, res, rooms);
      return;
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'The multiplayer service failed unexpectedly.' });
    }
  }

  if (serveStatic(req, res)) {
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

setInterval(() => tick(rooms), 500);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Plot Twist Engine listening on http://localhost:${PORT}`);
});
