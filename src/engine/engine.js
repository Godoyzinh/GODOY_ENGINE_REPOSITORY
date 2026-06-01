import { Timer } from 'three';
import { AmbientAudioSystem } from '../audio/ambientAudioSystem.js';
import { AudioFeedbackSystem } from '../audio/audioFeedbackSystem.js';
import { VoxelInteractionSystem } from '../building/voxelInteractionSystem.js';
import { CombatSystem } from '../combat/combatSystem.js';
import { DamageSystem } from '../combat/damageSystem.js';
import { CraftingSystem } from '../crafting/craftingSystem.js';
import { AutoQaReportSystem } from '../diagnostics/autoQaReportSystem.js';
import { AutonomousPlaytestSimulation } from '../diagnostics/autonomousPlaytestSimulation.js';
import { EnginePlaytestAdapter } from '../diagnostics/enginePlaytestAdapter.js';
import { TelemetrySystem } from '../diagnostics/telemetrySystem.js';
import { FurnaceSystem } from '../crafting/furnaceSystem.js';
import { AmbientParticleSystem } from './ambientParticleSystem.js';
import { CameraSystem } from './cameraSystem.js';
import { FeedbackParticleSystem } from './feedbackParticleSystem.js';
import { LightingSystem } from './lightingSystem.js';
import { RendererSystem } from './rendererSystem.js';
import { SceneSystem } from './sceneSystem.js';
import { SkySystem } from './skySystem.js';
import { EntitySystem } from '../entities/entitySystem.js';
import { LootSystem, LOOT_TABLE_IDS } from '../loot/lootSystem.js';
import { NetworkSession } from '../network/networkSession.js';
import { checkServerHealth } from '../network/serverHealth.js';
import { PlayerController } from '../player/playerController.js';
import { InventorySystem } from '../player/inventorySystem.js';
import { INVENTORY_INITIALIZATION_SOURCES } from '../player/inventoryProfiles.js';
import { PlayerState } from '../player/playerState.js';
import { SurvivalSystem } from '../player/survivalSystem.js';
import { PhysicsWorld } from '../physics/physicsWorld.js';
import { ProgressionSystem } from '../progression/progressionSystem.js';
import { SaveSystem } from '../save/saveSystem.js';
import { SettingsSystem } from '../settings/settingsSystem.js';
import { CreatorPermissionSystem } from '../studio/creatorPermissions.js';
import { PrefabRegistry } from '../studio/prefabRegistry.js';
import { StudioToolSystem } from '../studio/studioToolSystem.js';
import { WorldPublishingSystem } from '../studio/worldPublishingSystem.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { DebugOverlay } from '../ui/debugOverlay.js';
import { CombatHud } from '../ui/combatHud.js';
import { FeedbackUI } from '../ui/feedbackUI.js';
import { HotbarUI } from '../ui/hotbarUI.js';
import { MainMenuUI } from '../ui/mainMenuUI.js';
import { ReleaseBannerUI } from '../ui/releaseBannerUI.js';
import { SurvivalHud } from '../ui/survivalHud.js';
import { ToolSystem } from '../tools/toolSystem.js';
import { DayNightSystem } from '../world/dayNightSystem.js';
import { TerrainGenerator } from '../world/terrainGenerator.js';
import { WeatherSystem } from '../world/weatherSystem.js';
import { WorldSimulationSystem } from '../world/worldSimulationSystem.js';
import { BLOCK_DEFINITIONS, BLOCK_IDS } from '../world/blockTypes.js';

const MAX_DELTA_TIME = 0.05;
const PERSISTENCE_INTERVAL_SECONDS = 4;
const LOCAL_PLAYER_ID = 'player-local';

