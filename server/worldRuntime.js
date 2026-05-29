import fs from 'node:fs';
import path from 'node:path';
import { SnapshotBuffer } from './snapshotBuffer.js';

const MAX_WORLD_BLOCK_EDITS = 1024;
const MAX_COMBAT_EVENTS = 256;
const MAX_STUDIO_HISTORY = 128;
const EDITOR_ACTIVITY_TIMEOUT_MS = 30000;
const CREATOR_ROLES = {
  owner: 'owner',
  admin: 'admin',
  editor: 'editor',
  viewer: 'viewer',
};

export class WorldRuntime {
  constructor({ metadata, settings }) {
    this.metadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      maxPlayers: 16,
      tags: ['sandbox', 'survival'],
      ...metadata,
    };
    this.settings = settings;
    this.snapshotBuffer = new SnapshotBuffer();
    this.state = this.loadState();
    this.tick = this.state.tick ?? 0;
    this.accumulator = 0;
    this.metrics = createEmptyWorldMetrics();
    this.metrics.playerSnapshots = Object.keys(this.state.playerSnapshots).length;
    this.applyCreatorMetadataToRuntime();
    this.lastPersistAt = now();
  }

  update(deltaTime) {
    const startedAt = now();

    this.accumulator += deltaTime;
    this.tick += 1;
    this.state.tick = this.tick;
    this.state.updatedAt = new Date().toISOString();
    this.metadata.updatedAt = this.state.updatedAt;
    this.cleanupEditorActivity();
    this.metrics.tickLoadMs = now() - startedAt;

    if (this.settings.persistWorlds && now() - this.lastPersistAt > 5000) {
      this.persist();
    }
  }

  applyBlockEdits(edits) {
    const normalizedEdits = edits.map((edit) => ({
      ...edit,
      worldId: this.metadata.id,
      serverTick: this.tick,
      appliedAt: now(),
    }));

    this.state.blockEdits.push(...normalizedEdits);
    this.state.blockEdits = this.state.blockEdits.slice(-MAX_WORLD_BLOCK_EDITS);
    this.metrics.blockEdits += normalizedEdits.length;

    return normalizedEdits;
  }

  applyStudioEdit({ playerId, edits, tool = 'studio', actionId }) {
    if (!this.canPlayerEdit(playerId)) {
      this.metrics.permissionDenials += 1;
      return {
        ok: false,
        reason: 'edit-permission-denied',
      };
    }

    this.updateEditorActivity(playerId, {
      tool,
      actionId,
    });

    const appliedEdits = this.applyBlockEdits(edits.map((edit) => ({
      ...edit,
      reason: 'studio-edit',
      tool,
      actionId,
    })));

    this.state.creator.studioHistory.push({
      actionId,
      playerId,
      tool,
      editCount: appliedEdits.length,
      appliedAt: new Date().toISOString(),
    });
    this.state.creator.studioHistory = this.state.creator.studioHistory.slice(-MAX_STUDIO_HISTORY);
    this.metrics.studioEdits += appliedEdits.length;

    return {
      ok: true,
      edits: appliedEdits,
    };
  }

  applyCombatEvent(event) {
    const combatEvent = {
      ...event,
      worldId: this.metadata.id,
      serverTick: this.tick,
      appliedAt: now(),
    };

    this.state.combatEvents.push(combatEvent);
    this.state.combatEvents = this.state.combatEvents.slice(-MAX_COMBAT_EVENTS);
    this.metrics.combatEvents += 1;

    return combatEvent;
  }

  updatePlayerSnapshot(playerId, playerSnapshot) {
    this.state.playerSnapshots[playerId] = {
      snapshot: playerSnapshot,
      updatedAt: new Date().toISOString(),
      serverTick: this.tick,
    };
    this.metrics.playerSnapshots = Object.keys(this.state.playerSnapshots).length;
  }

  getPlayerSnapshot(playerId) {
    return this.state.playerSnapshots[playerId] ?? null;
  }

  ensureOwner(playerId) {
    if (!playerId || this.state.creator.ownerId) {
      return;
    }

    this.state.creator.ownerId = playerId;
    this.state.creator.roles[playerId] = CREATOR_ROLES.owner;
    this.metadata.ownerId = playerId;
  }

  getPlayerRole(playerId) {
    if (playerId === this.state.creator.ownerId) {
      return CREATOR_ROLES.owner;
    }

    return this.state.creator.roles[playerId] ?? CREATOR_ROLES.viewer;
  }

  canPlayerEdit(playerId) {
    return [
      CREATOR_ROLES.owner,
      CREATOR_ROLES.admin,
      CREATOR_ROLES.editor,
    ].includes(this.getPlayerRole(playerId));
  }

  canPlayerPublish(playerId) {
    return [
      CREATOR_ROLES.owner,
      CREATOR_ROLES.admin,
    ].includes(this.getPlayerRole(playerId));
  }

  canPlayerAdmin(playerId) {
    return [
      CREATOR_ROLES.owner,
      CREATOR_ROLES.admin,
    ].includes(this.getPlayerRole(playerId));
  }

  updatePlayerRole({ actingPlayerId, targetPlayerId, role }) {
    if (!this.canPlayerAdmin(actingPlayerId) || targetPlayerId === this.state.creator.ownerId) {
      this.metrics.permissionDenials += 1;
      return false;
    }

    this.state.creator.roles[targetPlayerId] = role;
    return true;
  }

  updateEditorActivity(playerId, metadata = {}) {
    if (!playerId || !this.canPlayerEdit(playerId)) {
      return;
    }

    this.state.creator.activeEditors[playerId] = {
      playerId,
      ...metadata,
      lastSeenAt: now(),
    };
  }

  cleanupEditorActivity() {
    for (const [playerId, editor] of Object.entries(this.state.creator.activeEditors)) {
      if (now() - editor.lastSeenAt > EDITOR_ACTIVITY_TIMEOUT_MS) {
        delete this.state.creator.activeEditors[playerId];
      }
    }
  }

  publishWorld({ playerId, metadata }) {
    if (!this.canPlayerPublish(playerId)) {
      this.metrics.permissionDenials += 1;
      return {
        ok: false,
        reason: 'publish-permission-denied',
      };
    }

    const publishRecord = {
      id: metadata.id ?? `published-${Date.now()}`,
      worldId: this.metadata.id,
      title: metadata.title ?? this.metadata.name,
      description: metadata.description ?? this.metadata.description ?? '',
      visibility: metadata.visibility ?? 'private',
      tags: metadata.tags ?? this.metadata.tags,
      thumbnail: metadata.thumbnail ?? null,
      ownerId: this.state.creator.ownerId ?? playerId,
      status: metadata.status ?? 'published-draft',
      publishedAt: metadata.publishedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state.creator.publish = {
      ...publishRecord,
      isPublished: true,
    };
    this.state.creator.publishHistory.unshift(publishRecord);
    this.state.creator.publishHistory = this.state.creator.publishHistory.slice(0, 12);
    this.metadata.name = publishRecord.title;
    this.metadata.description = publishRecord.description;
    this.metadata.published = true;
    this.metadata.visibility = publishRecord.visibility;
    this.metrics.publishEvents += 1;

    return {
      ok: true,
      publishRecord,
    };
  }

  applyCreatorMetadataToRuntime() {
    if (this.state.creator.ownerId) {
      this.metadata.ownerId = this.state.creator.ownerId;
    }

    if (this.state.creator.publish.isPublished) {
      this.metadata.name = this.state.creator.publish.title ?? this.metadata.name;
      this.metadata.description = this.state.creator.publish.description ?? this.metadata.description;
      this.metadata.published = true;
      this.metadata.visibility = this.state.creator.publish.visibility;
    }
  }

  updateChunkInterest(playerId, loadedChunkKeys) {
    this.state.chunkInterests[playerId] = loadedChunkKeys;
  }

  removePlayerInterest(playerId) {
    delete this.state.chunkInterests[playerId];
  }

  createWorldPayload({ playerId }) {
    const interestedChunks = new Set(this.state.chunkInterests[playerId] ?? []);
    const relevantBlockEdits = this.state.blockEdits.filter((edit) => (
      edit.sourcePlayerId !== playerId &&
      (interestedChunks.size === 0 || !edit.chunkKey || interestedChunks.has(edit.chunkKey))
    ));

    return {
      worldId: this.metadata.id,
      metadata: this.getMetadata(),
      blockEdits: relevantBlockEdits,
      combatEvents: this.state.combatEvents.filter((event) => event.sourcePlayerId !== playerId),
      entitySnapshots: this.state.entitySnapshots,
      chunkSync: {
        requestedChunks: interestedChunks.size,
        syncedChunks: interestedChunks.size,
        deltaCompression: 'hash-delta-prep',
        reconciliationReady: true,
      },
      creator: this.getCreatorSummary(),
    };
  }

  bufferSnapshot(snapshot) {
    const bufferedSnapshot = this.snapshotBuffer.push({
      ...snapshot,
      worldId: this.metadata.id,
    });

    this.metrics.bufferedSnapshots = this.snapshotBuffer.getStats().bufferedSnapshots;

    return bufferedSnapshot;
  }

  getBufferedSnapshots(fromSequence, toSequence, { playerId = null } = {}) {
    return this.snapshotBuffer.getRange(fromSequence, toSequence)
      .filter((snapshot) => !playerId || snapshot.playerId === playerId);
  }

  getMetadata({ connectedPlayers = 0 } = {}) {
    return {
      ...this.metadata,
      tick: this.tick,
      connectedPlayers,
      blockEdits: this.state.blockEdits.length,
      combatEvents: this.state.combatEvents.length,
      persistedPlayers: Object.keys(this.state.playerSnapshots).length,
      ownerId: this.state.creator.ownerId,
      roles: this.state.creator.roles,
      activeEditors: Object.keys(this.state.creator.activeEditors).length,
      published: this.state.creator.publish.isPublished,
      visibility: this.state.creator.publish.visibility,
    };
  }

  getStateSummary() {
    return {
      worldId: this.metadata.id,
      tick: this.tick,
      blockEdits: this.state.blockEdits.length,
      combatEvents: this.state.combatEvents.length,
      persistedPlayers: Object.keys(this.state.playerSnapshots).length,
      chunkInterests: Object.keys(this.state.chunkInterests).length,
      creator: this.getCreatorSummary(),
      buffer: this.snapshotBuffer.getStats(),
      metrics: this.metrics,
    };
  }

  getCreatorSummary() {
    return {
      ownerId: this.state.creator.ownerId,
      roles: this.state.creator.roles,
      activeEditors: Object.keys(this.state.creator.activeEditors).length,
      published: this.state.creator.publish.isPublished,
      publishedWorldId: this.state.creator.publish.id ?? null,
      title: this.state.creator.publish.title ?? this.metadata.name,
      visibility: this.state.creator.publish.visibility ?? 'private',
      studioHistory: this.state.creator.studioHistory.length,
      publishEvents: this.state.creator.publishHistory.length,
      permissionDenials: this.metrics.permissionDenials,
    };
  }

  loadState() {
    const statePath = this.getStatePath();

    if (!fs.existsSync(statePath)) {
      return createEmptyWorldState(this.metadata.id);
    }

    try {
      return {
        ...normalizeWorldState(this.metadata.id, JSON.parse(fs.readFileSync(statePath, 'utf8'))),
      };
    } catch {
      return createEmptyWorldState(this.metadata.id);
    }
  }

  persist() {
    const statePath = this.getStatePath();

    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
    this.lastPersistAt = now();
    this.metrics.persistenceWrites += 1;
  }

  getStatePath() {
    return path.join(this.settings.dataDirectory, 'worlds', `${this.metadata.id}.json`);
  }
}

