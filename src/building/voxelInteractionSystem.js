import { Raycaster, Vector2, Vector3 } from 'three';
import { BLOCK_IDS } from '../world/blockTypes.js';

const RAYCAST_DISTANCE = 8;

export class VoxelInteractionSystem {
  constructor({ camera, domElement, world }) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.raycaster = new Raycaster();
    this.screenCenter = new Vector2(0, 0);
    this.lastAction = 'Ready';

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  handlePointerDown(event) {
    if (event.button === 0) {
      this.destroyTargetBlock();
    } else if (event.button === 2) {
      this.placeBlockNextToTarget();
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  destroyTargetBlock() {
    const target = this.getTargetBlock();

    if (!target) {
      this.lastAction = 'No target';
      return;
    }

    this.world.setBlockAtWorldPosition(target.worldX, target.y, target.worldZ, BLOCK_IDS.air);
    this.lastAction = `Destroyed ${target.worldX},${target.y},${target.worldZ}`;
  }

  placeBlockNextToTarget() {
    const target = this.getTargetBlock();

    if (!target) {
      this.lastAction = 'No target';
      return;
    }

    const normal = target.normal;
    const placeX = target.worldX + normal.x;
    const placeY = target.y + normal.y;
    const placeZ = target.worldZ + normal.z;

    this.world.setBlockAtWorldPosition(placeX, placeY, placeZ, BLOCK_IDS.grass);
    this.lastAction = `Placed ${placeX},${placeY},${placeZ}`;
  }

  getTargetBlock() {
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    this.raycaster.far = RAYCAST_DISTANCE;

    const intersections = this.raycaster.intersectObjects(this.world.getRaycastTargets(), false);
    const intersection = intersections[0];

    if (!intersection) {
      return null;
    }

    const block = this.world.getBlockFromIntersection(intersection);

    if (!block) {
      return null;
    }

    return {
      ...block,
      normal: new Vector3(
        Math.round(intersection.face.normal.x),
        Math.round(intersection.face.normal.y),
        Math.round(intersection.face.normal.z),
      ),
    };
  }
}
