export const PLAYER_MODES = {
  creative: 'creative',
  survival: 'survival',
};

export class PlayerState {
  constructor({
    mode = PLAYER_MODES.creative,
    health = 100,
    hunger = 100,
    selectedSlot = 0,
  } = {}) {
    this.mode = mode;
    this.health = health;
    this.hunger = hunger;
    this.selectedSlot = selectedSlot;
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

  getSnapshot() {
    return {
      mode: this.mode,
      health: this.health,
      hunger: this.hunger,
      selectedSlot: this.selectedSlot,
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isCrouching: this.isCrouching,
      isGrounded: this.isGrounded,
    };
  }
}