function createEmptyWorldState(worldId) {
  return {
    version: 1,
    worldId,
    tick: 0,
    blockEdits: [],
    combatEvents: [],
    playerSnapshots: {},
    entitySnapshots: [],
    chunkInterests: {},
    creator: createEmptyCreatorState(),
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyWorldMetrics() {
  return {
    tickLoadMs: 0,
    blockEdits: 0,
    studioEdits: 0,
    combatEvents: 0,
    playerSnapshots: 0,
    bufferedSnapshots: 0,
    persistenceWrites: 0,
    publishEvents: 0,
    permissionDenials: 0,
  };
}

function createEmptyCreatorState() {
  return {
    ownerId: null,
    roles: {},
    activeEditors: {},
    studioHistory: [],
    publish: {
      isPublished: false,
      visibility: 'private',
      title: null,
      description: '',
      thumbnail: null,
    },
    publishHistory: [],
  };
}

function normalizeWorldState(worldId, sourceState) {
  const emptyState = createEmptyWorldState(worldId);

  return {
    ...emptyState,
    ...sourceState,
    playerSnapshots: sourceState.playerSnapshots ?? {},
    chunkInterests: sourceState.chunkInterests ?? {},
    creator: {
      ...emptyState.creator,
      ...(sourceState.creator ?? {}),
      roles: sourceState.creator?.roles ?? {},
      activeEditors: sourceState.creator?.activeEditors ?? {},
      studioHistory: sourceState.creator?.studioHistory ?? [],
      publish: {
        ...emptyState.creator.publish,
        ...(sourceState.creator?.publish ?? {}),
      },
      publishHistory: sourceState.creator?.publishHistory ?? [],
    },
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
