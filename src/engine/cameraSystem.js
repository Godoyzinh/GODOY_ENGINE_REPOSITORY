import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const CAMERA_FOV = 65;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const MIN_PITCH = MathUtils.degToRad(14);
const MAX_PITCH = MathUtils.degToRad(58);
const MOUSE_SENSITIVITY = 0.0035;
const CAMERA_DISTANCE = 10.5;
const CAMERA_SMOOTHING = 0.16;
const CAMERA_GROUND_CLEARANCE = 0.75;
const MAX_SHAKE = 0.18;

export class CameraSystem {
  constructor({ width, height, domElement = null }) {
    this.camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
    this.lookAtOffset = new Vector3(0, 1.5, 0);
    this.targetPosition = new Vector3();
    this.desiredPosition = new Vector3();
    this.baseCameraPosition = new Vector3();
    this.viewOffset = new Vector3();
    this.lookTarget = new Vector3();
    this.domElement = domElement;
    this.collisionSampler = null;
    this.yaw = 0;
    this.pitch = MathUtils.degToRad(34);
    this.bobPhase = 0;
    this.shakeIntensity = 0;
    this.isInputEnabled = true;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);

    this.domElement?.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('mousemove', this.handleMouseMove);
  }

  dispose() {
    this.domElement?.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }

  setInputEnabled(isInputEnabled) {
    this.isInputEnabled = isInputEnabled;

    if (!isInputEnabled && document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
  }

  setCollisionSampler(collisionSampler) {
    this.collisionSampler = collisionSampler;
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update({
    targetPosition,
    deltaTime = 0,
    movementSpeed = 0,
    isGrounded = true,
    isSprinting = false,
    isFlying = false,
  }) {
    this.targetPosition.copy(targetPosition).add(this.lookAtOffset);
    this.updateDesiredPosition();
    this.resolveCameraCollision();
    this.updateViewOffset({
      deltaTime,
      movementSpeed,
      isGrounded,
      isSprinting,
      isFlying,
    });

    this.baseCameraPosition.lerp(this.desiredPosition, CAMERA_SMOOTHING);
    this.camera.position.copy(this.baseCameraPosition).add(this.viewOffset);
    this.lookTarget.copy(this.targetPosition).addScaledVector(this.viewOffset, 0.35);
    this.camera.lookAt(this.lookTarget);
  }

  updateDesiredPosition() {
    const horizontalDistance = Math.cos(this.pitch) * CAMERA_DISTANCE;

    this.desiredPosition.set(
      Math.sin(this.yaw) * horizontalDistance,
      Math.sin(this.pitch) * CAMERA_DISTANCE,
      Math.cos(this.yaw) * horizontalDistance,
    ).add(this.targetPosition);
  }

  resolveCameraCollision() {
    const groundHeight = this.collisionSampler?.getGroundHeightAt?.(
      this.desiredPosition.x,
      this.desiredPosition.z,
      {
        currentY: this.desiredPosition.y,
        maxStepHeight: 2.5,
      },
    );

    if (groundHeight === null || groundHeight === undefined) {
      return;
    }

    this.desiredPosition.y = Math.max(this.desiredPosition.y, groundHeight + CAMERA_GROUND_CLEARANCE);
  }

  updateViewOffset({ deltaTime, movementSpeed, isGrounded, isSprinting, isFlying }) {
    const bobSpeed = isSprinting ? 12 : 8.4;
    const bobAmount = isFlying || !isGrounded ? 0 : MathUtils.clamp(movementSpeed / 11, 0, 1);
    const targetBobY = Math.sin(this.bobPhase * 2) * 0.045 * bobAmount;
    const targetBobX = Math.cos(this.bobPhase) * 0.024 * bobAmount;

    if (bobAmount > 0.04) {
      this.bobPhase += deltaTime * bobSpeed * MathUtils.clamp(movementSpeed / 7, 0.35, 1.6);
    }

    this.shakeIntensity = Math.max(0, this.shakeIntensity - deltaTime * 1.8);
    this.viewOffset.set(
      targetBobX + (Math.random() - 0.5) * this.shakeIntensity,
      targetBobY + (Math.random() - 0.5) * this.shakeIntensity,
      (Math.random() - 0.5) * this.shakeIntensity * 0.45,
    );
  }

  addShake(amount) {
    this.shakeIntensity = MathUtils.clamp(this.shakeIntensity + amount, 0, MAX_SHAKE);
  }

  resetBehindTarget({ targetPosition, yaw = this.yaw, pitch = MathUtils.degToRad(34) } = {}) {
    if (!targetPosition) {
      return;
    }

    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH);
    this.viewOffset.set(0, 0, 0);
    this.shakeIntensity = 0;
    this.targetPosition.copy(targetPosition).add(this.lookAtOffset);
    this.updateDesiredPosition();
    this.resolveCameraCollision();
    this.baseCameraPosition.copy(this.desiredPosition);
    this.camera.position.copy(this.baseCameraPosition);
    this.lookTarget.copy(this.targetPosition);
    this.camera.lookAt(this.lookTarget);
  }

  handlePointerDown() {
    if (!this.isInputEnabled || document.pointerLockElement === this.domElement) {
      return;
    }

    this.domElement?.requestPointerLock?.();
  }

  handleMouseMove(event) {
    if (!this.isInputEnabled || document.pointerLockElement !== this.domElement) {
      return;
    }

    this.yaw -= event.movementX * MOUSE_SENSITIVITY;
    this.pitch = MathUtils.clamp(
      this.pitch - event.movementY * MOUSE_SENSITIVITY,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  getMovementYaw() {
    return this.yaw;
  }
}
