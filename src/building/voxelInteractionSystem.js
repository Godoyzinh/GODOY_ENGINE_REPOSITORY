import { Raycaster, Vector2, Vector3 } from 'three';
import { BlueprintSystem } from './blueprintSystem.js';
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
    onStructurePlaced = null,
    onBlocksPlaced = null,
    onBlockRemoved = null,
  }) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.inventorySystem = inventorySystem;
    this.playerState = playerState;
    this.toolSystem = toolSystem;
    this.onBlockMined = onBlockMined;
    this.onStructurePlaced = onStructurePlaced;
    this.onBlocksPlaced = onBlocksPlaced;
    this.onBlockRemoved = onBlockRemoved;
    this.miningSystem = new MiningSystem({ toolSystem });
    this.blueprintSystem = new BlueprintSystem();
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
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointerleave', this.handlePointerUp);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointerleave', this.handlePointerUp);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown);
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

  handleKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (event.code === 'KeyZ') {
      const snapshot = this.blueprintSystem.rotate(1);
      this.lastAction = `Rotate ${snapshot.rotationLabel}`;
    } else if (event.code === 'KeyX') {
      const snapshot = this.blueprintSystem.cycleBlueprint(1);
      this.lastAction = `Blueprint ${snapshot.selectedBlueprintName}`;
    }
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
    this.onBlockRemoved?.({
      worldX: target.worldX,
      y: target.y,
      worldZ: target.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    });
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

    const placementPlan = this.blueprintSystem.createPlacementPlan({
      targetBlock: target,
      selectedBlockId,
      canPlaceBlockAt: (placementPosition) => this.canPlaceBlockAt(placementPosition),
      isWorldPositionLoaded: (placementPosition) => this.isWorldPositionLoaded(placementPosition),
    });

    if (!placementPlan?.canPlace) {
      this.lastAction = 'Blocked placement';
      return;
    }

    if (!this.canSpendSelectedBlocks(placementPlan.blocks.length)) {
      this.lastAction = 'Not enough blocks';
      return;
    }

    const wasPlaced = placementPlan.blocks.length === 1
      ? this.world.setBlockAtWorldPosition(
        placementPlan.blocks[0].worldX,
        placementPlan.blocks[0].y,
        placementPlan.blocks[0].worldZ,
        selectedBlockId,
      )
      : this.world.setBlocksAtWorldPositions(placementPlan.blocks);

    if (!wasPlaced) {
      this.lastAction = 'Chunk not loaded';
      return;
    }

    if (this.playerState.mode !== 'creative') {
      this.inventorySystem.consumeSelected(placementPlan.blocks.length);
    }

    if (placementPlan.blocks.length > 1 && this.onStructurePlaced) {
      this.onStructurePlaced(this.blueprintSystem.createStructureRecord({
        plan: placementPlan,
      }));
    }

    this.onBlocksPlaced?.(placementPlan.blocks.map((placement) => ({
      ...placement,
      action: 'place',
    })));

    const blockDefinition = getBlockDefinition(selectedBlockId);
    this.lastAction = placementPlan.blocks.length === 1
      ? `Placed ${blockDefinition.name}`
      : `Placed ${placementPlan.blueprintName}`;
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

  completeMining({ targetBlock, dropStack, blockDefinition }) {
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

    if (dropStack !== null) {
      this.handleBlockDrop({ targetBlock, dropStack, blockDefinition });
    }

    this.onBlockRemoved?.({
      worldX: targetBlock.worldX,
      y: targetBlock.y,
      worldZ: targetBlock.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    });

    this.targetBlock = null;
    this.lastAction = `Mined ${blockDefinition.name}`;
  }

  handleBlockDrop({ targetBlock, dropStack, blockDefinition }) {
    if (this.onBlockMined) {
      this.onBlockMined({
        targetBlock,
        dropStack,
        blockDefinition,
      });
      return;
    }

    this.inventorySystem.addItem(dropStack);
  }

  updateFeedback() {
    const selectedBlockId = this.inventorySystem.getSelectedBlockId();
    const selectedBlockDefinition = selectedBlockId ? getBlockDefinition(selectedBlockId) : null;
    const placementPlan = this.targetBlock && selectedBlockId
      ? this.blueprintSystem.createPlacementPlan({
        targetBlock: this.targetBlock,
        selectedBlockId,
        canPlaceBlockAt: (placementPosition) => this.canPlaceBlockAt(placementPosition),
        isWorldPositionLoaded: (placementPosition) => this.isWorldPositionLoaded(placementPosition),
      })
      : null;
    const placementPosition = placementPlan?.blocks[0] ?? null;
    const canPlace = placementPlan?.canPlace ?? false;

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

  isWorldPositionLoaded(placementPosition) {
    return this.world.isWorldPositionLoaded?.(placementPosition.worldX, placementPosition.worldZ) ?? true;
  }

  canSpendSelectedBlocks(blockCount) {
    if (this.playerState.mode === 'creative') {
      return true;
    }

    const selectedStack = this.inventorySystem.getSelectedStack();

    return selectedStack?.count === Infinity || selectedStack?.count >= blockCount;
  }

  getBuildingSnapshot() {
    return this.blueprintSystem.getSnapshot();
  }
}
