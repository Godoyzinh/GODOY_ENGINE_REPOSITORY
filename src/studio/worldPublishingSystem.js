export class WorldPublishingSystem {
  constructor({
    saveSystem,
    permissionSystem,
    worldSeed,
    initialState = null,
  }) {
    this.saveSystem = saveSystem;
    this.permissionSystem = permissionSystem;
    this.worldSeed = worldSeed;
    this.publishedWorlds = initialState?.publishedWorlds ?? [];
    this.currentDraft = {
      title: initialState?.draft?.title ?? 'Godoy Survival World',
      description: initialState?.draft?.description ?? 'A procedural sandbox survival world.',
      visibility: initialState?.draft?.visibility ?? 'private',
      tags: initialState?.draft?.tags ?? ['sandbox', 'survival'],
    };
    this.lastPublishEvent = 'Ready';
  }

  publishCurrentWorld({ terrainStats, networkSnapshot }) {
    if (!this.permissionSystem.canPublish()) {
      this.lastPublishEvent = 'Publish denied';
      return null;
    }

    const publishRecord = {
      id: `published-${Date.now()}`,
      worldId: networkSnapshot?.worldId ?? 'local',
      ownerId: this.permissionSystem.ownerId,
      title: this.currentDraft.title,
      description: this.currentDraft.description,
      visibility: this.currentDraft.visibility,
      tags: this.currentDraft.tags,
      worldSeed: this.worldSeed,
      thumbnail: this.createThumbnailPreparation({ terrainStats }),
      stats: {
        chunksLoaded: terrainStats?.chunksLoaded ?? 0,
        structuresGenerated: terrainStats?.structuresGenerated ?? 0,
        activeBiome: terrainStats?.activeBiome ?? 'Unknown',
      },
      publishedAt: new Date().toISOString(),
      status: 'published-draft',
    };

    this.publishedWorlds = [
      publishRecord,
      ...this.publishedWorlds.filter((world) => world.worldId !== publishRecord.worldId),
    ].slice(0, 12);
    this.lastPublishEvent = `Published ${publishRecord.title}`;
    this.saveSystem.recordPublishedWorld(publishRecord);

    return publishRecord;
  }

  createThumbnailPreparation({ terrainStats }) {
    return {
      type: 'procedural-thumbnail-prep',
      source: 'runtime-camera-future',
      seed: this.worldSeed,
      biome: terrainStats?.activeBiome ?? 'Unknown',
      generatedAt: new Date().toISOString(),
    };
  }

  getPersistenceState() {
    return {
      draft: this.currentDraft,
      publishedWorlds: this.publishedWorlds,
    };
  }

  getSnapshot() {
    return {
      publishedWorlds: this.publishedWorlds.length,
      latestPublishedWorldId: this.publishedWorlds[0]?.worldId ?? 'none',
      draftTitle: this.currentDraft.title,
      draftVisibility: this.currentDraft.visibility,
      thumbnailPreparation: this.publishedWorlds[0]?.thumbnail?.type ?? 'ready',
      lastPublishEvent: this.lastPublishEvent,
    };
  }
}
