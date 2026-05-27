import { randomUUID } from 'node:crypto';

export class PlayerRegistry {
  constructor({ sessionRecoverySeconds }) {
    this.sessionRecoveryMs = sessionRecoverySeconds * 1000;
    this.players = new Map();
    this.sessionsByToken = new Map();
    this.reconnects = 0;
    this.reconnectMisses = 0;
  }

  registerConnection({ connectionId, playerId, nickname, sessionToken = null, worldId }) {
    const existingPlayer = sessionToken ? this.getPlayerBySessionToken(sessionToken) : null;

    if (existingPlayer && this.canRecover(existingPlayer)) {
      existingPlayer.connectionId = connectionId;
      existingPlayer.nickname = nickname ?? existingPlayer.nickname;
      existingPlayer.worldId = worldId ?? existingPlayer.worldId;
      existingPlayer.connected = true;
      existingPlayer.lastConnectedAt = now();
      existingPlayer.lastSeenAt = now();
      existingPlayer.reconnectCount += 1;
      existingPlayer.pendingDisconnectAt = null;
      this.reconnects += 1;

      return {
        player: existingPlayer,
        recovered: true,
      };
    }

    if (sessionToken) {
      this.reconnectMisses += 1;
    }

    const player = {
      playerId,
      nickname,
      connectionId,
      worldId,
      sessionToken: randomUUID(),
      connected: true,
      connectedAt: now(),
      lastConnectedAt: now(),
      lastSeenAt: now(),
      pendingDisconnectAt: null,
      reconnectCount: 0,
      lastSnapshot: null,
      inventoryState: null,
      playerState: null,
    };

    this.players.set(player.playerId, player);
    this.sessionsByToken.set(player.sessionToken, player.playerId);

    return {
      player,
      recovered: false,
    };
  }

  markSeen(playerId) {
    const player = this.players.get(playerId);

    if (player) {
      player.lastSeenAt = now();
    }
  }

  updatePlayerSnapshot(playerId, playerSnapshot) {
    const player = this.players.get(playerId);

    if (!player) {
      return;
    }

    player.lastSnapshot = playerSnapshot;
    player.playerState = playerSnapshot.state ?? player.playerState;
    player.lastSeenAt = now();
  }

  markDisconnected(playerId) {
    const player = this.players.get(playerId);

    if (!player) {
      return null;
    }

    player.connected = false;
    player.connectionId = null;
    player.pendingDisconnectAt = now();

    return player;
  }

  cleanupExpiredSessions() {
    const removedPlayers = [];

    for (const player of this.players.values()) {
      if (player.connected || !player.pendingDisconnectAt) {
        continue;
      }

      if (now() - player.pendingDisconnectAt <= this.sessionRecoveryMs) {
        continue;
      }

      this.players.delete(player.playerId);
      this.sessionsByToken.delete(player.sessionToken);
      removedPlayers.push(player);
    }

    return removedPlayers;
  }

  getPlayer(playerId) {
    return this.players.get(playerId) ?? null;
  }

  getPlayerBySessionToken(sessionToken) {
    const playerId = this.sessionsByToken.get(sessionToken);

    return playerId ? this.players.get(playerId) : null;
  }

  getPlayersForWorld(worldId) {
    return [...this.players.values()].filter((player) => player.worldId === worldId);
  }

  getConnectedPlayersForWorld(worldId) {
    return this.getPlayersForWorld(worldId).filter((player) => player.connected);
  }

  getPlayerSnapshotsForWorld(worldId, exceptPlayerId = null) {
    return this.getConnectedPlayersForWorld(worldId)
      .filter((player) => player.playerId !== exceptPlayerId && player.lastSnapshot)
      .map((player) => player.lastSnapshot);
  }

  canRecover(player) {
    return !player.connected &&
      player.pendingDisconnectAt &&
      now() - player.pendingDisconnectAt <= this.sessionRecoveryMs;
  }

  getStats() {
    const players = [...this.players.values()];

    return {
      registeredPlayers: players.length,
      connectedPlayers: players.filter((player) => player.connected).length,
      recoverablePlayers: players.filter((player) => !player.connected && this.canRecover(player)).length,
      reconnects: this.reconnects,
      reconnectMisses: this.reconnectMisses,
    };
  }
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
