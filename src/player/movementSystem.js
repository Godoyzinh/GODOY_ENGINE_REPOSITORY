import { Vector3 } from 'three';

const WALK_SPEED = 7;
const SPRINT_SPEED = 12;
const CROUCH_SPEED = 3.5;
const FLY_SPEED = 10;
const FLY_SPRINT_SPEED = 17;
const GRAVITY = -26;
const MAX_FALL_SPEED = -34;
const JUMP_FORCE = 10;
export const PLAYER_STANDING_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.15;

export class MovementSystem {
  constructor({ terrainSampler, playerState }) {
    this.terrainSampler = terrainSampler;
    this.playerState = playerState;
    this.position = new Vector3(0, 8, 0);
    this.velocity = new Vector3();
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      crouch: false,
      jump: false,
    };
    this.isGrounded = false;
  }

  setInput(code, isPressed) {
    const inputMap = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint',
      ControlLeft: 'crouch',
      ControlRight: 'crouch',
      KeyC: 'crouch',
      Space: 'jump',
    };
    const inputName = inputMap[code];

    if (inputName) {
      this.input[inputName] = isPressed;
      return true;
    }

    return false;
  }

  handleActionKey(code, event) {
    if (code === 'KeyF' && !event.repeat) {
      this.playerState.toggleFlyMode();
      this.velocity.y = 0;
      return true;
    }

    return false;
  }

  update(deltaTime) {
    if (this.playerState.isFlying) {
      this.applyFlyMovement(deltaTime);
    } else {
      this.applyHorizontalMovement(deltaTime);
      this.applyVerticalMovement(deltaTime);
    }

    this.playerState.setMovementFlags({
      isFlying: this.playerState.isFlying,
      isSprinting: this.input.sprint && !this.input.crouch,
      isCrouching: this.input.crouch,
      isGrounded: this.isGrounded,
    });
  }

  applyHorizontalMovement(deltaTime) {
    const moveVector = this.getHorizontalMoveVector();

    if (moveVector.lengthSq() === 0) {
      return;
    }

    moveVector.normalize().multiplyScalar(this.getGroundSpeed() * deltaTime);
    this.position.add(moveVector);
  }

  applyVerticalMovement(deltaTime) {
    const groundHeight = this.terrainSampler.getHeightAt(this.position.x, this.position.z);
    const minimumY = groundHeight + 0.05;

    if (this.input.jump && this.isGrounded) {
      this.velocity.y = JUMP_FORCE;
      this.isGrounded = false;
    }

    this.velocity.y = Math.max(this.velocity.y + GRAVITY * deltaTime, MAX_FALL_SPEED);
    this.position.y += this.velocity.y * deltaTime;

    if (this.position.y <= minimumY && this.velocity.y <= 0) {
      this.position.y = minimumY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.position.y > minimumY + 0.08) {
      this.isGrounded = false;
    }
  }

  applyFlyMovement(deltaTime) {
    const moveVector = this.getHorizontalMoveVector();
    const verticalInput = Number(this.input.jump) - Number(this.input.crouch);

    moveVector.y = verticalInput;

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(this.getFlySpeed() * deltaTime);
      this.position.add(moveVector);
    }

    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
  }

  getHorizontalMoveVector() {
    const moveX = Number(this.input.right) - Number(this.input.left);
    const moveZ = Number(this.input.backward) - Number(this.input.forward);

    return new Vector3(moveX, 0, moveZ);
  }

  getGroundSpeed() {
    if (this.input.crouch) {
      return CROUCH_SPEED;
    }

    return this.input.sprint ? SPRINT_SPEED : WALK_SPEED;
  }

  getFlySpeed() {
    return this.input.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;
  }

  getCurrentHeight() {
    return this.input.crouch && !this.playerState.isFlying ? PLAYER_CROUCH_HEIGHT : PLAYER_STANDING_HEIGHT;
  }
}
