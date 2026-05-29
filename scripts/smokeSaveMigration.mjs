import assert from 'node:assert/strict';
import { SaveSystem } from '../src/save/saveSystem.js';

const storage = createSeededStorage({
  'godoyEngine.world.v1': JSON.stringify({
    version: 1,
    worldSeed: 'legacy-alpha',
    chunks: {
      '0,0': {
        edits: [
          { blockKey: '0,1,0', blockId: 3 },
        ],
      },
    },
    entities: {
      'drop-1': {
        id: 'drop-1',
        type: 'droppedItem',
      },
    },
    weather: {
      state: 'rain',
      intensity: 0.5,
    },
  }),
});

const saveSystem = new SaveSystem({ storage });
const migratedWorld = saveSystem.serializeWorld();

assert.equal(migratedWorld.version, 2);
assert.equal(migratedWorld.worldSeed, 'legacy-alpha');
assert.deepEqual(saveSystem.loadStudioState().publishing.publishedWorlds, []);
assert.deepEqual(saveSystem.loadStudioState().prefabPlacements, []);
assert.equal(saveSystem.loadEntityStates().length, 1);
assert.equal(saveSystem.loadWeatherState().state, 'rain');

saveSystem.flushSimulationState({
  entityStates: [
    { id: 'npc-1', type: 'npc', persistable: true },
    { id: 'hostile-1', type: 'hostile', persistable: true },
  ],
  furnaceState: {
    activeJobs: [],
    completedJobs: 1,
    lastEvent: 'Completed Cook Berries',
  },
  weatherState: {
    state: 'clear',
    intensity: 0,
  },
  worldSimulationState: {
    activeSimulationCount: 1,
    lastEvent: 'Sleep skipped to dawn',
  },
  studioState: {
    publishing: {
      publishedWorlds: [
        { worldId: 'default', title: 'Alpha Test World' },
      ],
    },
  },
});

const stats = saveSystem.getPersistenceStats();

assert.equal(stats.persistedEntities, 2);
assert.equal(stats.persistedFurnaces, 1);
assert.equal(stats.weatherState, 'clear');
assert.equal(stats.worldSimulationSaved, true);
assert.equal(stats.publishedWorlds, 1);
assert.ok(stats.saveSizeBytes > 0);

console.log('smoke:save ok');

function createSeededStorage(entries) {
  const storageEntries = new Map(Object.entries(entries));

  return {
    getItem: (key) => storageEntries.get(key) ?? null,
    setItem: (key, value) => storageEntries.set(key, value),
  };
}
