import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { getBlockDefinition } from '../world/blockRegistry.js';
import { BaseEntity } from './baseEntity.js';
import { ENTITY_TYPES } from './entityTypes.js';

const itemGeometry = new BoxGeometry(0.34, 0.34, 0.34);
const materialCache = new Map();
const DEFAULT_DESPAWN_SECONDS = 45;
const PICKUP_DELAY_SECONDS = 0.35;
const PICKUP_RADIUS = 1.45;

export class DroppedItemEntity extends BaseEntity {
  constructor() {
    super({
      type: ENTITY_TYPES.droppedItem,
      name: 'DroppedItemEntity',
    });

    this.blockId = null;
    this.count = 1;
    this.despawnAfter = DEFAULT_DESPAWN_SECONDS;
    this.pickupDelay = PICKUP_DELAY_SECONDS;
    this.collider.radius = 0.28;
    this.collider.height = 0.34;
    this.collider.groundedOffset = 0.28;
    this.mesh = new Mesh(itemGeometry, getItemMaterial(0));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.object.add(this.mesh);
  }

  initialize({ blockId, count = 1, position, impulse = null } = {}) {
    super.initialize({ position });
    this.blockId = blockId;
    this.count = count;
    this.despawnAfter = DEFAULT_DESPAWN_SECONDS;
    this.pickupDelay = PICKUP_DELAY_SECONDS;
    this.mesh.material = getItemMaterial(blockId);
    this.mesh.position.set(0, 0.18, 0);
    this.velocity.copy(impulse ?? createDefaultImpulse());

    return this;
  }

  update(deltaTime, context) {
    super.update(deltaTime, context);
    this.updatePresentation(deltaTime);
    this.checkPickup(context);

    if (this.state.age >= this.despawnAfter) {
      this.requestRemoval('despawned');
    }
  }

  updatePresentation(deltaTime) {
    this.mesh.rotation.y += deltaTime * 2.2;
    this.mesh.position.y = 0.2 + Math.sin(this.state.age * 5) * 0.05;
  }

  checkPickup({ playerPosition, inventorySystem }) {
    if (!playerPosition || !inventorySystem || this.state.age < this.pickupDelay) {
      return;
    }

    if (this.transform.position.distanceTo(playerPosition) > PICKUP_RADIUS) {
      return;
    }

    const wasAdded = inventorySystem.addItem({
      itemType: 'block',
      itemId: this.blockId,
      count: this.count,
    });

    if (wasAdded) {
      this.requestRemoval('pickedUp');
    }
  }
}

function getItemMaterial(blockId) {
  if (!materialCache.has(blockId)) {
    const blockDefinition = getBlockDefinition(blockId);
    materialCache.set(
      blockId,
      new MeshStandardMaterial({
        color: blockDefinition.color ?? '#ffffff',
        roughness: 0.82,
        metalness: 0,
      }),
    );
  }

  return materialCache.get(blockId);
}

function createDefaultImpulse() {
  return new Vector3(
    (Math.random() - 0.5) * 1.6,
    4.5,
    (Math.random() - 0.5) * 1.6,
  );
}
