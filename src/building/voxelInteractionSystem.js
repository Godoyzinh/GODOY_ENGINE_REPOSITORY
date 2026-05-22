import { Raycaster, Vector2, Vector3 } from 'three';
import { MiningSystem } from './miningSystem.js';
import { VoxelInteractionFeedback } from './voxelInteractionFeedback.js';
import {
  canReplaceBlock,
  getBlockDefinition,
  isPlaceableBlock,
} from '../world/blockRegistry.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

const RAYCAST_DISTANCE = 28;

export class VoxelInteractionSystem {
  constructor({
    camera,
    domElement,
    world,
    inventorySystem,
    playerState,
    toolSystem,
    onBlockMined = null,
  }) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.inventorySystem = inventorySystem;
    this.playerState = playerState;
    this.toolSystem = toolSystem;
    this.onBlockMined = onBlockMined;
    this.miningSystem = new MiningSystem({ toolSystem });
    this.feedback = new VoxelInteractionFeedback();
    this.group = this.feedback.group;
    this.raycaster = new Raycaster();
    this.screenCenter = new Vector2(0, 0);
    this.lastAction = 'Ready';
    this.isMining = false;
    this.targetBlock = null;
    this.miningSnapshot = this.miningSystem.getSnapshot();

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointerleave', this.handlePointerUp);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointerleave', this.handlePointerUp);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
  }

  handlePointerDown(event) {
    if (event.button === 0) {
      this.isMining = true;
    } else if (event.button === 2) {
      this.placeBlockNextToTarget();
    }
  }

  handlePointerUp(event) {
    if (!event || event.button === 0 || event.type === 'pointerleave') {
      this.isMining = false;
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  update(deltaTime) {
    this.targetBlock = this.getTargetBlock();

    const activeTool = this.toolSystem.getToolFromInventoryStack(this.inventorySystem.getSelectedStack());
    const miningResult = this.miningSystem.update({
      deltaTime,
      targetBlock: this.targetBlock,
      isMining: this.isMining,
      activeTool,
    });

    this.miningSnapshot = miningResult.snapshot;

    if (miningResult.completed) {
      this.completeMining(miningResult);
    }

    this.updateFeedback();
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
    const selectedBlockId = this.inventorySystem.getSelectedBlockId();

    if (!target) {
      this.lastAction = 'No target';
      return;
    }

    if (!isPlaceableBlock(selectedBlockId)) {
      this.lastAction = 'Select a block';
      return;
    }

    const placementPosition = this.getPlacementPosition(target);

    if (!this.canPlaceBlockAt(placementPosition)) {
      this.lastAction = 'Blocked placement';
      return;
    }

    const wasPlaced = this.world.setBlockAtWorldPosition(
      placementPosition.worldX,
      placementPosition.y,
      placementPosition.worldZ,
      selectedBlockId,
    );

    if (!wasPlaced) {
      this.lastAction = 'Chunk not loaded';
      return;
    }

    if (this.playerState.mode !== 'creative') {
      this.inventorySystem.consumeSelected(1);
    }

    const blockDefinition = getBlockDefinition(selectedBlockId);
    this.lastAction = `Placed ${blockDefinition.name}`;
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

  completeMining({ targetBlock, dropId, blockDefinition }) {
    const wasDestroyed = this.world.setBlockAtWorldPosition(
      targetBlock.worldX,
      targetBlock.y,
      targetBlock.worldZ,
      BLOCK_IDS.air,
    );

    if (!wasDestroyed) {
      this.lastAction = 'Chunk not loaded';
      return;
    }

    if (dropId !== null) {
      this.handleBlockDrop({ targetBlock, dropId, blockDefinition });
    }

    this.targetBlock = null;
    this.lastAction = `Mined ${blockDefinition.name}`;
  }

  handleBlockDrop({ targetBlock, dropId, blockDefinition }) {
    if (this.onBlockMined) {
      this.onBlockMined({
        targetBlock,
        dropId,
        blockDefinition,
      });
      return;
    }

    this.inventorySystem.addItem({
      itemType: 'block',
      itemId: dropId,
      count: 1,
    });
  }

  updateFeedback() {
    const selectedBlockId = this.inventorySystem.getSelectedBlockId();
    const selectedBlockDefinition = selectedBlockId ? getBlockDefinition(selectedBlockId) : null;
    const placementPosition = this.targetBlock ? this.getPlacementPosition(this.targetBlock) : null;
    const canPlace = placementPosition ? this.canPlaceBlockAt(placementPosition) : false;

    this.feedback.update({
      targetBlock: this.targetBlock,
      placementPosition,
      selectedBlockDefinition,
      canPlace,
      miningProgress: this.miningSnapshot.progress,
    });
  }

  getPlacementPosition(target) {
    const normal = target.normal;

    return {
      worldX: target.worldX + normal.x,
      y: target.y + normal.y,
      worldZ: target.worldZ + normal.z,
    };
  }

  canPlaceBlockAt(placementPosition) {
    const existingBlockId = this.world.getBlockAtWorldPosition(
      placementPosition.worldX,
      placementPosition.y,
      placementPosition.worldZ,
    );

    return canReplaceBlock(existingBlockId);
  }
}
