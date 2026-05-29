const DEFAULT_EVENT_LIMIT = 80;
const DEFAULT_CONSOLE_LIMIT = 32;
const SESSION_ID_PREFIX = 'local-session';
const CONSOLE_LEVELS = new Set(['error', 'warn']);

export class TelemetrySystem {
  constructor({
    runtimeConfig = null,
    eventLimit = DEFAULT_EVENT_LIMIT,
    consoleLimit = DEFAULT_CONSOLE_LIMIT,
    now = defaultNow,
  } = {}) {
    this.runtimeConfig = runtimeConfig;
    this.eventLimit = eventLimit;
    this.consoleLimit = consoleLimit;
    this.now = now;
    this.sessionId = createSessionId(now);
    this.startedAt = new Date().toISOString();
    this.startedAtMs = now();
    this.sessionDurationSeconds = 0;
    this.frameCount = 0;
    this.fps = {
      current: 0,
      average: 0,
      min: null,
      max: 0,
    };
    this.counts = {
      gameplayEvents: 0,
      deaths: 0,
      mining: 0,
      building: 0,
      combat: 0,
      combatHits: 0,
      feedbackReports: 0,
    };
    this.recentGameplayEvents = [];
    this.consoleEvents = [];
    this.isCaptureInstalled = false;
    this.originalConsoleMethods = new Map();
    this.boundWindowError = (event) => this.recordConsoleEvent('error', [event.message], {
      source: sanitizeSource(event.filename),
    });
    this.boundUnhandledRejection = (event) => this.recordConsoleEvent('error', [event.reason], {
      source: 'unhandledrejection',
    });
  }

  installGlobalCapture() {
    if (this.isCaptureInstalled || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('error', this.boundWindowError);
    window.addEventListener('unhandledrejection', this.boundUnhandledRejection);
    this.patchConsoleMethod('error');
    this.patchConsoleMethod('warn');
    this.isCaptureInstalled = true;
  }

  dispose() {
    if (!this.isCaptureInstalled || typeof window === 'undefined') {
      return;
    }

    window.removeEventListener('error', this.boundWindowError);
    window.removeEventListener('unhandledrejection', this.boundUnhandledRejection);

    for (const [level, originalMethod] of this.originalConsoleMethods.entries()) {
      console[level] = originalMethod;
    }

    this.originalConsoleMethods.clear();
    this.isCaptureInstalled = false;
  }

  updateFrame(deltaTime) {
    const safeDeltaTime = Math.max(deltaTime, 0.001);
    const instantFps = 1 / safeDeltaTime;

    this.frameCount += 1;
    this.sessionDurationSeconds = Math.max(0, (this.now() - this.startedAtMs) / 1000);
    this.fps.current = Math.round(instantFps);
    this.fps.average = this.frameCount === 1
      ? instantFps
      : this.fps.average + (instantFps - this.fps.average) / this.frameCount;
    this.fps.min = this.fps.min === null ? instantFps : Math.min(this.fps.min, instantFps);
    this.fps.max = Math.max(this.fps.max, instantFps);
  }

  recordGameplayEvent(type, payload = {}) {
    const normalizedType = normalizeType(type);

    this.counts.gameplayEvents += 1;

    if (normalizedType === 'death') {
      this.counts.deaths += 1;
    } else if (normalizedType === 'mining') {
      this.counts.mining += 1;
    } else if (normalizedType === 'building') {
      this.counts.building += Number(payload.count ?? 1);
    } else if (normalizedType === 'combat') {
      this.counts.combat += 1;
    } else if (normalizedType === 'combat-hit') {
      this.counts.combatHits += 1;
    } else if (normalizedType === 'feedback-report') {
      this.counts.feedbackReports += 1;
    }

    pushLimited(this.recentGameplayEvents, {
      type: normalizedType,
      atSeconds: round(this.sessionDurationSeconds, 2),
      payload: sanitizePayload(payload),
    }, this.eventLimit);
  }

  recordConsoleEvent(level, args = [], metadata = {}) {
    if (!CONSOLE_LEVELS.has(level)) {
      return;
    }

    pushLimited(this.consoleEvents, {
      level,
      message: formatConsoleMessage(args),
      source: sanitizeSource(metadata.source),
      atSeconds: round(this.sessionDurationSeconds, 2),
    }, this.consoleLimit);
  }

  getSnapshot() {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      sessionDurationSeconds: round(this.sessionDurationSeconds, 2),
      frameCount: this.frameCount,
      fps: {
        current: this.fps.current,
        average: Math.round(this.fps.average),
        min: this.fps.min === null ? null : Math.round(this.fps.min),
        max: Math.round(this.fps.max),
      },
      counts: { ...this.counts },
      consoleErrors: this.consoleEvents.filter((event) => event.level === 'error').length,
      consoleWarnings: this.consoleEvents.filter((event) => event.level === 'warn').length,
      recentGameplayEvents: this.recentGameplayEvents.map((event) => ({ ...event })),
      consoleEvents: this.consoleEvents.map((event) => ({ ...event })),
    };
  }

  patchConsoleMethod(level) {
    if (typeof console?.[level] !== 'function' || this.originalConsoleMethods.has(level)) {
      return;
    }

    const originalMethod = console[level].bind(console);

    this.originalConsoleMethods.set(level, console[level]);
    console[level] = (...args) => {
      this.recordConsoleEvent(level, args, { source: 'console' });
      originalMethod(...args);
    };
  }
}

function createSessionId(now) {
  return `${SESSION_ID_PREFIX}-${Math.round(now()).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function normalizeType(type) {
  return String(type || 'event')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .slice(0, 48);
}

function pushLimited(collection, item, limit) {
  collection.push(item);

  while (collection.length > limit) {
    collection.shift();
  }
}

function formatConsoleMessage(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.message;
      }

      if (typeof arg === 'string') {
        return arg;
      }

      if (arg === null || arg === undefined) {
        return String(arg);
      }

      if (typeof arg === 'object') {
        return safeJson(arg);
      }

      return String(arg);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

function sanitizePayload(payload) {
  const sanitizedPayload = {};

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'number') {
      sanitizedPayload[key] = round(value, 2);
    } else if (typeof value === 'boolean') {
      sanitizedPayload[key] = value;
    } else if (typeof value === 'string') {
      sanitizedPayload[key] = value.replace(/\s+/g, ' ').slice(0, 80);
    }
  }

  return sanitizedPayload;
}

function sanitizeSource(source) {
  if (!source) {
    return 'runtime';
  }

  try {
    const url = new URL(String(source));

    return url.pathname.split('/').pop() || 'runtime';
  } catch {
    return String(source).split(/[\\/]/).pop().slice(0, 80) || 'runtime';
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (nestedValue instanceof Error) {
        return nestedValue.message;
      }

      return nestedValue;
    }).slice(0, 180);
  } catch {
    return '[object]';
  }
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
