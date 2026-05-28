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

export class CameraSystem {
  constructor({ width, height, domElement = null }) {
    this.camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
    this.lookAtOffset = new Vector3(0, 1.5, 0);
    this.targetPosition = new Vector3();
    this.desiredPosition = new Vector3();
    this.domElement = domElement;
    this.collisionSampler = null;
    this.yaw = 0;
    this.pitch = MathUtils.degToRad(34);
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

  update({ targetPosition }) {
    this.targetPosition.copy(targetPosition).add(this.lookAtOffset);
    this.updateDesiredPosition();
    this.resolveCameraCollision();

    this.camera.position.lerp(this.desiredPosition, CAMERA_SMOOTHING);
    this.camera.lookAt(this.targetPosition);
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
