import assert from 'node:assert/strict';
import { resolveRuntimeConfig } from '../src/config/runtimeConfig.js';
import { getServerHealthUrl, checkServerHealth } from '../src/network/serverHealth.js';

assertLocalDevelopmentFallback();
assertProductionRequiresConfiguredServer();
assertEnvironmentServerUrl();
assertQueryServerOverride();
await assertMissingServerHealthMessage();

console.log('smoke:runtime-config ok');

function assertLocalDevelopmentFallback() {
  const config = resolveRuntimeConfig({
    env: {
      MODE: 'development',
      DEV: true,
    },
    locationHref: 'http://127.0.0.1:5173/',
  });

  assert.equal(config.multiplayerServerUrl, 'ws://127.0.0.1:8787');
  assert.equal(config.isMultiplayerConfigured, true);
}

function assertProductionRequiresConfiguredServer() {
  const config = resolveRuntimeConfig({
    env: {
      MODE: 'production',
      PROD: true,
    },
    locationHref: 'https://alpha.godoy.example/',
  });

  assert.equal(config.multiplayerServerUrl, '');
  assert.equal(config.isMultiplayerConfigured, false);
}

function assertEnvironmentServerUrl() {
  const config = resolveRuntimeConfig({
    env: {
      MODE: 'production',
      PROD: true,
      VITE_GODOY_WS_URL: 'wss://godoy-alpha-server.example.com',
      VITE_GODOY_RELEASE_VERSION: 'v0.1.0-alpha',
      VITE_GODOY_RELEASE_CHANNEL: 'Public Alpha',
      VITE_GODOY_FEEDBACK_URL: 'https://example.com/feedback',
    },
    locationHref: 'https://alpha.godoy.example/',
  });

  assert.equal(config.multiplayerServerUrl, 'wss://godoy-alpha-server.example.com');
  assert.equal(config.releaseLabel, 'Public Alpha v0.1.0-alpha');
  assert.equal(config.feedbackUrl, 'https://example.com/feedback');
  assert.equal(getServerHealthUrl(config.multiplayerServerUrl), 'https://godoy-alpha-server.example.com/health');
}

function assertQueryServerOverride() {
  const config = resolveRuntimeConfig({
    env: {
      MODE: 'production',
      PROD: true,
      VITE_GODOY_WS_URL: 'wss://configured.example.com',
    },
    locationHref: 'https://alpha.godoy.example/?server=wss%3A%2F%2Foverride.example.com',
  });

  assert.equal(config.multiplayerServerUrl, 'wss://override.example.com');
}

async function assertMissingServerHealthMessage() {
  const result = await checkServerHealth('', {
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /VITE_GODOY_WS_URL/);
}
