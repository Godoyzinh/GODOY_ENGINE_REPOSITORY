import { Vector3 } from 'three';
import { DAMAGE_TYPES } from './damageSystem.js';

const MELEE_RANGE = 3.1;
const MELEE_ARC_COSINE = 0.22;
const DEFAULT_COOLDOWN_SECONDS = 0.7;
const DAMAGE_INDICATOR_SECONDS = 1.1;

const TOOL_COMBAT_PROFILES = {
  hand: {
    damage: 4,
    cooldown: 0.62,
    knockback: 4.5,
  },
  pickaxe: {
    damage: 8,
    cooldown: 0.82,
    knockback: 5.2,
  },
  axe: {
    damage: 10,
    cooldown: 0.95,
    knockback: 6,
  },
};

export class CombatSystem {
  constructor({ camera, damageSystem, toolSystem }) {
    this.camera = camera;
    this.damageSystem = damageSystem;
    this.toolSystem = toolSystem;
    this.attackCooldownRemaining = 0;
    this.attackCooldownDuration = DEFAULT_COOLDOWN_SECONDS;
    this.lastAttack = {
      state: 'ready',
      targetName: 'None',
      damage: 0,
    };
    this.damageIndicators = [];
  }

  update(deltaTime) {
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaTime);

    for (const indicator of this.damageIndicators) {
      indicator.age += deltaTime;
    }

    this.damageIndicators = this.damageIndicators.filter((indicator) => indicator.age < DAMAGE_INDICATOR_SECONDS);
  }

  tryPlayerMeleeAttack({ playerPosition, selectedStack, entitySystem }) {
    if (this.attackCooldownRemaining > 0) {
      this.lastAttack = {
        state: 'cooldown',
        targetName: 'None',
        damage: 0,
      };
      return false;
    }

    const activeTool = this.toolSystem.getToolFromInventoryStack(selectedStack);
    const profile = this.getCombatProfile(activeTool);
    const attackDirection = this.getAttackDirection();
    const target = entitySystem.findMeleeTarget({
      origin: playerPosition,
      direction: attackDirection,
      range: MELEE_RANGE,
      arcCosine: MELEE_ARC_COSINE,
    });

    this.attackCooldownDuration = profile.cooldown;
    this.attackCooldownRemaining = profile.cooldown;

    if (!target) {
      this.lastAttack = {
        state: 'miss',
        targetName: 'None',
        damage: 0,
      };
      return false;
    }

    const knockback = attackDirection.clone().multiplyScalar(profile.knockback);
    const wasApplied = this.damageSystem.applyEntityDamage({
      entity: target,
      amount: profile.damage,
      type: DAMAGE_TYPES.attack,
      source: 'player',
      knockback,
    });

    if (!wasApplied) {
      this.lastAttack = {
        state: 'blocked',
        targetName: target.name,
        damage: 0,
      };
      return false;
    }

    this.lastAttack = {
      state: 'hit',
      targetName: target.name,
      targetId: target.id,
      damage: profile.damage,
    };
    this.damageIndicators.push({
      id: `${target.id}:${performance.now()}`,
      targetName: target.name,
      damage: profile.damage,
      age: 0,
    });

    return true;
  }

  getCombatProfile(toolDefinition) {
    return TOOL_COMBAT_PROFILES[toolDefinition.id] ?? TOOL_COMBAT_PROFILES.hand;
  }

  getAttackDirection() {
    const direction = new Vector3();

    this.camera.getWorldDirection(direction);
    direction.y = 0;

    if (direction.lengthSq() === 0) {
      return new Vector3(0, 0, -1);
    }

    return direction.normalize();
  }

  getSnapshot() {
    return {
      cooldownRemaining: this.attackCooldownRemaining,
      cooldownDuration: this.attackCooldownDuration,
      cooldownPercent: this.attackCooldownDuration > 0
        ? 1 - this.attackCooldownRemaining / this.attackCooldownDuration
        : 1,
      lastAttack: this.lastAttack,
      damageIndicators: this.damageIndicators.map((indicator) => ({ ...indicator })),
    };
  }
}
