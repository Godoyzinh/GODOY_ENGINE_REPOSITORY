import { DEFAULT_MULTIPLAYER_URL } from '../network/networkConstants.js';

const DEFAULT_RELEASE_VERSION = 'v0.1.0-alpha';
const DEFAULT_RELEASE_CHANNEL = 'Public Alpha';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function getRuntimeConfig() {
  return resolveRuntimeConfig({
    env: getViteEnv(),
    locationHref: getLocationHref(),
  });
}

export function resolveRuntimeConfig({
  env = {},
  locationHref = null,
  defaultMultiplayerUrl = DEFAULT_MULTIPLAYER_URL,
} = {}) {
  const url = createSafeUrl(locationHref);
  const queryServerUrl = url?.searchParams.get('server') ?? '';
  const envServerUrl = env.VITE_GODOY_WS_URL ?? env.VITE_GODOY_MULTIPLAYER_URL ?? '';
  const isLocalClient = url ? LOCAL_HOSTNAMES.has(url.hostname) : true;
  const fallbackServerUrl = isLocalClient ? defaultMultiplayerUrl : '';
  const multiplayerServerUrl = queryServerUrl || envServerUrl || fallbackServerUrl;
  const releaseVersion = env.VITE_GODOY_RELEASE_VERSION ?? DEFAULT_RELEASE_VERSION;
  const releaseChannel = env.VITE_GODOY_RELEASE_CHANNEL ?? DEFAULT_RELEASE_CHANNEL;
  const neuralEnabled = parseBooleanFlag(env.VITE_GODOY_NEURAL_ENABLED, false);
  const experimentalNeuralEvolution = parseBooleanFlag(env.VITE_GODOY_EXPERIMENTAL_NEURAL_EVOLUTION, false);

  return {
    appName: 'Godoy Engine',
    releaseVersion,
    releaseChannel,
    releaseLabel: `${releaseChannel} ${releaseVersion}`,
    environmentName: env.MODE ?? (env.PROD ? 'production' : 'development'),
    isProduction: env.PROD === true || env.MODE === 'production',
    multiplayerServerUrl,
    isMultiplayerConfigured: Boolean(multiplayerServerUrl),
    feedbackUrl: env.VITE_GODOY_FEEDBACK_URL ?? '',
    neuralEnabled,
    experimentalNeuralEvolution,
  };
}

function parseBooleanFlag(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getViteEnv() {
  return import.meta.env ?? {};
}

function getLocationHref() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.href;
}

function createSafeUrl(locationHref) {
  if (!locationHref) {
    return null;
  }

  try {
    return new URL(locationHref);
  } catch {
    return null;
  }
}
