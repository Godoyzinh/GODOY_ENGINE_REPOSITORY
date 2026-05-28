import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMultiplayerServer } from '../server/multiplayerServer.js';
import { PlayerRegistry } from '../server/playerRegistry.js';

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'godoy-server-smoke-'));
const server = createMultiplayerServer({
  port: 0,
  dataDirectory,
  persistWorlds: false,
  tickRate: 10,
});

try {
  const address = await server.start();
  const baseUrl = `http://${address.host}:${address.port}`;
  const healthResponse = await fetch(`${baseUrl}/health`);
  const health = await readJsonResponse(healthResponse, `${baseUrl}/health`);
  const adminStatus = await readJson(`${baseUrl}/admin/status`);

  assert.equal(healthResponse.headers.get('access-control-allow-origin'), '*');
  assert.equal(health.ok, true);
  assert.equal(adminStatus.settings.tickRate, 10);
  assert.ok(adminStatus.worlds.length >= 1);
  assert.ok(adminStatus.metrics.hostedWorlds >= 1);

  const playerRegistry = new PlayerRegistry({ sessionRecoverySeconds: 30 });
  const firstConnection = playerRegistry.registerConnection({
    connectionId: 'client-a',
    playerId: 'player-a',
    nickname: 'Alpha Tester',
    worldId: 'default',
  });

  playerRegistry.markDisconnected('player-a');

  const recoveredConnection = playerRegistry.registerConnection({
    connectionId: 'client-b',
    playerId: 'player-a',
    nickname: 'Alpha Tester',
    sessionToken: firstConnection.player.sessionToken,
    worldId: 'default',
  });

  assert.equal(recoveredConnection.recovered, true);
  assert.equal(playerRegistry.getStats().reconnects, 1);

  console.log('smoke:multiplayer ok');
} finally {
  await server.stop();
  await rm(dataDirectory, {
    recursive: true,
    force: true,
  });
}

async function readJson(url) {
  const response = await fetch(url);

  return readJsonResponse(response, url);
}

async function readJsonResponse(response, url) {
  assert.equal(response.ok, true, `${url} should respond successfully`);
  return response.json();
}
