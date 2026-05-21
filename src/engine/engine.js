import { Timer } from 'three';
import { CameraSystem } from './cameraSystem.js';
import { LightingSystem } from './lightingSystem.js';
import { RendererSystem } from './rendererSystem.js';
import { SceneSystem } from './sceneSystem.js';
import { PlayerController } from '../player/playerController.js';
import { PhysicsWorld } from '../physics/physicsWorld.js';
import { DebugOverlay } from '../ui/debugOverlay.js';
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
    this.terrainGenerator = new TerrainGenerator();
    this.physicsWorld = new PhysicsWorld();
    this.playerController = new PlayerController({
      camera: this.cameraSystem.camera,
      terrainSampler: this.terrainGenerator,
    });
    this.debugOverlay = new DebugOverlay({ rootElement });

    this.sceneSystem.add(this.lightingSystem.group);
    this.sceneSystem.add(this.terrainGenerator.group);
    this.sceneSystem.add(this.playerController.object);

    this.handleResize = this.handleResize.bind(this);
    this.update = this.update.bind(this);
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    window.addEventListener('resize', this.handleResize);
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
    cancelAnimationFrame(this.animationFrameId);
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
    this.terrainGenerator.update({
      focusPosition: this.playerController.position,
    });
    this.physicsWorld.update(deltaTime);
    this.cameraSystem.update({
      targetPosition: this.playerController.cameraTarget,
    });
    this.sceneSystem.update(deltaTime, elapsedTime);
    this.rendererSystem.render(this.sceneSystem.scene, this.cameraSystem.camera);
    this.debugOverlay.update({
      deltaTime,
      playerPosition: this.playerController.position,
      terrainStats: this.terrainGenerator.stats,
    });

    this.animationFrameId = requestAnimationFrame(this.update);
  }
}
