import {
  BoxGeometry,
  BufferGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { getPlacementAnchor } from '../building/placementHelpers.js';
import { BLOCK_IDS } from '../world/blockTypes.js';
import {
  canReplaceBlock,
  getBlockDefinition,
  isPlaceableBlock,
} from '../world/blockRegistry.js';

export const STUDIO_TOOLS = {
  select: 'select',
  move: 'move',
  terrain: 'terrain',
  prefab: 'prefab',
};

const TOOL_ORDER = [
  STUDIO_TOOLS.select,
  STUDIO_TOOLS.move,
  STUDIO_TOOLS.terrain,
  STUDIO_TOOLS.prefab,
];
const MAX_UNDO_STACK = 40;
const SELECTION_GEOMETRY = new EdgesGeometry(new BoxGeometry(1.08, 1.08, 1.08));
const GHOST_GEOMETRY = new BoxGeometry(1, 1, 1);

export class StudioToolSystem {
  constructor({
    world,
    inventorySystem = null,
    permissionSystem,
    prefabRegistry,
    publishingSystem,
    inputTarget = typeof window !== 'undefined' ? window : null,
    onStudioEdits = null,
    onPrefabPlaced = null,
    onWorldPublished = null,
    onStateChanged = null,
  }) {
    this.world = world;
    this.inventorySystem = inventorySystem;
    this.permissionSystem = permissionSystem;
    this.prefabRegistry = prefabRegistry;
    this.publishingSystem = publishingSystem;
    this.inputTarget = inputTarget;
    this.onStudioEdits = onStudioEdits;
    this.onPrefabPlaced = onPrefabPlaced;
    this.onWorldPublished = onWorldPublished;
    this.onStateChanged = onStateChanged;
    this.group = new Group();
    this.group.name = 'StudioToolSystem';
    this.isActive = false;
    this.activeTool = STUDIO_TOOLS.select;
    this.selectedObject = null;
    this.hoveredBlock = null;
    this.selectedPrefabRotation = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.lastAction = 'Studio ready';
    this.activeEditors = 0;
    this.lastTerrainStats = null;
    this.lastNetworkSnapshot = null;
    this.createGizmoObjects();

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.inputTarget?.addEventListener?.('keydown', this.handleKeyDown);
  }

  dispose() {
    this.inputTarget?.removeEventListener?.('keydown', this.handleKeyDown);
  }

  update({
    targetBlock,
    terrainStats,
    networkSnapshot,
  }) {
    this.hoveredBlock = targetBlock;
    this.lastTerrainStats = terrainStats;
    this.lastNetworkSnapshot = networkSnapshot;
    this.activeEditors = this.isActive && this.permissionSystem.canEdit() ? 1 : 0;
    this.updateGizmos();
  }

  handleKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (event.code === 'Backquote') {
      this.toggleStudioMode();
      consumeEvent(event);
      return;
    }

    if (!this.isActive) {
      return;
    }

    if (event.ctrlKey && event.code === 'KeyZ') {
      this.undo();
      consumeEvent(event);
      return;
    }

    if (event.ctrlKey && event.code === 'KeyY') {
      this.redo();
      consumeEvent(event);
      return;
    }

    if (event.code === 'KeyF') {
      this.selectHoveredBlock();
    } else if (event.code === 'KeyG') {
      this.cycleTool(1);
    } else if (event.code === 'KeyP') {
      this.paintHoveredBlock();
    } else if (event.code === 'KeyB') {
      this.prefabRegistry.cyclePrefab(1);
      this.lastAction = `Prefab ${this.prefabRegistry.getSnapshot().selectedPrefabName}`;
    } else if (event.code === 'KeyV') {
      this.placeSelectedPrefab();
    } else if (event.code === 'KeyO') {
      this.publishWorld();
    } else if (event.code === 'KeyR') {
      this.rotatePrefab(1);
    } else if (event.code === 'Delete') {
      this.deleteSelection();
    } else {
      this.handleTransformKey(event.code);
    }

    consumeEvent(event);
  }

  toggleStudioMode() {
    this.isActive = !this.isActive;
    this.lastAction = this.isActive ? 'Studio mode on' : 'Studio mode off';
    this.notifyStateChanged();
  }

  cycleTool(direction) {
    const currentIndex = TOOL_ORDER.indexOf(this.activeTool);
    const nextIndex = (currentIndex + direction + TOOL_ORDER.length) % TOOL_ORDER.length;

    this.activeTool = TOOL_ORDER[nextIndex];
    this.lastAction = `Tool ${this.activeTool}`;
    this.notifyStateChanged();
  }

  selectHoveredBlock() {
    if (!this.hoveredBlock) {
      this.selectedObject = null;
      this.lastAction = 'No selection';
      return;
    }

    this.selectedObject = {
      type: 'block',
      worldX: this.hoveredBlock.worldX,
      y: this.hoveredBlock.y,
      worldZ: this.hoveredBlock.worldZ,
      blockId: this.hoveredBlock.blockId,
      selectedAt: Date.now(),
    };
    this.lastAction = `Selected ${getBlockDefinition(this.selectedObject.blockId).name}`;
    this.notifyStateChanged();
  }

  handleTransformKey(code) {
    const offsets = {
      ArrowUp: { x: 0, y: 0, z: -1 },
      ArrowDown: { x: 0, y: 0, z: 1 },
      ArrowLeft: { x: -1, y: 0, z: 0 },
      ArrowRight: { x: 1, y: 0, z: 0 },
      PageUp: { x: 0, y: 1, z: 0 },
      PageDown: { x: 0, y: -1, z: 0 },
    };
    const offset = offsets[code];

    if (offset) {
      this.moveSelection(offset);
    }
  }

  moveSelection(offset) {
    if (!this.canEdit('Move denied') || !this.selectedObject) {
      return;
    }

    const nextPosition = {
      worldX: this.selectedObject.worldX + offset.x,
      y: this.selectedObject.y + offset.y,
      worldZ: this.selectedObject.worldZ + offset.z,
    };

    if (!this.isWorldPositionLoaded(nextPosition)) {
      this.lastAction = 'Target chunk unloaded';
      return;
    }

    const targetBlockId = this.world.getBlockAtWorldPosition(nextPosition.worldX, nextPosition.y, nextPosition.worldZ);

    if (!canReplaceBlock(targetBlockId)) {
      this.lastAction = 'Move blocked';
      return;
    }

    const edits = [
      {
        worldX: this.selectedObject.worldX,
        y: this.selectedObject.y,
        worldZ: this.selectedObject.worldZ,
        blockId: BLOCK_IDS.air,
        action: 'studio-move-clear',
      },
      {
        ...nextPosition,
        blockId: this.selectedObject.blockId,
        action: 'studio-move-place',
      },
    ];

    if (this.applyEdits({ edits, label: 'Move block' })) {
      this.selectedObject = {
        ...this.selectedObject,
        ...nextPosition,
      };
    }
  }

  deleteSelection() {
    if (!this.canEdit('Delete denied') || !this.selectedObject) {
      return;
    }

    this.applyEdits({
      edits: [{
        worldX: this.selectedObject.worldX,
        y: this.selectedObject.y,
        worldZ: this.selectedObject.worldZ,
        blockId: BLOCK_IDS.air,
        action: 'studio-delete',
      }],
      label: 'Delete block',
    });
    this.selectedObject = null;
  }

  paintHoveredBlock() {
    if (!this.canEdit('Paint denied') || !this.hoveredBlock) {
      return;
    }

    const selectedBlockId = this.getSelectedPaintBlockId();

    if (!isPlaceableBlock(selectedBlockId)) {
      this.lastAction = 'Select a paint block';
      return;
    }

    this.applyEdits({
      edits: [{
        worldX: this.hoveredBlock.worldX,
        y: this.hoveredBlock.y,
        worldZ: this.hoveredBlock.worldZ,
        blockId: selectedBlockId,
        action: 'studio-terrain-paint',
      }],
      label: 'Paint terrain',
    });
  }

  placeSelectedPrefab() {
    if (!this.canEdit('Prefab denied') || !this.hoveredBlock) {
      return;
    }

    const anchor = getPlacementAnchor(this.hoveredBlock);
    const placementPlan = this.prefabRegistry.createPlacementPlan({
      anchor,
      rotationStep: this.selectedPrefabRotation,
      canPlaceBlockAt: (placementPosition) => this.canPlaceBlockAt(placementPosition),
      isWorldPositionLoaded: (placementPosition) => this.isWorldPositionLoaded(placementPosition),
    });

    if (!placementPlan.canPlace) {
      this.lastAction = 'Prefab blocked';
      return;
    }

    if (this.applyEdits({
      edits: placementPlan.blocks.map((block) => ({
        ...block,
        action: 'studio-prefab-place',
      })),
      label: `Place ${placementPlan.prefabName}`,
    })) {
      this.onPrefabPlaced?.(this.prefabRegistry.createPrefabRecord({ placementPlan }));
    }
  }

  rotatePrefab(direction) {
    this.selectedPrefabRotation = (this.selectedPrefabRotation + direction + 4) % 4;
    this.lastAction = `Prefab rotation ${this.selectedPrefabRotation * 90}`;
    this.notifyStateChanged();
  }

  publishWorld() {
    const publishRecord = this.publishingSystem.publishCurrentWorld({
      terrainStats: this.lastTerrainStats,
      networkSnapshot: this.lastNetworkSnapshot,
    });

    if (!publishRecord) {
      this.lastAction = this.publishingSystem.lastPublishEvent;
      return;
    }

    this.onWorldPublished?.(publishRecord);
    this.lastAction = `Published ${publishRecord.title}`;
    this.notifyStateChanged();
  }

  undo() {
    const undoEntry = this.undoStack.pop();

    if (!undoEntry) {
      this.lastAction = 'Undo empty';
      return;
    }

    this.applyRawEdits(undoEntry.before);
    this.redoStack.push(undoEntry);
    this.lastAction = `Undo ${undoEntry.label}`;
    this.notifyStateChanged();
  }

  redo() {
    const redoEntry = this.redoStack.pop();

    if (!redoEntry) {
      this.lastAction = 'Redo empty';
      return;
    }

    this.applyRawEdits(redoEntry.after);
    this.undoStack.push(redoEntry);
    this.lastAction = `Redo ${redoEntry.label}`;
    this.notifyStateChanged();
  }

  applyEdits({ edits, label }) {
    const before = edits.map((edit) => ({
      worldX: edit.worldX,
      y: edit.y,
      worldZ: edit.worldZ,
      blockId: this.world.getBlockAtWorldPosition(edit.worldX, edit.y, edit.worldZ),
      action: 'studio-undo-before',
    }));
    const after = edits.map((edit) => ({
      worldX: edit.worldX,
      y: edit.y,
      worldZ: edit.worldZ,
      blockId: edit.blockId,
      action: edit.action,
    }));

    if (!this.applyRawEdits(after)) {
      this.lastAction = 'Edit failed';
      return false;
    }

    this.undoStack.push({
      id: `undo-${Date.now()}`,
      label,
      before,
      after,
      createdAt: new Date().toISOString(),
    });
    this.undoStack = this.undoStack.slice(-MAX_UNDO_STACK);
    this.redoStack = [];
    this.onStudioEdits?.(after);
    this.lastAction = label;
    this.notifyStateChanged();

    return true;
  }

  applyRawEdits(edits) {
    return this.world.setBlocksAtWorldPositions(edits.map((edit) => ({
      worldX: edit.worldX,
      y: edit.y,
      worldZ: edit.worldZ,
      blockId: edit.blockId,
    })));
  }

  canEdit(deniedLabel) {
    if (this.permissionSystem.canEdit()) {
      return true;
    }

    this.lastAction = deniedLabel;
    return false;
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

  getSelectedPaintBlockId() {
    const selectedInventoryBlockId = this.inventorySystem?.getSelectedBlockId?.();

    if (isPlaceableBlock(selectedInventoryBlockId)) {
      return selectedInventoryBlockId;
    }

    return this.selectedObject?.blockId && this.selectedObject.blockId !== BLOCK_IDS.air
      ? this.selectedObject.blockId
      : BLOCK_IDS.planks;
  }

  createGizmoObjects() {
    this.selectionMaterial = new LineBasicMaterial({
      color: '#7ddcff',
      transparent: true,
      opacity: 0.95,
    });
    this.axisMaterialX = new LineBasicMaterial({ color: '#ff6b6b' });
    this.axisMaterialY = new LineBasicMaterial({ color: '#8ee6b5' });
    this.axisMaterialZ = new LineBasicMaterial({ color: '#72a7ff' });
    this.prefabGhostMaterial = new MeshBasicMaterial({
      color: '#7ddcff',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      wireframe: true,
    });
    this.selectionOutline = new LineSegments(SELECTION_GEOMETRY, this.selectionMaterial);
    this.axisX = createAxisLine({ material: this.axisMaterialX, end: new Vector3(1.4, 0, 0) });
    this.axisY = createAxisLine({ material: this.axisMaterialY, end: new Vector3(0, 1.4, 0) });
    this.axisZ = createAxisLine({ material: this.axisMaterialZ, end: new Vector3(0, 0, 1.4) });
    this.prefabGhost = new Mesh(GHOST_GEOMETRY, this.prefabGhostMaterial);

    this.selectionOutline.visible = false;
    this.axisX.visible = false;
    this.axisY.visible = false;
    this.axisZ.visible = false;
    this.prefabGhost.visible = false;
    this.group.add(this.selectionOutline, this.axisX, this.axisY, this.axisZ, this.prefabGhost);
  }

  updateGizmos() {
    const hasSelection = this.isActive && this.selectedObject;

    this.selectionOutline.visible = hasSelection;
    this.axisX.visible = hasSelection;
    this.axisY.visible = hasSelection;
    this.axisZ.visible = hasSelection;

    if (hasSelection) {
      setObjectCenter(this.selectionOutline, this.selectedObject);
      setObjectCenter(this.axisX, this.selectedObject);
      setObjectCenter(this.axisY, this.selectedObject);
      setObjectCenter(this.axisZ, this.selectedObject);
    }

    const showPrefabGhost = this.isActive && this.activeTool === STUDIO_TOOLS.prefab && this.hoveredBlock;

    this.prefabGhost.visible = showPrefabGhost;

    if (showPrefabGhost) {
      const anchor = getPlacementAnchor(this.hoveredBlock);

      this.prefabGhost.position.set(anchor.worldX + 0.5, anchor.y + 0.5, anchor.worldZ + 0.5);
      this.prefabGhost.scale.setScalar(Math.max(1, Math.cbrt(this.prefabRegistry.getPrefab().blocks.length)));
    }
  }

  notifyStateChanged() {
    this.onStateChanged?.(this.getPersistenceState());
  }

  getPersistenceState() {
    return {
      isActive: this.isActive,
      activeTool: this.activeTool,
      selectedPrefabRotation: this.selectedPrefabRotation,
      selectedObject: this.selectedObject,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      lastAction: this.lastAction,
    };
  }

  getSnapshot() {
    return {
      isActive: this.isActive,
      activeTool: this.activeTool,
      selectedObjectType: this.selectedObject?.type ?? 'none',
      selectedObjectLabel: this.selectedObject
        ? `${this.selectedObject.worldX},${this.selectedObject.y},${this.selectedObject.worldZ}`
        : 'none',
      activeEditors: this.activeEditors,
      undoStack: this.undoStack.length,
      redoStack: this.redoStack.length,
      prefabRotation: this.selectedPrefabRotation,
      terrainBrush: 'single-block',
      lastAction: this.lastAction,
    };
  }
}

function createAxisLine({ material, end }) {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(0.5, 0.5, 0.5),
    new Vector3(0.5 + end.x, 0.5 + end.y, 0.5 + end.z),
  ]);

  return new LineSegments(geometry, material);
}

function setObjectCenter(object, blockPosition) {
  object.position.set(blockPosition.worldX, blockPosition.y, blockPosition.worldZ);
}

function consumeEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation?.();
}
