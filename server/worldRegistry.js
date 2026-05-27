import { DEFAULT_WORLD_ID } from '../src/network/networkConstants.js';
import { WorldRuntime } from './worldRuntime.js';

export class WorldRegistry {
  constructor({ settings }) {
    this.settings = settings;
    this.worlds = new Map();

    if (settings.autoCreateDefaultWorld) {
      this.createWorld({
        id: settings.defaultWorldId ?? DEFAULT_WORLD_ID,
        name: 'Godoy Survival World',
        description: 'Default dedicated sandbox world.',
        seed: 'godoy-hosted-default',
      });
    }
  }

  createWorld(metadata) {
    if (this.worlds.size >= this.settings.maxHostedWorlds && !this.worlds.has(metadata.id)) {
      throw new Error('Maximum hosted worlds reached.');
    }

    const worldRuntime = new WorldRuntime({
      metadata,
      settings: this.settings,
    });

    this.worlds.set(worldRuntime.metadata.id, worldRuntime);

    return worldRuntime;
  }

  getWorld(worldId = null) {
    if (worldId) {
      return this.worlds.get(worldId) ?? null;
    }

    return this.worlds.get(this.settings.defaultWorldId) ?? null;
  }

  ensureWorld(worldId = this.settings.defaultWorldId) {
    return this.getWorld(worldId) ?? this.createWorld({
      id: worldId,
      name: `Hosted World ${worldId}`,
      description: 'Dynamically created hosted world.',
      seed: `seed:${worldId}`,
    });
  }

  update(deltaTime) {
    for (const worldRuntime of this.worlds.values()) {
      worldRuntime.update(deltaTime);
    }
  }

  listWorlds({ playerRegistry = null } = {}) {
    return [...this.worlds.values()].map((worldRuntime) => worldRuntime.getMetadata({
      connectedPlayers: playerRegistry?.getConnectedPlayersForWorld(worldRuntime.metadata.id).length ?? 0,
    }));
  }

  getWorldSummaries({ playerRegistry = null } = {}) {
    return [...this.worlds.values()].map((worldRuntime) => ({
      ...worldRuntime.getStateSummary(),
      connectedPlayers: playerRegistry?.getConnectedPlayersForWorld(worldRuntime.metadata.id).length ?? 0,
    }));
  }

  persistAll() {
    if (!this.settings.persistWorlds) {
      return;
    }

    for (const worldRuntime of this.worlds.values()) {
      worldRuntime.persist();
    }
  }

  getStats({ playerRegistry = null } = {}) {
    const worlds = this.listWorlds({ playerRegistry });
    const worldSummaries = this.getWorldSummaries({ playerRegistry });

    return {
      hostedWorlds: worlds.length,
      worldIds: worlds.map((world) => world.id),
      totalBlockEdits: worlds.reduce((total, world) => total + world.blockEdits, 0),
      totalCombatEvents: worlds.reduce((total, world) => total + world.combatEvents, 0),
      activeEditors: worldSummaries.reduce((total, world) => total + world.creator.activeEditors, 0),
      publishedWorlds: worldSummaries.filter((world) => world.creator.published).length,
    };
  }
}
