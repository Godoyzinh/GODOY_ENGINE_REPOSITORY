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

  applyPlayerDamage({ amount, type = DAMAGE_TYPES.attack, source = null }) {
    const wasApplied = this.survivalSystem.applyDamage({ amount, type, source });

    if (wasApplied) {
      this.lastDamageEvent = {
        target: 'player',
        amount,
        type,
        source,
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
    });
  }

  getSnapshot() {
    return {
      lastDamageEvent: this.lastDamageEvent,
    };
  }
}
