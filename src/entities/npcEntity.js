import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { BaseEntity } from './baseEntity.js';
import { ENTITY_TYPES } from './entityTypes.js';

const bodyGeometry = new BoxGeometry(0.72, 1.05, 0.52);
const headGeometry = new BoxGeometry(0.52, 0.52, 0.52);
const bodyMaterial = new MeshStandardMaterial({ color: '#5477e8', roughness: 0.84 });
const headMaterial = new MeshStandardMaterial({ color: '#ffd29a', roughness: 0.8 });
const IDLE_SECONDS = [1.4, 3.8];
const WANDER_SECONDS = [1.1, 2.4];
const WANDER_SPEED = 1.15;

export class NpcEntity extends BaseEntity {
  constructor() {
    super({
      type: ENTITY_TYPES.npc,
      name: 'NpcEntity',
    });

    this.collider.radius = 0.4;
    this.collider.height = 1.65;
    this.collider.groundedOffset = 0.02;
    this.behavior = {
      state: 'idle',
      timer: 0,
      moveDirection: new Vector3(),
    };
    this.object.add(createNpcModel());
  }

  initialize({ id = null, position, seed = Math.random(), persistenceState = null } = {}) {
    super.initialize({ id, position });
    this.seed = seed;
    this.behavior.state = persistenceState?.behaviorState ?? 'idle';
    this.behavior.timer = persistenceState?.behaviorTimer ?? getRandomRange(IDLE_SECONDS);
    this.behavior.moveDirection.set(0, 0, 0);
    this.applyPersistenceState(persistenceState);

    return this;
  }

  update(deltaTime, context) {
    this.updateBehavior(deltaTime);
    this.applyBehaviorMovement(deltaTime);
    super.update(deltaTime, context);
  }

  updateBehavior(deltaTime) {
    this.behavior.timer -= deltaTime;

    if (this.behavior.timer > 0) {
      return;
    }

    if (this.behavior.state === 'idle') {
      this.behavior.state = 'wander';
      this.behavior.timer = getRandomRange(WANDER_SECONDS);
      this.pickWanderDirection();
    } else {
      this.behavior.state = 'idle';
      this.behavior.timer = getRandomRange(IDLE_SECONDS);
      this.behavior.moveDirection.set(0, 0, 0);
    }
  }

  applyBehaviorMovement(deltaTime) {
    if (this.behavior.state !== 'wander') {
      return;
    }

    this.transform.position.addScaledVector(this.behavior.moveDirection, WANDER_SPEED * deltaTime);
    this.transform.rotation.y = Math.atan2(this.behavior.moveDirection.x, this.behavior.moveDirection.z);
  }

  pickWanderDirection() {
    const angle = Math.random() * Math.PI * 2;

    this.behavior.moveDirection.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
  }

  getPersistenceState() {
    return {
      ...super.getPersistenceState(),
      seed: this.seed,
      behaviorState: this.behavior.state,
      behaviorTimer: this.behavior.timer,
    };
  }
}

function createNpcModel() {
  const model = new Group();
  const body = new Mesh(bodyGeometry, bodyMaterial);
  const head = new Mesh(headGeometry, headMaterial);

  body.position.y = 0.55;
  head.position.y = 1.35;
  body.castShadow = true;
  body.receiveShadow = true;
  head.castShadow = true;
  head.receiveShadow = true;
  model.add(body, head);

  return model;
}

function getRandomRange([minimum, maximum]) {
  return minimum + Math.random() * (maximum - minimum);
}
