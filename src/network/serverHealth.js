const DEFAULT_HEALTH_TIMEOUT_MS = 900;

export function getServerHealthUrl(serverUrl) {
  const healthUrl = new URL(serverUrl);

  healthUrl.protocol = healthUrl.protocol === 'wss:' ? 'https:' : 'http:';
  healthUrl.pathname = '/health';
  healthUrl.search = '';
  healthUrl.hash = '';

  return healthUrl.toString();
}

export async function checkServerHealth(serverUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
} = {}) {
  const healthUrl = getServerHealthUrl(serverUrl);

  if (!fetchImpl) {
    return {
      ok: false,
      healthUrl,
      message: 'Server health checks are unavailable in this browser.',
    };
  }

  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(healthUrl, {
      cache: 'no-store',
      signal: controller?.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        healthUrl,
        message: `Dedicated server returned HTTP ${response.status}.`,
      };
    }

    const payload = await response.json().catch(() => ({}));

    return {
      ok: payload.ok !== false,
      healthUrl,
      payload,
      message: payload.ok === false
        ? 'Dedicated server responded but did not report ready.'
        : 'Dedicated server ready.',
    };
  } catch (error) {
    return {
      ok: false,
      healthUrl,
      error: error.name === 'AbortError' ? 'timeout' : error.message,
      message: `Dedicated server offline at ${healthUrl}. Run npm run dedicated:server first.`,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
