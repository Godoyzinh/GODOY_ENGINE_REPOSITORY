import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { MovementSystem, PLAYER_STANDING_HEIGHT } from './movementSystem.js';

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
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);

    this.body = new Mesh(
      new BoxGeometry(0.8, PLAYER_STANDING_HEIGHT, 0.8),
      new MeshStandardMaterial({ color: '#ffcf69', roughness: 0.8 }),
    );
    this.body.castShadow = true;
    this.body.position.y = PLAYER_STANDING_HEIGHT / 2;
    this.object.add(this.body);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
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

  update(deltaTime) {
    this.movementSystem.update(deltaTime);
    this.updateBodyPose();
    this.object.position.copy(this.position);
    this.cameraTarget.copy(this.position);
  }

  consumeLandingImpact() {
    return this.movementSystem.consumeLandingImpact();
  }

  respawn(position = undefined) {
    this.movementSystem.respawn(position);
    this.object.position.copy(this.position);
    this.cameraTarget.copy(this.position);
  }

  updateBodyPose() {
    const playerHeight = this.movementSystem.getCurrentHeight();

    this.body.scale.y = playerHeight / PLAYER_STANDING_HEIGHT;
    this.body.position.y = playerHeight / 2;
  }
}
