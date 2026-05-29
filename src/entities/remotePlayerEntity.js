import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { DEFAULT_INTERPOLATION_SECONDS } from '../network/networkConstants.js';
import { BaseEntity } from './baseEntity.js';
import { ENTITY_TYPES } from './entityTypes.js';

const bodyGeometry = new BoxGeometry(0.72, 1.45, 0.72);
const headGeometry = new BoxGeometry(0.48, 0.48, 0.48);
const markerGeometry = new BoxGeometry(1.1, 0.05, 1.1);

export class RemotePlayerEntity extends BaseEntity {
  constructor() {
    super({
      type: ENTITY_TYPES.remotePlayer,
      name: 'RemotePlayerEntity',
    });

    this.playerId = null;
    this.nickname = 'Remote Player';
    this.targetPosition = new Vector3();
    this.previousPosition = new Vector3();
    this.lastSnapshotTick = 0;
    this.lastSnapshotAt = 0;
    this.timeSinceLastSnapshot = 0;
    this.interpolationSeconds = DEFAULT_INTERPOLATION_SECONDS;
    this.replicatedState = {
      mode: 'survival',
      health: 100,
      hunger: 100,
      stamina: 100,
      selectedSlot: 0,
    };
    this.physics.gravityEnabled = false;
    this.collider.radius = 0.42;
    this.collider.height = 1.72;

    const model = createRemotePlayerModel();

    this.bodyMesh = model.body;
    this.headMesh = model.head;
    this.markerMesh = model.marker;
    this.object.add(model.group);
  }

  initialize({ id = null, playerId, nickname = 'Remote Player', snapshot = null } = {}) {
    const initialPosition = snapshot?.transform?.position
      ? vectorFromSnapshot(snapshot.transform.position)
      : new Vector3();

    super.initialize({
      id: id ?? `remote-player-${playerId}`,
      position: initialPosition,
    });
    this.playerId = playerId;
    this.nickname = nickname;
    this.name = `RemotePlayer:${nickname}`;
    this.object.name = this.name;
    this.targetPosition.copy(initialPosition);
    this.previousPosition.copy(initialPosition);
    this.lastSnapshotTick = snapshot?.tick ?? 0;
    this.lastSnapshotAt = snapshot?.timestamp ?? 0;
    this.timeSinceLastSnapshot = 0;
    this.applyRemoteSnapshot(snapshot);

    return this;
  }

  applyRemoteSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    this.previousPosition.copy(this.transform.position);
    this.targetPosition.copy(vectorFromSnapshot(snapshot.transform.position));
    this.transform.rotation.set(
      snapshot.transform.rotation.x ?? 0,
      snapshot.transform.rotation.y ?? 0,
      snapshot.transform.rotation.z ?? 0,
    );
    this.nickname = snapshot.nickname ?? this.nickname;
    this.replicatedState = {
      ...this.replicatedState,
      ...snapshot.state,
    };
    this.lastSnapshotTick = snapshot.tick ?? this.lastSnapshotTick;
    this.lastSnapshotAt = snapshot.timestamp ?? this.lastSnapshotAt;
    this.timeSinceLastSnapshot = 0;
    this.updatePresentation();
  }

  update(deltaTime) {
    this.state.age += deltaTime;
    this.timeSinceLastSnapshot += deltaTime;
    this.updateCombatState(deltaTime);

    const interpolationAlpha = Math.min(1, deltaTime / this.interpolationSeconds);

    this.transform.position.lerp(this.targetPosition, interpolationAlpha);
    this.updateChunkKey();
    this.syncObjectTransform();
  }

  updatePresentation() {
    const isCreative = this.replicatedState.mode === 'creative';
    const isHurt = this.replicatedState.health < 45;

    this.bodyMesh.material.color.set(isCreative ? '#7ec7ff' : '#8ee6b5');
    this.headMesh.material.color.set(isHurt ? '#ffb3a5' : '#ffd29a');
    this.markerMesh.visible = this.replicatedState.isDead !== true;
  }

  getNetworkSnapshot() {
    return {
      id: this.id,
      type: ENTITY_TYPES.remotePlayer,
      playerId: this.playerId,
      nickname: this.nickname,
      transform: {
        position: {
          x: this.transform.position.x,
          y: this.transform.position.y,
          z: this.transform.position.z,
        },
        rotation: {
          x: this.transform.rotation.x,
          y: this.transform.rotation.y,
          z: this.transform.rotation.z,
        },
      },
      state: { ...this.replicatedState },
      lastSnapshotTick: this.lastSnapshotTick,
      timeSinceLastSnapshot: this.timeSinceLastSnapshot,
    };
  }
}

function createRemotePlayerModel() {
  const group = new Group();
  const body = new Mesh(
    bodyGeometry,
    new MeshStandardMaterial({ color: '#8ee6b5', roughness: 0.8 }),
  );
  const head = new Mesh(
    headGeometry,
    new MeshStandardMaterial({ color: '#ffd29a', roughness: 0.78 }),
  );
  const marker = new Mesh(
    markerGeometry,
    new MeshBasicMaterial({
      color: '#8ee6b5',
      transparent: true,
      opacity: 0.28,
    }),
  );

  body.position.y = 0.72;
  head.position.y = 1.68;
  marker.position.y = 0.03;
  body.castShadow = true;
  body.receiveShadow = true;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(marker, body, head);

  return {
    group,
    body,
    head,
    marker,
  };
}

function vectorFromSnapshot(position) {
  return new Vector3(position.x, position.y, position.z);
}
