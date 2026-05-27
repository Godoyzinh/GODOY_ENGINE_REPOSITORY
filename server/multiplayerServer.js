import { createHash } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SERVER_TICK_RATE,
  MAX_BLOCK_EDITS_PER_PACKET,
  PACKET_TYPES,
} from '../src/network/networkConstants.js';
import {
  createErrorPacket,
  createPingPacket,
  createPongPacket,
  createServerSnapshotPacket,
  createWelcomePacket,
  estimatePacketBytes,
  parsePacket,
  serializePacket,
} from '../src/network/packetProtocol.js';

const DEFAULT_PORT = Number.parseInt(process.env.GODOY_MULTIPLAYER_PORT ?? '8787', 10);
const MAX_WORLD_BLOCK_EDITS = 512;
const MAX_COMBAT_EVENTS = 128;
const CONNECTION_TIMEOUT_SECONDS = 30;

export function createMultiplayerServer({
  port = DEFAULT_PORT,
  tickRate = DEFAULT_SERVER_TICK_RATE,
  host = '127.0.0.1',
} = {}) {
  const clients = new Map();
  const worldState = {
    blockEdits: [],
    combatEvents: [],
    entitySnapshots: [],
    chunkInterests: new Map(),
  };
  const metrics = createEmptyMetrics({ tickRate });
  let nextClientNumber = 1;
  let server = null;
  let tickInterval = null;

  function start() {
    if (server) {
      return Promise.resolve(getAddress());
    }

    server = http.createServer(handleHttpRequest);
    server.on('upgrade', handleUpgrade);

    return new Promise((resolve) => {
      server.listen(port, host, () => {
        tickInterval = setInterval(runServerTick, 1000 / tickRate);
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
    if (request.url === '/health') {
      const body = JSON.stringify({
        ok: true,
        clients: clients.size,
        tick: metrics.serverTick,
      });

      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      response.end(body);
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
      socket,
      playerSnapshot: null,
      connectedAt: now(),
      lastSeenAt: now(),
      chunkInterest: [],
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
    for (const message of decodeWebSocketFrames(buffer)) {
      try {
        const packet = parsePacket(message);

        client.lastSeenAt = now();
        client.packetsReceived += 1;
        metrics.packetsReceived += 1;
        metrics.bytesReceived += Buffer.byteLength(message);
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
  }

  function routePacket(client, packet) {
    if (packet.type === PACKET_TYPES.hello) {
      handleHello(client, packet);
    } else if (packet.type === PACKET_TYPES.playerSnapshot) {
      handlePlayerSnapshot(client, packet);
    } else if (packet.type === PACKET_TYPES.blockEdit) {
      handleBlockEdit(client, packet);
    } else if (packet.type === PACKET_TYPES.combatAction) {
      handleCombatAction(client, packet);
    } else if (packet.type === PACKET_TYPES.chunkInterest) {
      handleChunkInterest(client, packet);
    } else if (packet.type === PACKET_TYPES.ping) {
      sendPacket(client, createPongPacket(packet));
    } else if (packet.type === PACKET_TYPES.pong) {
      client.lastSeenAt = now();
    }
  }

  function handleHello(client, packet) {
    client.playerId = packet.payload?.playerId ?? client.connectionId;
    client.nickname = packet.payload?.nickname ?? client.playerId;
    sendPacket(client, createWelcomePacket({
      playerId: client.playerId,
      serverTickRate: tickRate,
      clientCount: clients.size,
    }));
    broadcastExcept(client.connectionId, {
      type: PACKET_TYPES.playerJoined,
      version: 1,
      sentAt: now(),
      payload: {
        playerId: client.playerId,
        nickname: client.nickname,
      },
      meta: {},
    });
  }

  function handlePlayerSnapshot(client, packet) {
    const playerSnapshot = packet.payload?.playerSnapshot;

    if (!playerSnapshot) {
      return;
    }

    client.playerSnapshot = {
      ...playerSnapshot,
      playerId: client.playerId,
      nickname: client.nickname,
      serverReceivedAt: now(),
    };
  }

  function handleBlockEdit(client, packet) {
    const edits = (packet.payload?.edits ?? [])
      .slice(0, MAX_BLOCK_EDITS_PER_PACKET)
      .map((edit) => ({
        ...edit,
        sourcePlayerId: client.playerId,
        serverTick: metrics.serverTick,
      }));

    worldState.blockEdits.push(...edits);
    worldState.blockEdits = worldState.blockEdits.slice(-MAX_WORLD_BLOCK_EDITS);
    metrics.blockEditsReceived += edits.length;
  }

  function handleCombatAction(client, packet) {
    worldState.combatEvents.push({
      ...packet.payload,
      sourcePlayerId: client.playerId,
      serverTick: metrics.serverTick,
    });
    worldState.combatEvents = worldState.combatEvents.slice(-MAX_COMBAT_EVENTS);
    metrics.combatActionsReceived += 1;
  }

  function handleChunkInterest(client, packet) {
    client.chunkInterest = packet.payload?.loadedChunkKeys ?? [];
    worldState.chunkInterests.set(client.playerId, client.chunkInterest);
  }

  function runServerTick() {
    const tickStartedAt = now();

    metrics.serverTick += 1;
    metrics.activeConnections = clients.size;
    metrics.lastTickDurationMs = 0;

    for (const client of clients.values()) {
      if ((now() - client.lastSeenAt) / 1000 > CONNECTION_TIMEOUT_SECONDS) {
        client.socket.destroy();
        continue;
      }

      sendPacket(client, createPingPacket(metrics.serverTick));
      sendPacket(client, createServerSnapshotPacket({
        tick: metrics.serverTick,
        players: getPlayerSnapshotsForClient(client),
        world: createWorldPayload(client),
        metrics: createPublicMetrics(),
      }));
    }

    metrics.lastTickDurationMs = now() - tickStartedAt;
  }

  function getPlayerSnapshotsForClient(client) {
    return [...clients.values()]
      .filter((candidateClient) => candidateClient.playerSnapshot && candidateClient.connectionId !== client.connectionId)
      .map((candidateClient) => candidateClient.playerSnapshot);
  }

  function createWorldPayload(client) {
    const interestedChunks = new Set(client.chunkInterest);
    const relevantBlockEdits = worldState.blockEdits.filter((edit) => (
      edit.sourcePlayerId !== client.playerId &&
      (interestedChunks.size === 0 || !edit.chunkKey || interestedChunks.has(edit.chunkKey))
    ));

    return {
      blockEdits: relevantBlockEdits,
      combatEvents: worldState.combatEvents.filter((event) => event.sourcePlayerId !== client.playerId),
      entitySnapshots: worldState.entitySnapshots,
      chunkSync: {
        requestedChunks: client.chunkInterest.length,
        syncedChunks: client.chunkInterest.length,
        deltaCompression: 'hash-delta-prep',
      },
    };
  }

  function handleDisconnect(client) {
    if (!clients.has(client.connectionId)) {
      return;
    }

    clients.delete(client.connectionId);
    worldState.chunkInterests.delete(client.playerId);
    metrics.activeConnections = clients.size;
    metrics.disconnects += 1;
    broadcastAll({
      type: PACKET_TYPES.playerLeft,
      version: 1,
      sentAt: now(),
      payload: {
        playerId: client.playerId,
        nickname: client.nickname,
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

  function broadcastAll(packet) {
    for (const client of clients.values()) {
      sendPacket(client, packet);
    }
  }

  function broadcastExcept(connectionId, packet) {
    for (const client of clients.values()) {
      if (client.connectionId !== connectionId) {
        sendPacket(client, packet);
      }
    }
  }

  function createPublicMetrics() {
    return {
      serverTick: metrics.serverTick,
      tickRate,
      activeConnections: clients.size,
      packetsSent: metrics.packetsSent,
      packetsReceived: metrics.packetsReceived,
      bytesSent: metrics.bytesSent,
      bytesReceived: metrics.bytesReceived,
      blockEditsReceived: metrics.blockEditsReceived,
      combatActionsReceived: metrics.combatActionsReceived,
      syncErrors: metrics.syncErrors,
      lastTickDurationMs: metrics.lastTickDurationMs,
    };
  }

  function getMetrics() {
    return {
      ...metrics,
      activeConnections: clients.size,
      port: getAddress().port,
    };
  }

  function getAddress() {
    const address = server?.address();

    if (!address || typeof address === 'string') {
      return {
        host,
        port,
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
  };
}

function decodeWebSocketFrames(buffer) {
  const messages = [];
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

  return messages;
}

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message, 'utf8');
  const headerLength = payload.length < 126 ? 2 : 4;
  const frame = Buffer.alloc(headerLength + payload.length);

  frame[0] = 0x81;

  if (payload.length < 126) {
    frame[1] = payload.length;
    payload.copy(frame, 2);
  } else {
    frame[1] = 126;
    frame.writeUInt16BE(payload.length, 2);
    payload.copy(frame, 4);
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

  process.stdout.write(`Godoy multiplayer server listening on ws://${address.host}:${address.port}\n`);
}
