import { MAX_BLOCK_EDITS_PER_PACKET, PACKET_TYPES } from './networkConstants.js';

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

export function createHelloPacket({ playerId, nickname }) {
  return createPacket(PACKET_TYPES.hello, {
    playerId,
    nickname,
    capabilities: {
      snapshots: true,
      blockEdits: true,
      combatActions: true,
      chunkInterest: true,
      interpolation: true,
    },
  });
}

export function createWelcomePacket({ playerId, serverTickRate, clientCount }) {
  return createPacket(PACKET_TYPES.welcome, {
    playerId,
    serverTickRate,
    clientCount,
    authority: 'server',
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
}) {
  return createPacket(PACKET_TYPES.serverSnapshot, {
    tick,
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
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
