export const PLAYTEST_SIMULATION_MODES = {
  quick: {
    id: 'quick',
    label: 'Quick Smoke',
    durationSeconds: 60,
    neural: {
      neuralEnabled: false,
      trainNeural: false,
      useChampion: true,
      populationSize: 8,
      generations: 1,
      episodeDuration: 60,
    },
  },
  standard: {
    id: 'standard',
    label: 'Standard Test',
    durationSeconds: 5 * 60,
    neural: {
      neuralEnabled: false,
      trainNeural: false,
      useChampion: true,
      populationSize: 16,
      generations: 2,
      episodeDuration: 5 * 60,
    },
  },
  stress: {
    id: 'stress',
    label: 'Stress Test',
    durationSeconds: 15 * 60,
  },
  evolution: {
    id: 'evolution',
    label: 'Evolution Test',
    durationSeconds: 30 * 60,
    multiRun: true,
    neural: {
      neuralEnabled: false,
      trainNeural: false,
      useChampion: true,
      populationSize: 8,
      generations: 3,
      episodeDuration: 30 * 60,
    },
  },
  'neural-train': {
    id: 'neural-train',
    label: 'Neural Train',
    durationSeconds: 60,
  },
};

export function resolvePlaytestMode(modeId = 'quick', overrides = {}) {
  const baseMode = PLAYTEST_SIMULATION_MODES[modeId] ?? PLAYTEST_SIMULATION_MODES.quick;

  return {
    ...baseMode,
    durationSeconds: Number.isFinite(overrides.durationSeconds)
      ? Math.max(1, overrides.durationSeconds)
      : baseMode.durationSeconds,
  };
}

export function getPlaytestModes() {
  return Object.values(PLAYTEST_SIMULATION_MODES).map((mode) => ({ ...mode }));
}
