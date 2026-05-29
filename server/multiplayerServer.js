import { createHash } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { PACKET_TYPES } from '../src/network/networkConstants.js';
import {
  createErrorPacket,
  createPingPacket,
  createPongPacket,
  createReconnectAcceptedPacket,
  createReconciliationPacket,
  createServerSnapshotPacket,
  createWelcomePacket,
  createWorldJoinedPacket,
  createWorldListPacket,
  estimatePacketBytes,
  parsePacket,
  serializePacket,
} from '../src/network/packetProtocol.js';
import { PlayerRegistry } from './playerRegistry.js';
import { loadServerSettings } from './serverSettings.js';
import { WorldRegistry } from './worldRegistry.js';

const CONNECTION_TIMEOUT_SECONDS = 30;

export function createMultiplayerServer(options = {}) {
  const settings = loadServerSettings(options);
  const clients = new Map();
  const playerRegistry = new PlayerRegistry({
    sessionRecoverySeconds: settings.sessionRecoverySeconds,
  });
  const worldRegistry = new WorldRegistry({ settings });
  const metrics = createEmptyMetrics({ tickRate: settings.tickRate });
  let nextClientNumber = 1;
  let server = null;
  let tickInterval = null;
  let lastTickAt = now();

  function start() {
    if (server) {
      return Promise.resolve(getAddress());
    }

    server = http.createServer(handleHttpRequest);
    server.on('upgrade', handleUpgrade);

    return new Promise((resolve) => {
      server.listen(settings.port, settings.host, () => {
        lastTickAt = now();
        tickInterval = setInterval(runServerTick, 1000 / settings.tickRate);
        resolve(getAddress());
      });
    });
  }

  function stop() {
    for (const client of clients.values()) {
      client.socket.destroy();
    }

    clients.clear();
    clearInterval(tickInterval);
    tickInterval = null;
    worldRegistry.persistAll();

    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(() => {
        server = null;
        resolve();
      });
    });
  }

  function handleHttpRequest(request, response) {
    if (request.method === 'OPTIONS') {
      respondNoContent(response);
      return;
    }

    if (request.url === '/health') {
      respondJson(response, {
        ok: true,
        clients: clients.size,
        tick: metrics.serverTick,
        worlds: worldRegistry.listWorlds({ playerRegistry }).length,
      });
      return;
    }

    if (request.url === '/worlds') {
      respondJson(response, {
        worlds: worldRegistry.listWorlds({ playerRegistry }),
      });
      return;
    }

    if (request.url === '/admin/status') {
      respondJson(response, getAdminStatus());
      return;
    }

    response.writeHead(426, {
      'Content-Type': 'text/plain',
    });
    response.end('Use WebSocket upgrade for Godoy multiplayer.');
  }

  function handleUpgrade(request, socket) {
    const webSocketKey = request.headers['sec-websocket-key'];

    if (!webSocketKey) {
      socket.destroy();
      return;
    }

    const acceptKey = createHash('sha1')
      .update(`${webSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n'));

    const connectionId = `client-${nextClientNumber}`;
    nextClientNumber += 1;

    const client = {
      connectionId,
      playerId: connectionId,
      nickname: connectionId,
      sessionToken: null,
      worldId: settings.defaultWorldId,
      socket,
      connectedAt: now(),
      lastSeenAt: now(),
      lastAckSequence: 0,
      packetsReceived: 0,
      packetsSent: 0,
    };

    clients.set(connectionId, client);
    metrics.connectionsAccepted += 1;
    metrics.activeConnections = clients.size;

    socket.on('data', (buffer) => handleSocketData(client, buffer));
    socket.on('close', () => handleDisconnect(client));
    socket.on('error', () => handleDisconnect(client));
  }

  function handleSocketData(client, buffer) {
    const frameBatch = decodeWebSocketFrames(buffer);

    for (const message of frameBatch.messages) {
      try {
        const packet = parsePacket(message);

        client.lastSeenAt = now();
        client.packetsReceived += 1;
        metrics.packetsReceived += 1;
        metrics.bytesReceived += Buffer.byteLength(message);
        metrics.lastPacketType = packet.type;
        routePacket(client, packet);
      } catch (error) {
        metrics.syncErrors += 1;
        metrics.lastError = error.message;
        sendPacket(client, createErrorPacket({
          code: 'bad-packet',
          message: error.message,
        }));
      }
    }

    if (frameBatch.hasCloseFrame) {
      handleDisconnect(client);
      client.socket.end();
    }
  }

  function routePacket(client, packet) {
    if (packet.type === PACKET_TYPES.hello) {
      handleHello(client, packet);
    } else if (packet.type === PACKET_TYPES.joinWorld) {
      handleJoinWorld(client, packet.payload?.worldId);
    } else if (packet.type === PACKET_TYPES.reconnect) {
      handleReconnect(client, packet);
    } else if (packet.type === PACKET_TYPES.playerSnapshot) {
      handlePlayerSnapshot(client, packet);
    } else if (packet.type === PACKET_TYPES.blockEdit) {
      handleBlockEdit(client, packet);
    } else if (packet.type === PACKET_TYPES.combatAction) {
      handleCombatAction(client, packet);
    } else if (packet.type === PACKET_TYPES.chunkInterest) {
      handleChunkInterest(client, packet);
    } else if (packet.type === PACKET_TYPES.studioEdit) {
      handleStudioEdit(client, packet);
    } else if (packet.type === PACKET_TYPES.publishWorld) {
      handlePublishWorld(client, packet);
    } else if (packet.type === PACKET_TYPES.permissionUpdate) {
      handlePermissionUpdate(client, packet);
    } else if (packet.type === PACKET_TYPES.ack) {
      handleAck(client, packet);
    } else if (packet.type === PACKET_TYPES.resendRequest) {
      handleResendRequest(client, packet);
    } else if (packet.type === PACKET_TYPES.ping) {
      sendPacket(client, createPongPacket(packet));
    } else if (packet.type === PACKET_TYPES.pong) {
      client.lastSeenAt = now();
    }
  }

  function handleHello(client, packet) {
    const targetWorldId = packet.payload?.worldId ?? settings.defaultWorldId;
    const worldRuntime = worldRegistry.ensureWorld(targetWorldId);
    const { player, recovered } = playerRegistry.registerConnection({
      connectionId: client.connectionId,
      playerId: packet.payload?.playerId ?? client.connectionId,
      nickname: packet.payload?.nickname ?? client.connectionId,
      sessionToken: packet.payload?.sessionToken,
      worldId: worldRuntime.metadata.id,
    });

    applyPlayerToClient(client, player);
    worldRuntime.ensureOwner(player.playerId);
    sendPacket(client, createWelcomePacket({
      playerId: player.playerId,
      serverTickRate: settings.tickRate,
      clientCount: clients.size,
      sessionToken: player.sessionToken,
      worldId: worldRuntime.metadata.id,
    }));
    sendPacket(client, createWorldListPacket({
      worlds: worldRegistry.listWorlds({ playerRegistry }),
    }));
    sendPacket(client, createWorldJoinedPacket({
      world: worldRuntime.getMetadata({
        connectedPlayers: playerRegistry.getConnectedPlayersForWorld(worldRuntime.metadata.id).length,
      }),
      playerId: player.playerId,
      reconnect: recovered,
    }));

    if (recovered) {
      sendPacket(client, createReconnectAcceptedPacket({
        playerId: player.playerId,
        sessionToken: player.sessionToken,
        world: worldRuntime.getMetadata(),
        recovered: true,
      }));
    } else {
      hydratePlayerFromWorld(player, worldRuntime);
      broadcastWorldExcept(client, {
        type: PACKET_TYPES.playerJoined,
        version: 1,
        sentAt: now(),
        payload: {
          playerId: player.playerId,
          nickname: player.nickname,
          worldId: worldRuntime.metadata.id,
        },
        meta: {},
      });
    }
  }

  function handleJoinWorld(client, worldId = settings.defaultWorldId) {
    const worldRuntime = worldRegistry.ensureWorld(worldId);
    const player = playerRegistry.getPlayer(client.playerId);

    if (player) {
      player.worldId = worldRuntime.metadata.id;
    }

    worldRuntime.ensureOwner(client.playerId);
    client.worldId = worldRuntime.metadata.id;
    sendPacket(client, createWorldJoinedPacket({
      world: worldRuntime.getMetadata({
        connectedPlayers: playerRegistry.getConnectedPlayersForWorld(worldRuntime.metadata.id).length,
      }),
      playerId: client.playerId,
    }));
  }

  function handleReconnect(client, packet) {
    const worldRuntime = worldRegistry.ensureWorld(packet.payload?.worldId ?? settings.defaultWorldId);
    const { player, recovered } = playerRegistry.registerConnection({
      connectionId: client.connectionId,
      playerId: packet.payload?.playerId ?? client.connectionId,
      nickname: client.nickname,
      sessionToken: packet.payload?.sessionToken,
      worldId: worldRuntime.metadata.id,
    });

    applyPlayerToClient(client, player);
    worldRuntime.ensureOwner(player.playerId);
    hydratePlayerFromWorld(player, worldRuntime);
    sendPacket(client, createReconnectAcceptedPacket({
      playerId: player.playerId,
      sessionToken: player.sessionToken,
      world: worldRuntime.getMetadata(),
      recovered,
    }));
  }

  function handlePlayerSnapshot(client, packet) {
    const playerSnapshot = packet.payload?.playerSnapshot;

    if (!playerSnapshot) {
      return;
    }

    const normalizedSnapshot = {
      ...playerSnapshot,
      playerId: client.playerId,
      nickname: client.nickname,
      worldId: client.worldId,
      serverReceivedAt: now(),
    };

    playerRegistry.updatePlayerSnapshot(client.playerId, normalizedSnapshot);
    worldRegistry.getWorld(client.worldId)?.updatePlayerSnapshot(client.playerId, normalizedSnapshot);
  }

  function handleBlockEdit(client, packet) {
    const worldRuntime = worldRegistry.getWorld(client.worldId);

    if (!worldRuntime) {
      return;
    }

    const edits = (packet.payload?.edits ?? []).map((edit) => ({
      ...edit,
      sourcePlayerId: client.playerId,
    }));

    worldRuntime.applyBlockEdits(edits);
    metrics.blockEditsReceived += edits.length;
  }

  function handleCombatAction(client, packet) {
    const worldRuntime = worldRegistry.getWorld(client.worldId);

    if (!worldRuntime) {
      return;
    }

    worldRuntime.applyCombatEvent({
      ...packet.payload,
      sourcePlayerId: client.playerId,
    });
    metrics.combatActionsReceived += 1;
  }

  function handleChunkInterest(client, packet) {
    const worldRuntime = worldRegistry.getWorld(client.worldId);

    if (!worldRuntime) {
      return;
    }

    worldRuntime.updateChunkInterest(client.playerId, packet.payload?.loadedChunkKeys ?? []);
  }

  function handleStudioEdit(client, packet) {
    const worldRuntime = worldRegistry.getWorld(packet.payload?.worldId ?? client.worldId);

    if (!worldRuntime) {
      return;
    }

    const result = worldRuntime.applyStudioEdit({
      playerId: client.playerId,
      tool: packet.payload?.tool,
      actionId: packet.payload?.actionId,
      edits: (packet.payload?.edits ?? []).map((edit) => ({
        ...edit,
        sourcePlayerId: client.playerId,
      })),
    });

    if (!result.ok) {
      metrics.permissionDenials += 1;
      sendPacket(client, createErrorPacket({
        code: result.reason,
        message: 'Studio edit rejected by world permissions.',
      }));
      return;
    }

    metrics.studioEditsReceived += result.edits.length;
  }

  function handlePublishWorld(client, packet) {
    const worldRuntime = worldRegistry.getWorld(packet.payload?.worldId ?? client.worldId);

    if (!worldRuntime) {
      return;
    }

    metrics.publishRequests += 1;

    const result = worldRuntime.publishWorld({
      playerId: client.playerId,
      metadata: packet.payload?.metadata ?? {},
    });

    if (!result.ok) {
      metrics.permissionDenials += 1;
      sendPacket(client, createErrorPacket({
        code: result.reason,
        message: 'World publish rejected by world permissions.',
      }));
      return;
    }

    metrics.publishSuccesses += 1;
    sendWorldListToAll();
  }

  function handlePermissionUpdate(client, packet) {
    const worldRuntime = worldRegistry.getWorld(packet.payload?.worldId ?? client.worldId);

    if (!worldRuntime) {
      return;
    }

    const wasUpdated = worldRuntime.updatePlayerRole({
      actingPlayerId: client.playerId,
      targetPlayerId: packet.payload?.targetPlayerId,
      role: packet.payload?.role,
    });

    if (!wasUpdated) {
      metrics.permissionDenials += 1;
      sendPacket(client, createErrorPacket({
        code: 'permission-update-denied',
        message: 'Permission update rejected by world authority.',
      }));
      return;
    }

    sendWorldListToAll();
  }

  function handleAck(client, packet) {
    client.lastAckSequence = Math.max(client.lastAckSequence, packet.payload?.sequence ?? 0);
    metrics.acksReceived += 1;
  }

  function handleResendRequest(client, packet) {
    const worldRuntime = worldRegistry.getWorld(packet.payload?.worldId ?? client.worldId);

    if (!worldRuntime) {
      return;
    }

    const snapshots = worldRuntime.getBufferedSnapshots(
      packet.payload?.fromSequence ?? 0,
      packet.payload?.toSequence ?? packet.payload?.fromSequence ?? 0,
      { playerId: client.playerId },
    );

    metrics.resendRequests += 1;

    if (snapshots.length === 0) {
      sendPacket(client, createReconciliationPacket({
        worldId: worldRuntime.metadata.id,
        authoritativeState: worldRuntime.createWorldPayload({ playerId: client.playerId }),
        reason: 'snapshot-buffer-miss',
      }));
      return;
    }

    for (const snapshot of snapshots) {
      sendPacket(client, snapshot.packet);
    }
  }

  function runServerTick() {
    const tickStartedAt = now();
    const deltaTime = Math.max(0, (tickStartedAt - lastTickAt) / 1000);

    lastTickAt = tickStartedAt;
    metrics.serverTick += 1;
    metrics.activeConnections = clients.size;
    metrics.lastTickDurationMs = 0;
    worldRegistry.update(deltaTime);

    const expiredPlayers = playerRegistry.cleanupExpiredSessions();

    for (const player of expiredPlayers) {
      const worldRuntime = worldRegistry.getWorld(player.worldId);
      worldRuntime?.removePlayerInterest(player.playerId);
    }

    for (const client of clients.values()) {
      if ((now() - client.lastSeenAt) / 1000 > CONNECTION_TIMEOUT_SECONDS) {
        metrics.timeoutRecoveries += 1;
        client.socket.destroy();
        continue;
      }

      sendPacket(client, createPingPacket(metrics.serverTick));
      sendServerSnapshot(client);
    }

    metrics.lastTickDurationMs = now() - tickStartedAt;
  }

  function sendServerSnapshot(client) {
    const worldRuntime = worldRegistry.getWorld(client.worldId);

    if (!worldRuntime) {
      return;
    }

    const sequence = metrics.serverTick;
    const packet = createServerSnapshotPacket({
      tick: metrics.serverTick,
      sequence,
      players: playerRegistry.getPlayerSnapshotsForWorld(worldRuntime.metadata.id, client.playerId),
      world: worldRuntime.createWorldPayload({ playerId: client.playerId }),
      metrics: createPublicMetrics(worldRuntime),
    });

    worldRuntime.bufferSnapshot({
      sequence,
      packet,
      playerId: client.playerId,
      sentAt: now(),
    });
    sendPacket(client, packet);
  }

  function handleDisconnect(client) {
    if (!clients.has(client.connectionId)) {
      return;
    }

    clients.delete(client.connectionId);
    playerRegistry.markDisconnected(client.playerId);
    metrics.activeConnections = clients.size;
    metrics.disconnects += 1;
    broadcastWorldExcept(client, {
      type: PACKET_TYPES.playerLeft,
      version: 1,
      sentAt: now(),
      payload: {
        playerId: client.playerId,
        nickname: client.nickname,
        recoverable: true,
      },
      meta: {},
    });
  }

  function sendPacket(client, packet) {
    if (client.socket.destroyed) {
      return false;
    }

    const serializedPacket = serializePacket(packet);
    const frame = encodeWebSocketFrame(serializedPacket);

    client.socket.write(frame);
    client.packetsSent += 1;
    metrics.packetsSent += 1;
    metrics.bytesSent += estimatePacketBytes(packet);
    metrics.lastPacketType = packet.type;

    return true;
  }

  function broadcastWorldExcept(sourceClient, packet) {
    for (const client of clients.values()) {
      if (client.connectionId !== sourceClient.connectionId && client.worldId === sourceClient.worldId) {
        sendPacket(client, packet);
      }
    }
  }

  function sendWorldListToAll() {
    const packet = createWorldListPacket({
      worlds: worldRegistry.listWorlds({ playerRegistry }),
    });

    for (const client of clients.values()) {
      sendPacket(client, packet);
    }
  }

  function applyPlayerToClient(client, player) {
    client.playerId = player.playerId;
    client.nickname = player.nickname;
    client.sessionToken = player.sessionToken;
    client.worldId = player.worldId;
  }

  function hydratePlayerFromWorld(player, worldRuntime) {
    const persistedPlayer = worldRuntime.getPlayerSnapshot(player.playerId);

    if (!persistedPlayer?.snapshot || player.lastSnapshot) {
      return;
    }

    playerRegistry.updatePlayerSnapshot(player.playerId, persistedPlayer.snapshot);
  }

  function createPublicMetrics(worldRuntime = null) {
    const playerStats = playerRegistry.getStats();
    const worldStats = worldRegistry.getStats({ playerRegistry });
    const snapshotStats = worldRuntime?.snapshotBuffer.getStats() ?? {};

    return {
      serverTick: metrics.serverTick,
      tickRate: settings.tickRate,
      activeConnections: clients.size,
      connectedPlayers: playerStats.connectedPlayers,
      hostedWorlds: worldStats.hostedWorlds,
      packetsSent: metrics.packetsSent,
      packetsReceived: metrics.packetsReceived,
      bytesSent: metrics.bytesSent,
      bytesReceived: metrics.bytesReceived,
      blockEditsReceived: metrics.blockEditsReceived,
      combatActionsReceived: metrics.combatActionsReceived,
      studioEditsReceived: metrics.studioEditsReceived,
      publishRequests: metrics.publishRequests,
      publishSuccesses: metrics.publishSuccesses,
      permissionDenials: metrics.permissionDenials,
      activeEditors: worldStats.activeEditors,
      publishedWorlds: worldStats.publishedWorlds,
      acksReceived: metrics.acksReceived,
      resendRequests: metrics.resendRequests,
      timeoutRecoveries: metrics.timeoutRecoveries,
      reconnects: playerStats.reconnects,
      reconnectMisses: playerStats.reconnectMisses,
      syncErrors: metrics.syncErrors,
      lastTickDurationMs: metrics.lastTickDurationMs,
      snapshotBuffer: snapshotStats,
    };
  }

  function getAdminStatus() {
    return {
      settings: {
        host: settings.host,
        port: getAddress().port,
        tickRate: settings.tickRate,
        defaultWorldId: settings.defaultWorldId,
        persistWorlds: settings.persistWorlds,
      },
      metrics: {
        ...createPublicMetrics(),
        activeConnections: clients.size,
      },
      players: playerRegistry.getStats(),
      worlds: worldRegistry.listWorlds({ playerRegistry }),
      worldStats: worldRegistry.getStats({ playerRegistry }),
      worldSummaries: worldRegistry.getWorldSummaries({ playerRegistry }),
      creatorPlatform: {
        activeEditors: worldRegistry.getStats({ playerRegistry }).activeEditors,
        publishedWorlds: worldRegistry.getStats({ playerRegistry }).publishedWorlds,
        studioEditsReceived: metrics.studioEditsReceived,
        publishRequests: metrics.publishRequests,
        publishSuccesses: metrics.publishSuccesses,
        permissionDenials: metrics.permissionDenials,
      },
    };
  }

  function getMetrics() {
    return getAdminStatus().metrics;
  }

  function getAddress() {
    const address = server?.address();

    if (!address || typeof address === 'string') {
      return {
        host: settings.host,
        port: settings.port,
      };
    }

    return {
      host: address.address,
      port: address.port,
    };
  }

  return {
    start,
    stop,
    getMetrics,
    getAddress,
    getAdminStatus,
  };
}

function respondJson(response, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function respondNoContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end();
}

function decodeWebSocketFrames(buffer) {
  const messages = [];
  let hasCloseFrame = false;
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;

    offset += 2;

    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      payloadLength = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    const mask = isMasked ? buffer.subarray(offset, offset + 4) : null;
    offset += isMasked ? 4 : 0;

    const payload = buffer.subarray(offset, offset + payloadLength);
    offset += payloadLength;

    if (opcode === 0x8) {
      hasCloseFrame = true;
      continue;
    }

    if (opcode !== 0x1) {
      continue;
    }

    const decodedPayload = Buffer.alloc(payload.length);

    for (let index = 0; index < payload.length; index += 1) {
      decodedPayload[index] = mask ? payload[index] ^ mask[index % 4] : payload[index];
    }

    messages.push(decodedPayload.toString('utf8'));
  }

  return {
    messages,
    hasCloseFrame,
  };
}

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message, 'utf8');
  const headerLength = payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10;
  const frame = Buffer.alloc(headerLength + payload.length);

  frame[0] = 0x81;

  if (payload.length < 126) {
    frame[1] = payload.length;
    payload.copy(frame, 2);
  } else if (payload.length <= 65535) {
    frame[1] = 126;
    frame.writeUInt16BE(payload.length, 2);
    payload.copy(frame, 4);
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
    payload.copy(frame, 10);
  }

  return frame;
}

function createEmptyMetrics({ tickRate }) {
  return {
    serverTick: 0,
    tickRate,
    activeConnections: 0,
    connectionsAccepted: 0,
    disconnects: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    blockEditsReceived: 0,
    combatActionsReceived: 0,
    studioEditsReceived: 0,
    publishRequests: 0,
    publishSuccesses: 0,
    permissionDenials: 0,
    acksReceived: 0,
    resendRequests: 0,
    timeoutRecoveries: 0,
    reconnects: 0,
    reconnectMisses: 0,
    syncErrors: 0,
    lastError: 'none',
    lastPacketType: 'none',
    lastTickDurationMs: 0,
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const multiplayerServer = createMultiplayerServer();
  const address = await multiplayerServer.start();

  process.stdout.write(`Godoy dedicated server listening on ws://${address.host}:${address.port}\n`);
}
