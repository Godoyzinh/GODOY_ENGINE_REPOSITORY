import { Vector3 } from 'three';

const WALK_SPEED = 7;
const SPRINT_SPEED = 12;
const CROUCH_SPEED = 3.5;
const FLY_SPEED = 10;
const FLY_SPRINT_SPEED = 17;
const GRAVITY = -26;
const MAX_FALL_SPEED = -34;
const JUMP_FORCE = 10;
const MAX_STEP_UP_HEIGHT = 1.05;
const GROUND_CLEARANCE = 0.05;
export const PLAYER_STANDING_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.15;

export class MovementSystem {
  constructor({ terrainSampler, playerState }) {
    this.terrainSampler = terrainSampler;
    this.playerState = playerState;
    this.position = new Vector3(0, 8, 0);
    this.velocity = new Vector3();
    this.horizontalVelocity = new Vector3();
    this.lastMoveDirection = new Vector3(0, 0, -1);
    this.spawnPosition = new Vector3(0, 8, 0);
    this.lastLandingImpact = 0;
    this.cameraYaw = 0;
    this.isInputEnabled = true;
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

  setInputEnabled(isInputEnabled) {
    this.isInputEnabled = isInputEnabled;

    if (!isInputEnabled) {
      this.clearInput();
    }
  }

  clearInput() {
    for (const inputName of Object.keys(this.input)) {
      this.input[inputName] = false;
    }

    this.horizontalVelocity.set(0, 0, 0);
  }

  setCameraYaw(cameraYaw) {
    this.cameraYaw = cameraYaw;
  }

  setInput(code, isPressed) {
    if (!this.isInputEnabled) {
      return false;
    }

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
    if (!this.isInputEnabled) {
      return false;
    }

    if (code === 'KeyF' && !event.repeat) {
      this.playerState.toggleFlyMode();
      this.velocity.y = 0;
      return true;
    }

    if (code === 'KeyV' && !event.repeat) {
      this.playerState.toggleMode();
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
      isSprinting: this.canSprint(),
      isCrouching: this.input.crouch,
      isGrounded: this.isGrounded,
    });
  }

  applyHorizontalMovement(deltaTime) {
    const moveVector = this.getHorizontalMoveVector();

    if (moveVector.lengthSq() === 0) {
      this.horizontalVelocity.set(0, 0, 0);
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    moveVector.normalize();
    this.lastMoveDirection.copy(moveVector);
    this.horizontalVelocity.copy(moveVector).multiplyScalar(this.getGroundSpeed());
    this.velocity.x = this.horizontalVelocity.x;
    this.velocity.z = this.horizontalVelocity.z;
    this.position.addScaledVector(moveVector, this.getGroundSpeed() * deltaTime);
  }

  applyVerticalMovement(deltaTime) {
    const groundHeight = this.getResolvedGroundHeight();
    const minimumY = groundHeight === null ? null : groundHeight + GROUND_CLEARANCE;

    if (this.input.jump && this.isGrounded) {
      this.velocity.y = JUMP_FORCE;
      this.isGrounded = false;
    }

    this.velocity.y = Math.max(this.velocity.y + GRAVITY * deltaTime, MAX_FALL_SPEED);
    this.position.y += this.velocity.y * deltaTime;

    if (minimumY !== null && this.position.y <= minimumY && this.velocity.y <= 0) {
      this.lastLandingImpact = Math.abs(this.velocity.y);
      this.position.y = minimumY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (minimumY === null || this.position.y > minimumY + 0.08) {
      this.isGrounded = false;
    }
  }

  applyFlyMovement(deltaTime) {
    const moveVector = this.getHorizontalMoveVector();
    const verticalInput = Number(this.input.jump) - Number(this.input.crouch);

    moveVector.y = verticalInput;

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();
      this.lastMoveDirection.copy(moveVector).setY(0).normalize();
      this.horizontalVelocity.set(moveVector.x, 0, moveVector.z).multiplyScalar(this.getFlySpeed());
      this.position.addScaledVector(moveVector, this.getFlySpeed() * deltaTime);
    } else {
      this.horizontalVelocity.set(0, 0, 0);
    }

    this.velocity.set(
      moveVector.x * this.getFlySpeed(),
      moveVector.y * this.getFlySpeed(),
      moveVector.z * this.getFlySpeed(),
    );
    this.isGrounded = false;
  }

  getHorizontalMoveVector() {
    const strafeInput = Number(this.input.right) - Number(this.input.left);
    const forwardInput = Number(this.input.forward) - Number(this.input.backward);
    const forwardVector = new Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const rightVector = new Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    return forwardVector.multiplyScalar(forwardInput).add(rightVector.multiplyScalar(strafeInput));
  }

  getResolvedGroundHeight() {
    const sampledGroundHeight = this.terrainSampler.getGroundHeightAt?.(this.position.x, this.position.z, {
      currentY: this.position.y,
      maxStepHeight: MAX_STEP_UP_HEIGHT,
    }) ?? this.terrainSampler.getHeightAt(this.position.x, this.position.z);

    if (sampledGroundHeight === null || sampledGroundHeight === undefined) {
      return null;
    }

    if (sampledGroundHeight - this.position.y > MAX_STEP_UP_HEIGHT) {
      return null;
    }

    return sampledGroundHeight;
  }

  getGroundSpeed() {
    if (this.input.crouch) {
      return CROUCH_SPEED;
    }

    return this.canSprint() ? SPRINT_SPEED : WALK_SPEED;
  }

  getFlySpeed() {
    return this.canSprint() ? FLY_SPRINT_SPEED : FLY_SPEED;
  }

  getCurrentHeight() {
    return this.input.crouch && !this.playerState.isFlying ? PLAYER_CROUCH_HEIGHT : PLAYER_STANDING_HEIGHT;
  }

  canSprint() {
    return this.input.sprint && !this.input.crouch && this.playerState.stamina > 1 && !this.playerState.isDead;
  }

  consumeLandingImpact() {
    const landingImpact = this.lastLandingImpact;
    this.lastLandingImpact = 0;

    return landingImpact;
  }

  respawn(position = this.spawnPosition) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.lastLandingImpact = 0;
  }
}
