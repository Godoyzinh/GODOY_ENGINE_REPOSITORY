import { Group, MathUtils, Vector3 } from 'three';
import { MovementSystem, PLAYER_STANDING_HEIGHT } from './movementSystem.js';
import { PlayerAvatar } from './playerAvatar.js';

export class PlayerController {
  constructor({ camera, terrainSampler, playerState }) {
    this.camera = camera;
    this.terrainSampler = terrainSampler;
    this.playerState = playerState;
    this.movementSystem = new MovementSystem({ terrainSampler, playerState });
    this.object = new Group();
    this.object.name = 'PlayerController';
    this.position = this.movementSystem.position;
    this.velocity = this.movementSystem.velocity;
    this.cameraTarget = new Vector3();
    this.cameraTargetOffset = new Vector3(0, 1.2, 0);
    this.avatarYaw = 0;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);

    this.avatar = new PlayerAvatar();
    this.object.add(this.avatar.group);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  setInputEnabled(isInputEnabled) {
    this.movementSystem.setInputEnabled(isInputEnabled);
  }

  handleKeyDown(event) {
    const handledInput = this.movementSystem.setInput(event.code, true);
    const handledAction = this.movementSystem.handleActionKey(event.code, event);

    if (handledInput || handledAction) {
      event.preventDefault();
    }
  }

  handleKeyUp(event) {
    if (this.movementSystem.setInput(event.code, false)) {
      event.preventDefault();
    }
  }

  update(deltaTime, { movementYaw = 0 } = {}) {
    this.movementSystem.setCameraYaw(movementYaw);
    this.movementSystem.update(deltaTime);
    this.updateAvatar(deltaTime);
    this.object.position.copy(this.position);
    this.cameraTarget.copy(this.position).add(this.cameraTargetOffset);
  }

  consumeLandingImpact() {
    return this.movementSystem.consumeLandingImpact();
  }

  respawn(position = undefined) {
    this.movementSystem.respawn(position);
    this.object.position.copy(this.position);
    this.cameraTarget.copy(this.position).add(this.cameraTargetOffset);
  }

  updateAvatar(deltaTime) {
    const playerHeight = this.movementSystem.getCurrentHeight();
    const moveDirection = this.movementSystem.lastMoveDirection;
    const movementSpeed = this.movementSystem.horizontalVelocity.length();

    if (moveDirection.lengthSq() > 0.001) {
      this.avatarYaw = lerpAngle(
        this.avatarYaw,
        Math.atan2(-moveDirection.x, -moveDirection.z),
        0.22,
      );
    }

    this.avatar.update({
      deltaTime,
      movementSpeed,
      playerHeightScale: playerHeight / PLAYER_STANDING_HEIGHT,
      yaw: this.avatarYaw,
    });
  }
}

function lerpAngle(currentAngle, targetAngle, alpha) {
  const delta = MathUtils.euclideanModulo(targetAngle - currentAngle + Math.PI, Math.PI * 2) - Math.PI;

  return currentAngle + delta * alpha;
}
