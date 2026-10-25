const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT || 4181);
const appRoot = __dirname.endsWith('/test') ? __dirname.replace(/\/test$/, '') : __dirname;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server never became healthy.');
}

(async () => {
  const child = spawn(process.execPath, ['local-server.cjs'], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.stdout.on('data', chunk => process.stdout.write(chunk));

  try {
    await waitForServer();

    const createResponse = await fetch(`http://127.0.0.1:${PORT}/api/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Test' })
    });
    const created = await createResponse.json();
    if (!created || !created.room || !created.player || !created.token) {
      throw new Error(`Create room failed: ${JSON.stringify(created)}`);
    }

    const stateResponse = await fetch(`http://127.0.0.1:${PORT}/api/state?room=${created.room}&player=${created.player}`);
    const state = await stateResponse.json();
    if (!state || !state.room || state.room !== created.room) {
      throw new Error(`State fetch failed: ${JSON.stringify(state)}`);
    }

    console.log('Smoke test passed.');
  } catch (error) {
    console.error('Smoke test failed:', error.message);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
