import { Group } from 'three';
import { RemotePlayerEntity } from '../entities/remotePlayerEntity.js';

const REMOTE_PLAYER_TIMEOUT_SECONDS = 12;

export class RemotePlayerSystem {
  constructor({ localPlayerId }) {
    this.localPlayerId = localPlayerId;
    this.group = new Group();
    this.group.name = 'RemotePlayerSystem';
    this.remotePlayers = new Map();
    this.lastUpdatedPlayerId = null;
    this.stats = this.createStats();
  }

  applyPlayerSnapshot(playerSnapshot) {
    if (!playerSnapshot || playerSnapshot.playerId === this.localPlayerId) {
      return;
    }

    let remotePlayer = this.remotePlayers.get(playerSnapshot.playerId);

    if (!remotePlayer) {
      remotePlayer = new RemotePlayerEntity().initialize({
        playerId: playerSnapshot.playerId,
        nickname: playerSnapshot.nickname,
        snapshot: playerSnapshot,
      });
      this.remotePlayers.set(playerSnapshot.playerId, remotePlayer);
      this.group.add(remotePlayer.object);
    }

    remotePlayer.applyRemoteSnapshot(playerSnapshot);
    this.lastUpdatedPlayerId = playerSnapshot.playerId;
    this.stats = this.createStats();
  }

  applyServerSnapshot(serverSnapshot) {
    const playerSnapshots = serverSnapshot?.players ?? serverSnapshot?.remotePlayers ?? [];

    for (const playerSnapshot of playerSnapshots) {
      this.applyPlayerSnapshot(playerSnapshot);
    }
  }

  removeRemotePlayer(playerId) {
    const remotePlayer = this.remotePlayers.get(playerId);

    if (!remotePlayer) {
      return false;
    }

    this.group.remove(remotePlayer.object);
    this.remotePlayers.delete(playerId);
    this.stats = this.createStats();

    return true;
  }

  update(deltaTime) {
    for (const [playerId, remotePlayer] of this.remotePlayers.entries()) {
      remotePlayer.update(deltaTime);

      if (remotePlayer.timeSinceLastSnapshot > REMOTE_PLAYER_TIMEOUT_SECONDS) {
        this.group.remove(remotePlayer.object);
        this.remotePlayers.delete(playerId);
      }
    }

    this.stats = this.createStats();
  }

  createStats() {
    return {
      remotePlayers: this.remotePlayers.size,
      replicatedPlayerStates: [...this.remotePlayers.values()].filter((player) => player.lastSnapshotTick > 0).length,
      lastUpdatedPlayerId: this.lastUpdatedPlayerId ?? 'none',
    };
  }

  getStats() {
    return this.stats;
  }
}
