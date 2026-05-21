import { PerspectiveCamera, Vector3 } from 'three';

const CAMERA_FOV = 65;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;

export class CameraSystem {
  constructor({ width, height }) {
    this.camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
    this.followOffset = new Vector3(0, 9, 13);
    this.lookAtOffset = new Vector3(0, 1.5, 0);
    this.targetPosition = new Vector3();
    this.desiredPosition = new Vector3();
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update({ targetPosition }) {
    this.targetPosition.copy(targetPosition).add(this.lookAtOffset);
    this.desiredPosition.copy(targetPosition).add(this.followOffset);

    this.camera.position.lerp(this.desiredPosition, 0.12);
    this.camera.lookAt(this.targetPosition);
  }
}
