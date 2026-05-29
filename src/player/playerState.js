export const PLAYER_MODES = {
  creative: 'creative',
  survival: 'survival',
};

export class PlayerState {
  constructor({
    mode = PLAYER_MODES.survival,
    health = 100,
    hunger = 100,
    stamina = 100,
    selectedSlot = 0,
  } = {}) {
    this.mode = mode;
    this.maxHealth = 100;
    this.maxHunger = 100;
    this.maxStamina = 100;
    this.health = health;
    this.hunger = hunger;
    this.stamina = stamina;
    this.selectedSlot = selectedSlot;
    this.isDead = false;
    this.isFlying = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isGrounded = false;
  }

  setSelectedSlot(selectedSlot) {
    this.selectedSlot = selectedSlot;
  }

  setMode(mode) {
    this.mode = mode;

    if (mode !== PLAYER_MODES.creative) {
      this.isFlying = false;
    }
  }

  toggleMode() {
    this.setMode(this.mode === PLAYER_MODES.creative ? PLAYER_MODES.survival : PLAYER_MODES.creative);

    return this.mode;
  }

  toggleFlyMode() {
    if (this.mode !== PLAYER_MODES.creative) {
      return false;
    }

    this.isFlying = !this.isFlying;
    return this.isFlying;
  }

  setMovementFlags({ isFlying, isSprinting, isCrouching, isGrounded }) {
    this.isFlying = isFlying;
    this.isSprinting = isSprinting;
    this.isCrouching = isCrouching;
    this.isGrounded = isGrounded;
  }

  restoreHealth(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  restoreHunger(amount) {
    this.hunger = clamp(this.hunger + amount, 0, this.maxHunger);
  }

  restoreStamina(amount) {
    this.stamina = clamp(this.stamina + amount, 0, this.maxStamina);
  }

  respawn() {
    this.health = this.maxHealth;
    this.hunger = Math.max(this.hunger, 55);
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.isFlying = false;
    this.isGrounded = false;
  }

  getSnapshot() {
    return {
      mode: this.mode,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      selectedSlot: this.selectedSlot,
      isDead: this.isDead,
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isCrouching: this.isCrouching,
      isGrounded: this.isGrounded,
    };
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
