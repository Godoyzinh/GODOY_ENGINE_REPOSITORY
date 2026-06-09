export const DAMAGE_TYPES = {
  attack: 'attack',
  fall: 'fall',
  starvation: 'starvation',
};

export class DamageSystem {
  constructor({ survivalSystem }) {
    this.survivalSystem = survivalSystem;
    this.lastDamageEvent = null;
  }

  applyPlayerDamage({ amount, type = DAMAGE_TYPES.attack, source = null, landingImpact = null, fallDistance = null }) {
    const healthBefore = this.survivalSystem.playerState.health;
    const wasApplied = this.survivalSystem.applyDamage({ amount, type, source });
    const healthAfter = this.survivalSystem.playerState.health;

    if (wasApplied) {
      this.lastDamageEvent = {
        target: 'player',
        amount,
        type,
        source,
        healthBefore,
        healthAfter,
        killed: this.survivalSystem.playerState.isDead,
        landingImpact,
        fallDistance,
      };
    }

    return wasApplied;
  }

  applyEntityDamage({ entity, amount, type = DAMAGE_TYPES.attack, source = null, knockback = null }) {
    if (!entity || typeof entity.applyDamage !== 'function') {
      return false;
    }

    const wasApplied = entity.applyDamage({ amount, type, source, knockback });

    if (wasApplied) {
      this.lastDamageEvent = {
        target: entity.id,
        amount,
        type,
        source,
        targetName: entity.name,
      };
    }

    return wasApplied;
  }

  applyFallDamage(landingImpact) {
    if (landingImpact <= 12) {
      return false;
    }

    const damageAmount = Math.round((landingImpact - 12) * 1.25);

    return this.applyPlayerDamage({
      amount: damageAmount,
      type: DAMAGE_TYPES.fall,
      source: 'terrain',
      landingImpact,
      fallDistance: landingImpact,
    });
  }

  getSnapshot() {
    return {
      lastDamageEvent: this.lastDamageEvent,
    };
  }
}
