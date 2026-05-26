import { Timer } from 'three';
import { VoxelInteractionSystem } from '../building/voxelInteractionSystem.js';
import { DamageSystem } from '../combat/damageSystem.js';
import { CraftingSystem } from '../crafting/craftingSystem.js';
import { CameraSystem } from './cameraSystem.js';
import { LightingSystem } from './lightingSystem.js';
import { RendererSystem } from './rendererSystem.js';
import { SceneSystem } from './sceneSystem.js';
import { EntitySystem } from '../entities/entitySystem.js';
import { PlayerController } from '../player/playerController.js';
import { InventorySystem } from '../player/inventorySystem.js';
import { PlayerState } from '../player/playerState.js';
import { SurvivalSystem } from '../player/survivalSystem.js';
import { PhysicsWorld } from '../physics/physicsWorld.js';
import { SaveSystem } from '../save/saveSystem.js';
import { DebugOverlay } from '../ui/debugOverlay.js';
import { HotbarUI } from '../ui/hotbarUI.js';
import { SurvivalHud } from '../ui/survivalHud.js';
import { ToolSystem } from '../tools/toolSystem.js';
import { TerrainGenerator } from '../world/terrainGenerator.js';

const MAX_DELTA_TIME = 0.05;

export class Engine {
  constructor({ rootElement }) {
    this.rootElement = rootElement;
    this.timer = new Timer();
    this.isRunning = false;
    this.animationFrameId = null;

    this.sceneSystem = new SceneSystem();
    this.rendererSystem = new RendererSystem({ rootElement });
    this.cameraSystem = new CameraSystem({
      width: this.rendererSystem.width,
      height: this.rendererSystem.height,
    });
    this.lightingSystem = new LightingSystem();
    this.saveSystem = new SaveSystem();
    this.terrainGenerator = new TerrainGenerator({ saveSystem: this.saveSystem });
    this.physicsWorld = new PhysicsWorld();
    this.playerState = new PlayerState();
    this.toolSystem = new ToolSystem();
    this.inventorySystem = new InventorySystem({ playerState: this.playerState });
    this.survivalSystem = new SurvivalSystem({
      playerState: this.playerState,
      inventorySystem: this.inventorySystem,
    });
    this.damageSystem = new DamageSystem({ survivalSystem: this.survivalSystem });
    this.craftingSystem = new CraftingSystem({ inventorySystem: this.inventorySystem });
    this.entitySystem = new EntitySystem({
      terrainSampler: this.terrainGenerator,
      inventorySystem: this.inventorySystem,
      damageSystem: this.damageSystem,
    });
    this.playerController = new PlayerController({
      camera: this.cameraSystem.camera,
      terrainSampler: this.terrainGenerator,
      playerState: this.playerState,
    });
    this.voxelInteractionSystem = new VoxelInteractionSystem({
      camera: this.cameraSystem.camera,
      domElement: this.rendererSystem.domElement,
      world: this.terrainGenerator,
      inventorySystem: this.inventorySystem,
      playerState: this.playerState,
      toolSystem: this.toolSystem,
      onBlockMined: (minedBlock) => this.handleBlockMined(minedBlock),
    });
    this.debugOverlay = new DebugOverlay({ rootElement });
    this.hotbarUI = new HotbarUI({
      rootElement,
      inventorySystem: this.inventorySystem,
    });
    this.survivalHud = new SurvivalHud({
      rootElement,
      survivalSystem: this.survivalSystem,
    });

    this.sceneSystem.add(this.lightingSystem.group);
    this.sceneSystem.add(this.terrainGenerator.group);
    this.sceneSystem.add(this.entitySystem.group);
    this.sceneSystem.add(this.voxelInteractionSystem.group);
    this.sceneSystem.add(this.playerController.object);

    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.update = this.update.bind(this);
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    this.handleResize();
    this.timer.reset();
    this.update();
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    cancelAnimationFrame(this.animationFrameId);
    this.playerController.dispose();
    this.voxelInteractionSystem.dispose();
    this.inventorySystem.dispose();
    this.hotbarUI.dispose();
    this.survivalHud.dispose();
  }

  handleKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (event.code === 'KeyE') {
      this.survivalSystem.consumeSelectedItem();
    } else if (event.code === 'KeyR') {
      this.craftingSystem.craftFirstAvailable();
    }
  }

  handleResize() {
    const width = this.rootElement.clientWidth || window.innerWidth;
    const height = this.rootElement.clientHeight || window.innerHeight;

    this.rendererSystem.resize(width, height);
    this.cameraSystem.resize(width, height);
  }

  update(timestamp) {
    if (!this.isRunning) {
      return;
    }

    this.timer.update(timestamp);

    const deltaTime = Math.min(this.timer.getDelta(), MAX_DELTA_TIME);
    const elapsedTime = this.timer.getElapsed();

    this.playerController.update(deltaTime);
    const landingImpact = this.playerController.consumeLandingImpact();
    this.survivalSystem.update({
      deltaTime,
      playerController: this.playerController,
      landingImpact,
    });
    this.damageSystem.applyFallDamage(landingImpact);
    this.terrainGenerator.update({
      focusPosition: this.playerController.position,
      camera: this.cameraSystem.camera,
    });
    this.physicsWorld.update(deltaTime);
    this.cameraSystem.update({
      targetPosition: this.playerController.cameraTarget,
    });
    this.voxelInteractionSystem.update(deltaTime);
    this.entitySystem.update({
      deltaTime,
      playerPosition: this.playerController.position,
    });
    this.craftingSystem.update();
    this.sceneSystem.update(deltaTime, elapsedTime);
    this.rendererSystem.render(this.sceneSystem.scene, this.cameraSystem.camera);
    this.hotbarUI.update();
    this.survivalHud.update();
    this.debugOverlay.update({
      deltaTime,
      interactionStatus: this.voxelInteractionSystem.lastAction,
      playerPosition: this.playerController.position,
      terrainStats: this.terrainGenerator.stats,
      entityStats: this.entitySystem.stats,
      playerState: this.playerState.getSnapshot(),
      survivalSnapshot: this.survivalSystem.getSnapshot(),
      inventorySnapshot: this.inventorySystem.getSnapshot(),
      miningSnapshot: this.voxelInteractionSystem.miningSnapshot,
      craftingSnapshot: this.craftingSystem.getSnapshot(),
      damageSnapshot: this.damageSystem.getSnapshot(),
    });

    this.animationFrameId = requestAnimationFrame(this.update);
  }

  handleBlockMined({ targetBlock, dropStack }) {
    this.entitySystem.spawnDroppedItem({
      itemStack: dropStack,
      position: {
        x: targetBlock.worldX + 0.5,
        y: targetBlock.y + 0.8,
        z: targetBlock.worldZ + 0.5,
      },
    });
  }
}
