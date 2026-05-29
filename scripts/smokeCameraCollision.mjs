import assert from 'node:assert/strict';
import { MovementSystem } from '../src/player/movementSystem.js';
import { PlayerState } from '../src/player/playerState.js';

assertCameraRelativeMovement();
assertLargeOverheadColliderDoesNotSnapPlayerUp();
assertMovementInputCanBePaused();

console.log('smoke:camera-collision ok');

function assertCameraRelativeMovement() {
  const movementSystem = new MovementSystem({
    playerState: new PlayerState(),
    terrainSampler: createFlatTerrain(8),
  });

  movementSystem.position.set(0, 8.05, 0);
  movementSystem.isGrounded = true;
  movementSystem.setCameraYaw(-Math.PI / 2);
  movementSystem.setInput('KeyW', true);
  movementSystem.update(0.2);

  assert.ok(movementSystem.position.x > 0.5, 'forward movement should follow camera yaw');
  assert.ok(Math.abs(movementSystem.position.z) < 0.1, 'camera-relative forward should not drift on world Z');
}

function assertLargeOverheadColliderDoesNotSnapPlayerUp() {
  const movementSystem = new MovementSystem({
    playerState: new PlayerState(),
    terrainSampler: {
      getHeightAt: () => 18,
    },
  });

  movementSystem.position.set(0, 8.05, 0);
  movementSystem.isGrounded = true;
  movementSystem.update(0.016);

  assert.ok(movementSystem.position.y < 9, 'overhead collision must not launch player upward');
}

function assertMovementInputCanBePaused() {
  const movementSystem = new MovementSystem({
    playerState: new PlayerState(),
    terrainSampler: createFlatTerrain(8),
  });

  movementSystem.setInput('KeyW', true);
  movementSystem.setInputEnabled(false);
  movementSystem.update(0.2);

  assert.equal(movementSystem.position.x, 0);
  assert.equal(movementSystem.position.z, 0);
}

function createFlatTerrain(height) {
  return {
    getHeightAt: () => height,
    getGroundHeightAt: () => height,
  };
}
