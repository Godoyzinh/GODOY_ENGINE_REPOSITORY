import path from 'node:path';
import { DEFAULT_SERVER_TICK_RATE, DEFAULT_WORLD_ID, SESSION_RECOVERY_SECONDS } from '../src/network/networkConstants.js';

export function loadServerSettings(overrides = {}) {
  const tickRate = readNumberEnv('GODOY_SERVER_TICK_RATE', DEFAULT_SERVER_TICK_RATE);
  const port = readNumberEnv('GODOY_MULTIPLAYER_PORT', 8787);
  const host = process.env.GODOY_MULTIPLAYER_HOST ?? '127.0.0.1';
  const dataDirectory = process.env.GODOY_SERVER_DATA_DIR ?? path.join(process.cwd(), 'server-data');

  return {
    host,
    port,
    tickRate,
    defaultWorldId: process.env.GODOY_DEFAULT_WORLD_ID ?? DEFAULT_WORLD_ID,
    dataDirectory,
    autoCreateDefaultWorld: process.env.GODOY_AUTO_CREATE_DEFAULT_WORLD !== '0',
    persistWorlds: process.env.GODOY_PERSIST_WORLDS !== '0',
    sessionRecoverySeconds: readNumberEnv('GODOY_SESSION_RECOVERY_SECONDS', SESSION_RECOVERY_SECONDS),
    maxHostedWorlds: readNumberEnv('GODOY_MAX_HOSTED_WORLDS', 8),
    ...overrides,
  };
}

function readNumberEnv(name, fallback) {
  const parsedValue = Number.parseInt(process.env[name] ?? '', 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}