export class Engine {
  constructor({ rootElement }) {
    this.rootElement = rootElement;
    this.timer = new Timer();
    this.isRunning = false;
    this.animationFrameId = null;
    this.runtimeConfig = getRuntimeConfig();
    this.telemetrySystem = new TelemetrySystem({
      runtimeConfig: this.runtimeConfig,
    });
    this.telemetrySystem.installGlobalCapture();
    this.autoQaReportSystem = new AutoQaReportSystem({
      telemetrySystem: this.telemetrySystem,
      runtimeConfig: this.runtimeConfig,
    });

    this.settingsSystem = new SettingsSystem();
    const settingsSnapshot = this.settingsSystem.getSnapshot();
    this.sceneSystem = new SceneSystem();
    this.rendererSystem = new RendererSystem({ rootElement, settingsSnapshot });
    this.cameraSystem = new CameraSystem({
      width: this.rendererSystem.width,
      height: this.rendererSystem.height,
      domElement: this.rendererSystem.domElement,
    });
    this.lightingSystem = new LightingSystem();
    this.skySystem = new SkySystem();
    this.ambientParticleSystem = new AmbientParticleSystem();
    this.feedbackParticleSystem = new FeedbackParticleSystem();
    this.saveSystem = new SaveSystem();
    this.savedStudioState = this.saveSystem.loadStudioState();
    this.worldSimulationSystem = new WorldSimulationSystem({
      savedState: this.saveSystem.loadWorldSimulationState(),
    });
    this.dayNightSystem = new DayNightSystem({
      savedState: this.saveSystem.loadWorldSimulationState()?.dayNight,
    });
    this.terrainGenerator = new TerrainGenerator({
      saveSystem: this.saveSystem,
      settingsSnapshot,
    });
    this.cameraSystem.setCollisionSampler(this.terrainGenerator);
    this.weatherSystem = new WeatherSystem({
      worldSeed: this.terrainGenerator.worldSeed,
      savedState: this.saveSystem.loadWeatherState(),
    });
    this.physicsWorld = new PhysicsWorld();
    this.playerState = new PlayerState();
    this.toolSystem = new ToolSystem();
    this.lootSystem = new LootSystem();
    this.inventorySystem = new InventorySystem({
      playerState: this.playerState,
      initializationSource: resolveInventoryInitializationSource(),
    });
    this.telemetrySystem.recordGameplayEvent('inventory-initialization', this.inventorySystem.getInitializationSnapshot());
    this.survivalSystem = new SurvivalSystem({
      playerState: this.playerState,
      inventorySystem: this.inventorySystem,
    });
    this.damageSystem = new DamageSystem({ survivalSystem: this.survivalSystem });
    this.combatSystem = new CombatSystem({
      camera: this.cameraSystem.camera,
      damageSystem: this.damageSystem,
      toolSystem: this.toolSystem,
      onHit: (hitEvent) => this.handleCombatHit(hitEvent),
    });
    this.craftingSystem = new CraftingSystem({ inventorySystem: this.inventorySystem });
    this.furnaceSystem = new FurnaceSystem({
      inventorySystem: this.inventorySystem,
      savedState: this.saveSystem.loadFurnaceState(),
    });
    this.progressionSystem = new ProgressionSystem({ inventorySystem: this.inventorySystem });
    this.entitySystem = new EntitySystem({
      terrainSampler: this.terrainGenerator,
      inventorySystem: this.inventorySystem,
      damageSystem: this.damageSystem,
    });
    this.entitySystem.restoreEntities(this.saveSystem.loadEntityStates());
    this.ambientAudioSystem = new AmbientAudioSystem();
    this.audioFeedbackSystem = new AudioFeedbackSystem();
    this.networkSession = new NetworkSession({
      localPlayerId: LOCAL_PLAYER_ID,
      nickname: 'Godoy Player',
      serverUrl: this.runtimeConfig.multiplayerServerUrl,
    });
    this.creatorPermissionSystem = new CreatorPermissionSystem({
      localPlayerId: LOCAL_PLAYER_ID,
      savedState: this.savedStudioState.permissions,
    });
    this.prefabRegistry = new PrefabRegistry();
    this.worldPublishingSystem = new WorldPublishingSystem({
      saveSystem: this.saveSystem,
      permissionSystem: this.creatorPermissionSystem,
      worldSeed: this.terrainGenerator.worldSeed,
      initialState: this.savedStudioState.publishing,
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
      onStructurePlaced: (structurePlacement) => this.saveSystem.recordStructurePlacement(structurePlacement),
      onBlocksPlaced: (blockEdits) => this.handleBlocksPlaced(blockEdits),
      onBlockRemoved: (blockEdit) => this.networkSession.queueBlockEdits([blockEdit]),
    });
    this.studioToolSystem = new StudioToolSystem({
      world: this.terrainGenerator,
      inventorySystem: this.inventorySystem,
      permissionSystem: this.creatorPermissionSystem,
      prefabRegistry: this.prefabRegistry,
      publishingSystem: this.worldPublishingSystem,
      onStudioEdits: (edits) => this.networkSession.queueStudioEdits(edits),
      onPrefabPlaced: (prefabPlacement) => this.handlePrefabPlaced(prefabPlacement),
      onWorldPublished: (publishRecord) => this.networkSession.queueWorldPublish(publishRecord),
      onStateChanged: (toolState) => this.saveSystem.saveStudioState({
        toolState,
        permissions: this.creatorPermissionSystem.getPersistenceState(),
        publishing: this.worldPublishingSystem.getPersistenceState(),
      }),
    });
    this.debugOverlay = new DebugOverlay({ rootElement });
    this.mainMenuUI = new MainMenuUI({
      rootElement,
      settingsSystem: this.settingsSystem,
      networkMode: this.networkSession.mode,
      onPlaySolo: () => this.playSolo(),
      onJoinMultiplayer: (serverUrl) => this.joinMultiplayer(serverUrl),
      onStudioMode: () => this.openStudioMode(),
      onSettingsChanged: (nextSettingsSnapshot) => this.applySettings(nextSettingsSnapshot),
      onMenuVisibilityChanged: (isMenuOpen) => this.setGameplayInputEnabled(!isMenuOpen),
      onUiAction: () => this.audioFeedbackSystem.playCue('ui'),
      runtimeConfig: this.runtimeConfig,
    });
    this.releaseBannerUI = new ReleaseBannerUI({
      rootElement,
      runtimeConfig: this.runtimeConfig,
    });
    this.hotbarUI = new HotbarUI({
      rootElement,
      inventorySystem: this.inventorySystem,
    });
    this.survivalHud = new SurvivalHud({
      rootElement,
      survivalSystem: this.survivalSystem,
    });
    this.combatHud = new CombatHud({
      rootElement,
      combatSystem: this.combatSystem,
      entitySystem: this.entitySystem,
    });
    this.autonomousPlaytest = new AutonomousPlaytestSimulation({
      adapter: new EnginePlaytestAdapter({ engine: this }),
      telemetrySystem: this.telemetrySystem,
      reportSystem: this.autoQaReportSystem,
      recordFrames: false,
    });
    this.lastAutoTestReport = null;
    this.autoTestUiUpdateTimer = 0;
    this.feedbackUI = new FeedbackUI({
      rootElement,
      reportSystem: this.autoQaReportSystem,
      getRuntimeSnapshot: () => this.createAutoQaRuntimeSnapshot(),
      getAutoTestSnapshot: () => this.autonomousPlaytest.getSnapshot(),
      onRunAutoTest: ({ modeId, inventoryProfileId }) => this.startAutonomousPlaytest({ modeId, inventoryProfileId }),
      runtimeConfig: this.runtimeConfig,
      onUiAction: (action) => {
        this.telemetrySystem.recordGameplayEvent('feedback', { action });
        this.audioFeedbackSystem.playCue('ui');
      },
    });

    this.sceneSystem.add(this.skySystem.group);
    this.sceneSystem.add(this.lightingSystem.group);
    this.sceneSystem.add(this.terrainGenerator.group);
    this.sceneSystem.add(this.entitySystem.group);
    this.sceneSystem.add(this.networkSession.group);
    this.sceneSystem.add(this.voxelInteractionSystem.group);
    this.sceneSystem.add(this.studioToolSystem.group);
    this.sceneSystem.add(this.playerController.object);
    this.sceneSystem.add(this.ambientParticleSystem.group);
    this.sceneSystem.add(this.feedbackParticleSystem.group);

    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.update = this.update.bind(this);
    this.persistenceSaveTimer = 0;
    this.persistenceSnapshot = this.saveSystem.getPersistenceStats();
    this.wasPlayerDeadLastFrame = this.playerState.isDead;
    this.applySettings(settingsSnapshot);
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
    this.cameraSystem.dispose();
    this.voxelInteractionSystem.dispose();
    this.studioToolSystem.dispose();
    this.mainMenuUI.dispose();
    this.inventorySystem.dispose();
    this.hotbarUI.dispose();
    this.survivalHud.dispose();
    this.combatHud.dispose();
    this.autonomousPlaytest.stop('engine-stop');
    this.feedbackUI.dispose();
    this.releaseBannerUI.dispose();
    this.skySystem.dispose();
    this.ambientParticleSystem.dispose();
    this.feedbackParticleSystem.dispose();
    this.audioFeedbackSystem.dispose();
    this.telemetrySystem.dispose();
  }

  handleKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (event.code === 'KeyE') {
      if (this.survivalSystem.consumeSelectedItem()) {
        this.audioFeedbackSystem.playCue('ui');
      }
    } else if (event.code === 'KeyR') {
      this.craftingSystem.craftFirstAvailable();
      this.audioFeedbackSystem.playCue('ui');
    } else if (event.code === 'KeyQ') {
      const wasAttackStarted = this.combatSystem.tryPlayerMeleeAttack({
        playerPosition: this.playerController.position,
        selectedStack: this.inventorySystem.getSelectedStack(),
        entitySystem: this.entitySystem,
      });
      this.telemetrySystem.recordGameplayEvent('combat', {
        result: wasAttackStarted ? 'hit' : this.combatSystem.getSnapshot().lastAttack?.state ?? 'attempt',
      });
      if (!wasAttackStarted) {
        this.audioFeedbackSystem.playCue('ui');
      }
      this.networkSession.queueCombatAction({
        type: 'melee',
        state: wasAttackStarted ? 'attack' : 'attempt',
        selectedSlot: this.playerState.selectedSlot,
        position: {
          x: this.playerController.position.x,
          y: this.playerController.position.y,
          z: this.playerController.position.z,
        },
      });
      event.preventDefault();
    } else if (event.code === 'KeyT') {
      this.worldSimulationSystem.requestSleep();
      this.audioFeedbackSystem.playCue('ui');
    } else if (event.code === 'F3') {
      this.toggleDebugOverlay();
      this.audioFeedbackSystem.playCue('ui');
      event.preventDefault();
    }
  }

  setGameplayInputEnabled(isEnabled) {
    this.playerController?.setInputEnabled(isEnabled);
    this.cameraSystem?.setInputEnabled(isEnabled);
  }

  toggleDebugOverlay() {
    const settings = this.settingsSystem.getSnapshot();
    const nextSettings = this.settingsSystem.updateSettings({
      debugOverlay: !settings.debugOverlay,
    });

    this.applySettings(nextSettings);
    this.mainMenuUI.render();
  }

  playSolo() {
    const url = new URL(window.location.href);

    if (url.searchParams.has('multiplayer') || url.searchParams.has('network')) {
      url.searchParams.delete('multiplayer');
      url.searchParams.delete('network');
      url.searchParams.delete('server');
      window.location.href = url.toString();
      return;
    }

    this.applySettings(this.settingsSystem.getSnapshot());
  }

  async joinMultiplayer(serverUrl) {
    if (!serverUrl) {
      return {
        ok: false,
        message: 'Public multiplayer server URL is not configured. Set VITE_GODOY_WS_URL for the deployed client.',
      };
    }

    const serverHealth = await checkServerHealth(serverUrl);

    if (!serverHealth.ok) {
      return serverHealth;
    }

    const url = new URL(window.location.href);

    url.searchParams.set('multiplayer', '1');
    url.searchParams.set('server', serverUrl);
    window.location.href = url.toString();

    return {
      ok: true,
      message: serverHealth.message,
    };
  }

  openStudioMode() {
    if (!this.studioToolSystem.isActive) {
      this.studioToolSystem.toggleStudioMode();
    }

    this.applySettings(this.settingsSystem.getSnapshot());
  }

  startAutonomousPlaytest({ modeId = 'quick', inventoryProfileId = undefined } = {}) {
    const result = this.autonomousPlaytest.start({ modeId, inventoryProfileId });

    if (result.ok) {
      this.setGameplayInputEnabled(true);
      this.mainMenuUI.closeMenu();
      this.lastAutoTestReport = null;
    }

    this.feedbackUI.setAutoTestSnapshot(result.snapshot, this.lastAutoTestReport);

    return result;
  }

  applySettings(settingsSnapshot) {
    this.rendererSystem.applySettings(settingsSnapshot);
    this.terrainGenerator.applySettings(settingsSnapshot);
    this.ambientAudioSystem.applySettings(settingsSnapshot);
    this.audioFeedbackSystem.applySettings(settingsSnapshot);
    this.debugOverlay.setVisible(settingsSnapshot.debugOverlay);
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

    this.telemetrySystem.updateFrame(deltaTime);
    const autoTestUpdate = this.autonomousPlaytest.update(deltaTime);
    const autoTestSnapshot = autoTestUpdate.snapshot;
    if (autoTestUpdate.report) {
      this.lastAutoTestReport = autoTestUpdate.report;
    }
    this.updateAutoTestFeedback(deltaTime, autoTestUpdate);
    this.dayNightSystem.update(deltaTime);
    this.worldSimulationSystem.update({
      deltaTime,
      dayNightSystem: this.dayNightSystem,
      entitySystem: this.entitySystem,
    });
    const dayNightSnapshot = this.dayNightSystem.getSnapshot();
    this.weatherSystem.update({
      deltaTime,
      dayNightSnapshot,
      activeBiome: this.terrainGenerator.stats.activeBiome,
    });
    const weatherSnapshot = this.weatherSystem.getSnapshot();
    this.lightingSystem.update(dayNightSnapshot, weatherSnapshot, this.playerController.position);
    this.sceneSystem.applyEnvironment(dayNightSnapshot, weatherSnapshot);
    this.playerController.update(deltaTime, {
      movementYaw: this.cameraSystem.getMovementYaw(),
    });
    const landingImpact = this.playerController.consumeLandingImpact();

    if (landingImpact > 4) {
      const landingIntensity = Math.min(2.4, landingImpact / 10);

      this.playerController.triggerLandingFeedback(landingImpact);
      this.cameraSystem.addShake(0.025 + landingIntensity * 0.018);
      this.feedbackParticleSystem.emitLanding({
        position: this.playerController.position,
        intensity: landingIntensity,
      });
      this.audioFeedbackSystem.playCue('landing');
    }

    this.survivalSystem.update({
      deltaTime,
      playerController: this.playerController,
      landingImpact,
      dayNightSnapshot,
    });
    this.damageSystem.applyFallDamage(landingImpact);
    this.terrainGenerator.update({
      focusPosition: this.playerController.position,
      camera: this.cameraSystem.camera,
      elapsedTime,
      weatherSnapshot,
    });
    this.physicsWorld.update(deltaTime);
    this.cameraSystem.update({
      targetPosition: this.playerController.cameraTarget,
      deltaTime,
      movementSpeed: this.playerController.movementSystem.horizontalVelocity.length(),
      isGrounded: this.playerState.isGrounded,
      isSprinting: this.playerState.isSprinting,
      isFlying: this.playerState.isFlying,
    });
    this.skySystem.update({
      dayNightSnapshot,
      weatherSnapshot,
      cameraPosition: this.cameraSystem.camera.position,
    });
    this.voxelInteractionSystem.update(deltaTime);
    this.creatorPermissionSystem.updateFromServerMetadata(this.networkSession.getWorldMetadata());
    this.studioToolSystem.update({
      targetBlock: this.voxelInteractionSystem.targetBlock,
      terrainStats: this.terrainGenerator.stats,
      networkSnapshot: this.networkSession.getSnapshot(),
    });
    this.entitySystem.update({
      deltaTime,
      playerPosition: this.playerController.position,
      dayNightSnapshot,
    });
    this.combatSystem.update(deltaTime);
    this.furnaceSystem.update(deltaTime);
    this.progressionSystem.update();
    this.craftingSystem.update();
    const survivalSnapshot = this.survivalSystem.getSnapshot();
    if (survivalSnapshot.isDead && !this.wasPlayerDeadLastFrame) {
      this.telemetrySystem.recordGameplayEvent('death', {
        source: survivalSnapshot.lastEvent,
      });
    }
    this.wasPlayerDeadLastFrame = survivalSnapshot.isDead;
    const combatSnapshot = this.combatSystem.getSnapshot();
    const worldSimulationSnapshot = this.worldSimulationSystem.getSnapshot();
    const inventorySnapshot = this.inventorySystem.getSnapshot();
    this.networkSession.update({
      deltaTime,
      playerController: this.playerController,
      playerState: this.playerState,
      inventorySnapshot,
      entitySystem: this.entitySystem,
      terrainReplicationSnapshot: this.terrainGenerator.getReplicationSnapshot(),
    });
    this.applyRemoteBlockEdits(this.networkSession.consumeRemoteBlockEdits());
    this.ambientAudioSystem.update({
      weatherSnapshot,
      dayNightSnapshot,
      terrainStats: this.terrainGenerator.stats,
      survivalSnapshot,
      combatSnapshot,
    });
    this.audioFeedbackSystem.update({
      deltaTime,
      playerController: this.playerController,
      weatherSnapshot,
      dayNightSnapshot,
      terrainStats: this.terrainGenerator.stats,
    });
    this.ambientParticleSystem.update({
      deltaTime,
      elapsedTime,
      focusPosition: this.playerController.position,
      weatherSnapshot,
      dayNightSnapshot,
      terrainStats: this.terrainGenerator.stats,
    });
    this.feedbackParticleSystem.update(deltaTime);
    this.updatePersistence(deltaTime);
    this.sceneSystem.update(deltaTime, elapsedTime);
    this.rendererSystem.render(this.sceneSystem.scene, this.cameraSystem.camera);
    this.hotbarUI.update();
    this.survivalHud.update();
    this.combatHud.update();
    this.debugOverlay.update({
      deltaTime,
      interactionStatus: this.voxelInteractionSystem.lastAction,
      playerPosition: this.playerController.position,
      terrainStats: this.terrainGenerator.stats,
      entityStats: this.entitySystem.stats,
      playerState: this.playerState.getSnapshot(),
      survivalSnapshot,
      inventorySnapshot,
      miningSnapshot: this.voxelInteractionSystem.miningSnapshot,
      craftingSnapshot: this.craftingSystem.getSnapshot(),
      damageSnapshot: this.damageSystem.getSnapshot(),
      combatSnapshot,
      dayNightSnapshot,
      weatherSnapshot,
      progressionSnapshot: this.progressionSystem.getSnapshot(),
      furnaceSnapshot: this.furnaceSystem.getSnapshot(),
      buildingSnapshot: this.voxelInteractionSystem.getBuildingSnapshot(),
      studioSnapshot: this.studioToolSystem.getSnapshot(),
      prefabSnapshot: this.prefabRegistry.getSnapshot(),
      publishingSnapshot: this.worldPublishingSystem.getSnapshot(),
      permissionsSnapshot: this.creatorPermissionSystem.getSnapshot(),
      persistenceSnapshot: this.persistenceSnapshot,
      worldSimulationSnapshot,
      audioSnapshot: this.createAudioDebugSnapshot(),
      networkSnapshot: this.networkSession.getSnapshot(),
      telemetrySnapshot: this.telemetrySystem.getSnapshot(),
      qaSnapshot: this.autoQaReportSystem.getSnapshot(),
      autoTestSnapshot,
    });

    this.animationFrameId = requestAnimationFrame(this.update);
  }

  handleBlockMined({ targetBlock, dropStack, blockDefinition }) {
    this.telemetrySystem.recordGameplayEvent('mining', {
      block: blockDefinition.name,
    });
    const dropPosition = {
      x: targetBlock.worldX + 0.5,
      y: targetBlock.y + 0.8,
      z: targetBlock.worldZ + 0.5,
    };

    this.feedbackParticleSystem.emitBlockBreak({
      position: {
        x: targetBlock.worldX + 0.5,
        y: targetBlock.y + 0.5,
        z: targetBlock.worldZ + 0.5,
      },
      blockDefinition,
    });
    this.playerController.triggerMiningFeedback();
    this.cameraSystem.addShake(0.035);
    this.audioFeedbackSystem.playCue('mining');

    if (blockDefinition.id === BLOCK_IDS.lootChest) {
      this.spawnChestLoot({ targetBlock, dropPosition });
    }

    this.entitySystem.spawnDroppedItem({
      itemStack: dropStack,
      position: dropPosition,
    });
  }

  handleBlocksPlaced(blockEdits) {
    this.telemetrySystem.recordGameplayEvent('building', {
      count: blockEdits.length,
      blockId: blockEdits[0]?.blockId,
    });
    this.networkSession.queueBlockEdits(blockEdits);

    const firstPlacement = blockEdits[0];

    if (!firstPlacement) {
      return;
    }

    const blockDefinition = BLOCK_DEFINITIONS[firstPlacement.blockId];

    this.feedbackParticleSystem.emitHit({
      position: {
        x: firstPlacement.worldX + 0.5,
        y: firstPlacement.y + 0.5,
        z: firstPlacement.worldZ + 0.5,
      },
      color: blockDefinition?.color ?? '#8ee6b5',
    });
    this.audioFeedbackSystem.playCue('ui');
  }

  handleCombatHit({ position }) {
    this.telemetrySystem.recordGameplayEvent('combat-hit');
    this.feedbackParticleSystem.emitHit({
      position: {
        x: position.x,
        y: position.y + 0.8,
        z: position.z,
      },
    });
    this.cameraSystem.addShake(0.045);
    this.audioFeedbackSystem.playCue('hit');
  }

  spawnChestLoot({ targetBlock, dropPosition }) {
    const chestId = this.saveSystem.getChestId({
      worldX: targetBlock.worldX,
      y: targetBlock.y,
      worldZ: targetBlock.worldZ,
    });
    const savedChest = this.saveSystem.loadChestState(chestId);

    if (savedChest?.isLooted) {
      return;
    }

    const tableId = targetBlock.metadata?.lootTableId ?? LOOT_TABLE_IDS.campChest;
    const lootStacks = savedChest?.generatedLoot ?? this.lootSystem.generateChestLoot({
      tableId,
      seed: `${targetBlock.worldX},${targetBlock.y},${targetBlock.worldZ}:${tableId}`,
    });

    this.saveSystem.markChestLooted({
      chestId,
      lootStacks,
    });

    for (const itemStack of lootStacks) {
      this.entitySystem.spawnDroppedItem({
        itemStack,
        position: dropPosition,
      });
    }
  }

  handlePrefabPlaced(prefabPlacement) {
    this.saveSystem.recordPrefabPlacement(prefabPlacement);
    this.saveSystem.recordStructurePlacement(prefabPlacement);
  }

  updatePersistence(deltaTime) {
    this.persistenceSaveTimer += deltaTime;

    if (this.persistenceSaveTimer < PERSISTENCE_INTERVAL_SECONDS) {
      return;
    }

    this.persistenceSaveTimer = 0;
    this.saveSystem.flushSimulationState({
      entityStates: this.entitySystem.getPersistenceState(),
      furnaceState: this.furnaceSystem.getPersistenceState(),
      weatherState: this.weatherSystem.getPersistenceState(),
      worldSimulationState: {
        ...this.worldSimulationSystem.getPersistenceState(),
        dayNight: this.dayNightSystem.getPersistenceState(),
      },
      studioState: {
        permissions: this.creatorPermissionSystem.getPersistenceState(),
        publishing: this.worldPublishingSystem.getPersistenceState(),
        toolState: this.studioToolSystem.getPersistenceState(),
      },
    });
    this.persistenceSnapshot = this.saveSystem.getPersistenceStats();
  }

  applyRemoteBlockEdits(blockEdits) {
    for (const blockEdit of blockEdits) {
      this.terrainGenerator.setBlockAtWorldPosition(
        blockEdit.worldX,
        blockEdit.y,
        blockEdit.worldZ,
        blockEdit.blockId,
      );
    }
  }

  updateAutoTestFeedback(deltaTime, autoTestUpdate) {
    this.autoTestUiUpdateTimer += deltaTime;

    if (
      autoTestUpdate.completed ||
      (this.autonomousPlaytest.status === 'running' && this.autoTestUiUpdateTimer >= 0.75)
    ) {
      this.autoTestUiUpdateTimer = 0;
      this.feedbackUI.setAutoTestSnapshot(autoTestUpdate.snapshot, this.lastAutoTestReport);
    }
  }

  createAudioDebugSnapshot() {
    const ambientAudioSnapshot = this.ambientAudioSystem.getSnapshot();
    const feedbackAudioSnapshot = this.audioFeedbackSystem.getSnapshot();

    return {
      ...ambientAudioSnapshot,
      feedback: feedbackAudioSnapshot,
      pendingCues: [
        ...new Set([
          ...(ambientAudioSnapshot.pendingCues ?? []),
          ...(feedbackAudioSnapshot.pendingCues ?? []),
        ]),
      ],
      hookCount: (ambientAudioSnapshot.hookCount ?? 0) + 1,
    };
  }

  createAutoQaRuntimeSnapshot() {
    const settingsSnapshot = this.settingsSystem.getSnapshot();
    const rendererCapabilities = this.rendererSystem.renderer.capabilities;

    return {
      renderer: {
        width: this.rendererSystem.width,
        height: this.rendererSystem.height,
        pixelRatio: Number(this.rendererSystem.renderer.getPixelRatio().toFixed(2)),
        isWebGL2: rendererCapabilities.isWebGL2,
        maxTextureSize: rendererCapabilities.maxTextureSize,
        precision: rendererCapabilities.precision,
        shadowsEnabled: this.rendererSystem.shadowsEnabled,
      },
      settings: {
        graphicsQuality: settingsSnapshot.graphicsQuality,
        renderDistancePreset: settingsSnapshot.renderDistancePreset,
        debugOverlay: settingsSnapshot.debugOverlay,
        controlsHelp: settingsSnapshot.controlsHelp,
      },
      player: this.playerState.getSnapshot(),
      inventory: this.inventorySystem.getSnapshot(),
      survival: this.survivalSystem.getSnapshot(),
      terrain: this.terrainGenerator.stats,
      entities: this.entitySystem.stats,
      network: this.networkSession.getSnapshot(),
      persistence: this.persistenceSnapshot,
    };
  }
}

function resolveInventoryInitializationSource() {
  if (typeof window === 'undefined') {
    return INVENTORY_INITIALIZATION_SOURCES.newSurvivalWorld;
  }

  const url = new URL(window.location.href);

  if (url.searchParams.has('multiplayer') || url.searchParams.has('network')) {
    return INVENTORY_INITIALIZATION_SOURCES.multiplayerJoin;
  }

  return INVENTORY_INITIALIZATION_SOURCES.newSurvivalWorld;
}
