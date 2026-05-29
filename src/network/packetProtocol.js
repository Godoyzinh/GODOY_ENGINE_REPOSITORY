import { DEFAULT_WORLD_ID, MAX_BLOCK_EDITS_PER_PACKET, PACKET_TYPES } from './networkConstants.js';

export const PROTOCOL_VERSION = 1;

export function createPacket(type, payload = {}, meta = {}) {
  return {
    type,
    version: PROTOCOL_VERSION,
    sentAt: now(),
    payload,
    meta,
  };
}

export function createHelloPacket({ playerId, nickname, sessionToken = null, worldId = DEFAULT_WORLD_ID }) {
  return createPacket(PACKET_TYPES.hello, {
    playerId,
    nickname,
    sessionToken,
    worldId,
    capabilities: {
      snapshots: true,
      blockEdits: true,
      combatActions: true,
      chunkInterest: true,
      interpolation: true,
    },
  });
}

export function createWelcomePacket({ playerId, serverTickRate, clientCount, sessionToken, worldId }) {
  return createPacket(PACKET_TYPES.welcome, {
    playerId,
    serverTickRate,
    clientCount,
    sessionToken,
    worldId,
    authority: 'server',
  });
}

export function createWorldListPacket({ worlds }) {
  return createPacket(PACKET_TYPES.worldList, {
    worlds,
  });
}

export function createJoinWorldPacket({ worldId = DEFAULT_WORLD_ID, playerId, nickname }) {
  return createPacket(PACKET_TYPES.joinWorld, {
    worldId,
    playerId,
    nickname,
  });
}

export function createWorldJoinedPacket({ world, playerId, reconnect = false }) {
  return createPacket(PACKET_TYPES.worldJoined, {
    world,
    playerId,
    reconnect,
  });
}

export function createReconnectPacket({ playerId, sessionToken, worldId = DEFAULT_WORLD_ID }) {
  return createPacket(PACKET_TYPES.reconnect, {
    playerId,
    sessionToken,
    worldId,
  });
}

export function createReconnectAcceptedPacket({ playerId, sessionToken, world, recovered }) {
  return createPacket(PACKET_TYPES.reconnectAccepted, {
    playerId,
    sessionToken,
    world,
    recovered,
  });
}

export function createPlayerSnapshotPacket(playerSnapshot) {
  return createPacket(PACKET_TYPES.playerSnapshot, {
    playerSnapshot,
  });
}

export function createServerSnapshotPacket({
  tick,
  players,
  world,
  metrics,
  sequence = tick,
}) {
  return createPacket(PACKET_TYPES.serverSnapshot, {
    tick,
    sequence,
    players,
    world,
    metrics,
  });
}

export function createBlockEditPacket({ edits, sourcePlayerId, reason = 'player-edit' }) {
  return createPacket(PACKET_TYPES.blockEdit, {
    sourcePlayerId,
    reason,
    edits: edits.slice(0, MAX_BLOCK_EDITS_PER_PACKET).map(normalizeBlockEdit),
  });
}

export function createCombatActionPacket({ action, sourcePlayerId, tick }) {
  return createPacket(PACKET_TYPES.combatAction, {
    sourcePlayerId,
    tick,
    action,
  });
}

export function createChunkInterestPacket({ playerId, loadedChunkKeys }) {
  return createPacket(PACKET_TYPES.chunkInterest, {
    playerId,
    loadedChunkKeys,
  });
}

export function createStudioEditPacket({
  worldId = DEFAULT_WORLD_ID,
  playerId,
  edits,
  tool = 'studio',
  actionId = `studio-${Date.now()}`,
}) {
  return createPacket(PACKET_TYPES.studioEdit, {
    worldId,
    playerId,
    tool,
    actionId,
    edits: edits.slice(0, MAX_BLOCK_EDITS_PER_PACKET).map(normalizeBlockEdit),
  });
}

export function createPublishWorldPacket({
  worldId = DEFAULT_WORLD_ID,
  playerId,
  metadata,
}) {
  return createPacket(PACKET_TYPES.publishWorld, {
    worldId,
    playerId,
    metadata: normalizeWorldPublishMetadata(metadata),
  });
}

export function createPermissionUpdatePacket({
  worldId = DEFAULT_WORLD_ID,
  targetPlayerId,
  role,
  actingPlayerId,
}) {
  return createPacket(PACKET_TYPES.permissionUpdate, {
    worldId,
    targetPlayerId,
    role,
    actingPlayerId,
  });
}

export function createAckPacket({ sequence, worldId = DEFAULT_WORLD_ID }) {
  return createPacket(PACKET_TYPES.ack, {
    sequence,
    worldId,
  });
}

export function createResendRequestPacket({ fromSequence, toSequence, worldId = DEFAULT_WORLD_ID }) {
  return createPacket(PACKET_TYPES.resendRequest, {
    fromSequence,
    toSequence,
    worldId,
  });
}

export function createReconciliationPacket({ worldId, authoritativeState, reason }) {
  return createPacket(PACKET_TYPES.reconciliation, {
    worldId,
    authoritativeState,
    reason,
  });
}

export function createPingPacket(sequence) {
  return createPacket(PACKET_TYPES.ping, {
    sequence,
  });
}

export function createPongPacket(pingPacket) {
  return createPacket(PACKET_TYPES.pong, {
    sequence: pingPacket.payload?.sequence ?? 0,
    pingSentAt: pingPacket.sentAt,
  });
}

export function createErrorPacket({ code, message }) {
  return createPacket(PACKET_TYPES.error, {
    code,
    message,
  });
}

export function parsePacket(serializedPacket) {
  const packet = typeof serializedPacket === 'string'
    ? JSON.parse(serializedPacket)
    : serializedPacket;

  validatePacket(packet);
  return packet;
}

export function validatePacket(packet) {
  if (!packet || typeof packet !== 'object') {
    throw new Error('Packet must be an object.');
  }

  if (!Object.values(PACKET_TYPES).includes(packet.type)) {
    throw new Error(`Unsupported packet type: ${packet.type}`);
  }

  if (packet.version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${packet.version}`);
  }

  return true;
}

export function serializePacket(packet) {
  validatePacket(packet);
  return JSON.stringify(packet);
}

export function estimatePacketBytes(packet) {
  return new TextEncoder().encode(JSON.stringify(packet)).length;
}

function normalizeBlockEdit(edit) {
  return {
    worldX: Math.floor(edit.worldX),
    y: Math.floor(edit.y),
    worldZ: Math.floor(edit.worldZ),
    blockId: edit.blockId,
    action: edit.action ?? 'set',
    chunkKey: edit.chunkKey ?? null,
    sourcePlayerId: edit.sourcePlayerId ?? null,
  };
}

function normalizeWorldPublishMetadata(metadata = {}) {
  return {
    id: metadata.id ?? null,
    worldId: metadata.worldId ?? DEFAULT_WORLD_ID,
    title: String(metadata.title ?? 'Untitled World').slice(0, 80),
    description: String(metadata.description ?? '').slice(0, 500),
    visibility: metadata.visibility ?? 'private',
    tags: Array.isArray(metadata.tags) ? metadata.tags.slice(0, 12) : [],
    thumbnail: metadata.thumbnail ?? null,
    ownerId: metadata.ownerId ?? null,
    publishedAt: metadata.publishedAt ?? new Date().toISOString(),
    status: metadata.status ?? 'published-draft',
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
