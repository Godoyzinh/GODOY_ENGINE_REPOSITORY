import { DEFAULT_MULTIPLAYER_URL, PACKET_TYPES } from './networkConstants.js';
import {
  createHelloPacket,
  createPingPacket,
  createPongPacket,
  estimatePacketBytes,
  parsePacket,
  serializePacket,
} from './packetProtocol.js';

const PING_INTERVAL_SECONDS = 2.5;
const RECONNECT_SECONDS = 4;

export class WebSocketClientTransport {
  constructor({
    url = DEFAULT_MULTIPLAYER_URL,
    playerId,
    nickname,
    sessionToken = null,
    worldId = null,
    autoConnect = true,
  }) {
    this.url = url;
    this.playerId = playerId;
    this.nickname = nickname;
    this.sessionToken = sessionToken;
    this.worldId = worldId;
    this.socket = null;
    this.listeners = new Map();
    this.outboundQueue = [];
    this.pingTimer = 0;
    this.reconnectTimer = 0;
    this.pingSequence = 0;
    this.pendingPings = new Map();
    this.metrics = createEmptyMetrics({ url });

    if (autoConnect) {
      this.connect();
    }
  }

  connect() {
    if (typeof WebSocket === 'undefined' || this.socket) {
      return false;
    }

    this.metrics.connectionState = 'connecting';
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', () => this.handleOpen());
    this.socket.addEventListener('message', (event) => this.handleMessage(event));
    this.socket.addEventListener('close', () => this.handleClose());
    this.socket.addEventListener('error', () => this.handleError());

    return true;
  }

  disconnect() {
    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket = null;
    this.metrics.connectionState = 'disconnected';
  }

  setSessionContext({ sessionToken = this.sessionToken, worldId = this.worldId } = {}) {
    this.sessionToken = sessionToken;
    this.worldId = worldId;
  }

  on(packetType, listener) {
    if (!this.listeners.has(packetType)) {
      this.listeners.set(packetType, new Set());
    }

    this.listeners.get(packetType).add(listener);

    return () => this.listeners.get(packetType)?.delete(listener);
  }

  send(packet) {
    const packetBytes = estimatePacketBytes(packet);

    if (!this.isOpen()) {
      this.outboundQueue.push(packet);
      this.metrics.queuedPackets = this.outboundQueue.length;
      return false;
    }

    this.socket.send(serializePacket(packet));
    this.metrics.packetsSent += 1;
    this.metrics.bytesSent += packetBytes;
    this.metrics.lastPacketType = packet.type;
    this.metrics.queuedPackets = this.outboundQueue.length;

    return true;
  }

  update(deltaTime) {
    this.metrics.packetsPerSecondTimer += deltaTime;

    if (this.metrics.packetsPerSecondTimer >= 1) {
      this.metrics.packetsPerSecond = this.metrics.packetsSent + this.metrics.packetsReceived -
        this.metrics.lastSecondPacketCount;
      this.metrics.lastSecondPacketCount = this.metrics.packetsSent + this.metrics.packetsReceived;
      this.metrics.packetsPerSecondTimer = 0;
    }

    if (!this.socket) {
      this.reconnectTimer += deltaTime;

      if (this.reconnectTimer >= RECONNECT_SECONDS) {
        this.reconnectTimer = 0;
        this.connect();
      }

      return;
    }

    this.pingTimer += deltaTime;

    if (this.pingTimer >= PING_INTERVAL_SECONDS) {
      this.pingTimer = 0;
      this.sendPing();
    }
  }

  handleOpen() {
    this.metrics.connectionState = 'connected';
    this.metrics.connectedAt = now();
    this.send(createHelloPacket({
      playerId: this.playerId,
      nickname: this.nickname,
      sessionToken: this.sessionToken,
      worldId: this.worldId,
    }));
    this.flushQueue();
  }

  handleMessage(event) {
    try {
      const packet = parsePacket(event.data);

      this.metrics.packetsReceived += 1;
      this.metrics.bytesReceived += typeof event.data === 'string'
        ? new TextEncoder().encode(event.data).length
        : 0;
      this.metrics.lastPacketType = packet.type;

      if (packet.type === PACKET_TYPES.ping) {
        this.send(createPongPacket(packet));
      } else if (packet.type === PACKET_TYPES.pong) {
        this.recordPong(packet);
      }

      this.emit(packet.type, packet);
    } catch (error) {
      this.metrics.syncErrors += 1;
      this.metrics.lastError = error.message;
    }
  }

  handleClose() {
    this.socket = null;
    this.metrics.connectionState = 'disconnected';
  }

  handleError() {
    this.metrics.syncErrors += 1;
    this.metrics.connectionState = 'error';
  }

  flushQueue() {
    const pendingPackets = this.outboundQueue.splice(0);

    for (const packet of pendingPackets) {
      this.send(packet);
    }

    this.metrics.queuedPackets = this.outboundQueue.length;
  }

  sendPing() {
    this.pingSequence += 1;
    this.pendingPings.set(this.pingSequence, now());
    this.send(createPingPacket(this.pingSequence));
  }

  recordPong(packet) {
    const sequence = packet.payload?.sequence;
    const sentAt = this.pendingPings.get(sequence);

    if (!sentAt) {
      return;
    }

    this.metrics.latencyMs = Math.max(0, now() - sentAt);
    this.pendingPings.delete(sequence);
  }

  emit(packetType, packet) {
    for (const listener of this.listeners.get(packetType) ?? []) {
      listener(packet);
    }
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  getMetrics() {
    return {
      ...this.metrics,
      queuedPackets: this.outboundQueue.length,
      connected: this.isOpen(),
    };
  }
}

function createEmptyMetrics({ url }) {
  return {
    url,
    connectionState: 'idle',
    connectedAt: 0,
    packetsSent: 0,
    packetsReceived: 0,
    packetsPerSecond: 0,
    packetsPerSecondTimer: 0,
    lastSecondPacketCount: 0,
    bytesSent: 0,
    bytesReceived: 0,
    latencyMs: 0,
    syncErrors: 0,
    lastError: 'none',
    lastPacketType: 'none',
    queuedPackets: 0,
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
