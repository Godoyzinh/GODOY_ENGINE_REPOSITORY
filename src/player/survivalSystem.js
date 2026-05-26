import { DAMAGE_TYPES } from '../combat/damageSystem.js';
import { getConsumableEffect } from '../items/itemRegistry.js';
import { PLAYER_MODES } from './playerState.js';

const HUNGER_DRAIN_PER_SECOND = 0.18;
const SPRINT_STAMINA_DRAIN_PER_SECOND = 18;
const STAMINA_REGEN_PER_SECOND = 14;
const CROUCH_STAMINA_REGEN_BONUS = 5;
const HEALTH_REGEN_PER_SECOND = 2.5;
const STARVATION_DAMAGE_INTERVAL = 2.5;
const RESPAWN_DELAY_SECONDS = 2;

export class SurvivalSystem {
  constructor({ playerState, inventorySystem }) {
    this.playerState = playerState;
    this.inventorySystem = inventorySystem;
    this.starvationTimer = 0;
    this.respawnTimer = 0;
    this.lastEvent = 'Ready';
  }

  update({ deltaTime, playerController, landingImpact }) {
    if (this.playerState.mode !== PLAYER_MODES.survival) {
      this.playerState.restoreStamina(STAMINA_REGEN_PER_SECOND * deltaTime);
      this.lastEvent = 'Creative';
      return;
    }

    if (this.playerState.isDead) {
      this.updateRespawn(deltaTime, playerController);
      return;
    }

    this.updateNeeds(deltaTime);
    this.updateStamina(deltaTime);
    this.updateRegeneration(deltaTime);

    if (landingImpact > 0) {
      this.lastEvent = `Landing ${landingImpact.toFixed(1)}`;
    }
  }

  updateNeeds(deltaTime) {
    this.playerState.restoreHunger(-HUNGER_DRAIN_PER_SECOND * deltaTime);

    if (this.playerState.hunger > 0) {
      this.starvationTimer = 0;
      return;
    }

    this.starvationTimer += deltaTime;

    if (this.starvationTimer >= STARVATION_DAMAGE_INTERVAL) {
      this.starvationTimer = 0;
      this.applyDamage({
        amount: 4,
        type: DAMAGE_TYPES.starvation,
        source: 'hunger',
      });
    }
  }

  updateStamina(deltaTime) {
    if (this.playerState.isSprinting) {
      this.playerState.restoreStamina(-SPRINT_STAMINA_DRAIN_PER_SECOND * deltaTime);
      return;
    }

    const regenRate = STAMINA_REGEN_PER_SECOND + (this.playerState.isCrouching ? CROUCH_STAMINA_REGEN_BONUS : 0);
    this.playerState.restoreStamina(regenRate * deltaTime);
  }

  updateRegeneration(deltaTime) {
    if (this.playerState.hunger < 70 || this.playerState.health >= this.playerState.maxHealth) {
      return;
    }

    this.playerState.restoreHealth(HEALTH_REGEN_PER_SECOND * deltaTime);
  }

  applyDamage({ amount, type, source }) {
    if (this.playerState.mode !== PLAYER_MODES.survival || this.playerState.isDead) {
      return false;
    }

    this.playerState.restoreHealth(-amount);
    this.lastEvent = `${type} -${amount}`;

    if (this.playerState.health <= 0) {
      this.killPlayer(source);
    }

    return true;
  }

  consumeSelectedItem() {
    const selectedStack = this.inventorySystem.getSelectedStack();
    const consumableEffect = selectedStack ? getConsumableEffect(selectedStack) : null;

    if (!consumableEffect) {
      return false;
    }

    this.playerState.restoreHunger(consumableEffect.hungerRestore ?? 0);
    this.playerState.restoreHealth(consumableEffect.healthRestore ?? 0);
    this.playerState.restoreStamina(consumableEffect.staminaRestore ?? 0);
    this.inventorySystem.consumeSelected(1);
    this.lastEvent = `Ate ${selectedStack.name}`;

    return true;
  }

  killPlayer(source) {
    this.playerState.isDead = true;
    this.respawnTimer = RESPAWN_DELAY_SECONDS;
    this.lastEvent = `Death ${source ?? ''}`.trim();
  }

  updateRespawn(deltaTime, playerController) {
    this.respawnTimer -= deltaTime;

    if (this.respawnTimer > 0) {
      this.lastEvent = `Respawn ${this.respawnTimer.toFixed(1)}s`;
      return;
    }

    this.playerState.respawn();
    playerController.respawn();
    this.lastEvent = 'Respawned';
  }

  getSnapshot() {
    return {
      health: this.playerState.health,
      maxHealth: this.playerState.maxHealth,
      hunger: this.playerState.hunger,
      maxHunger: this.playerState.maxHunger,
      stamina: this.playerState.stamina,
      maxStamina: this.playerState.maxStamina,
      isDead: this.playerState.isDead,
      lastEvent: this.lastEvent,
    };
  }
}
