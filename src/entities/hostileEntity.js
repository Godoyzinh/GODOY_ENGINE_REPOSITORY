import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { DAMAGE_TYPES } from '../combat/damageSystem.js';
import { ITEM_IDS, ITEM_TYPES } from '../items/itemRegistry.js';
import { BaseEntity } from './baseEntity.js';
import { ENTITY_COMBAT_STATES, ENTITY_TYPES } from './entityTypes.js';

const bodyGeometry = new BoxGeometry(0.78, 0.92, 0.68);
const headGeometry = new BoxGeometry(0.48, 0.42, 0.48);
const healthBarBackGeometry = new BoxGeometry(0.96, 0.07, 0.05);
const healthBarFillGeometry = new BoxGeometry(0.9, 0.08, 0.06);
const AGGRO_RANGE = 20;
const CHASE_MEMORY_SECONDS = 4.2;
const ATTACK_RANGE = 1.55;
const CHASE_SPEED = 2.75;
const PATROL_SPEED = 0.9;
const FLEE_SPEED = 3.1;
const FLEE_HEALTH_PERCENT = 0.24;
const ATTACK_DAMAGE = 8;
const ATTACK_COOLDOWN_SECONDS = 1.15;
const IDLE_SECONDS = [1.2, 2.8];
const PATROL_SECONDS = [1.4, 3.2];

export class HostileEntity extends BaseEntity {
  constructor() {
    super({
      type: ENTITY_TYPES.hostile,
      name: 'HostileEntity',
    });

    const model = createHostileModel();

    this.state.maxHealth = 45;
    this.state.health = this.state.maxHealth;
    this.collider.radius = 0.45;
    this.collider.height = 1.25;
    this.collider.groundedOffset = 0.02;
    this.behavior = {
      state: 'idle',
      timer: 1,
      attackCooldown: 0,
      targetMemory: 0,
      lastKnownTarget: new Vector3(),
      moveDirection: new Vector3(),
      patrolOrigin: new Vector3(),
    };
    this.bodyMesh = model.body;
    this.headMesh = model.head;
    this.healthBarGroup = model.healthBarGroup;
    this.healthBarFill = model.healthBarFill;
    this.object.add(model.group);
  }

  initialize({ position, seed = Math.random() } = {}) {
    super.initialize({ position });
    this.state.maxHealth = 45;
    this.state.health = this.state.maxHealth;
    this.seed = seed;
    this.behavior.state = 'idle';
    this.behavior.timer = getRandomRange(IDLE_SECONDS);
    this.behavior.attackCooldown = 0;
    this.behavior.targetMemory = 0;
    this.behavior.lastKnownTarget.copy(this.transform.position);
    this.behavior.moveDirection.set(0, 0, 0);
    this.behavior.patrolOrigin.copy(position ?? this.transform.position);
    this.updatePresentation();

    return this;
  }

  update(deltaTime, context) {
    this.behavior.attackCooldown = Math.max(0, this.behavior.attackCooldown - deltaTime);

    if (this.isAlive()) {
      this.updateBehavior(deltaTime, context);
      this.applyBehaviorMovement(deltaTime);
    }

    super.update(deltaTime, context);
    this.updatePresentation();
  }

  updateBehavior(deltaTime, context) {
    const playerPosition = context.playerPosition;

    this.behavior.targetMemory = Math.max(0, this.behavior.targetMemory - deltaTime);

    if (!playerPosition) {
      this.updatePatrol(deltaTime);
      return;
    }

    const distanceToPlayer = this.transform.position.distanceTo(playerPosition);

    if (distanceToPlayer <= AGGRO_RANGE) {
      this.rememberTarget(playerPosition);
    }

    if (this.shouldFlee(distanceToPlayer)) {
      this.behavior.state = 'flee';
      this.combat.state = ENTITY_COMBAT_STATES.aggro;
      this.behavior.moveDirection
        .copy(this.transform.position)
        .sub(playerPosition)
        .setY(0)
        .normalize();
      return;
    }

    if (distanceToPlayer <= ATTACK_RANGE) {
      this.behavior.state = 'attack';
      this.combat.state = ENTITY_COMBAT_STATES.attack;
      this.behavior.moveDirection.set(0, 0, 0);
      this.attackPlayer(context.damageSystem);
      return;
    }

    if (distanceToPlayer <= AGGRO_RANGE || this.behavior.targetMemory > 0) {
      this.behavior.state = 'chase';
      this.combat.state = ENTITY_COMBAT_STATES.aggro;
      this.behavior.moveDirection
        .copy(this.behavior.lastKnownTarget)
        .sub(this.transform.position)
        .setY(0)
        .normalize();
      return;
    }

    this.updatePatrol(deltaTime);
  }

  rememberTarget(playerPosition) {
    this.behavior.targetMemory = CHASE_MEMORY_SECONDS;
    this.behavior.lastKnownTarget.copy(playerPosition);
  }

  shouldFlee(distanceToPlayer) {
    return this.getHealthPercent() <= FLEE_HEALTH_PERCENT && distanceToPlayer <= AGGRO_RANGE * 0.85;
  }

  updatePatrol(deltaTime) {
    this.combat.state = ENTITY_COMBAT_STATES.idle;
    this.behavior.timer -= deltaTime;

    if (this.behavior.timer > 0) {
      return;
    }

    if (this.behavior.state === 'patrol') {
      this.behavior.state = 'idle';
      this.behavior.timer = getRandomRange(IDLE_SECONDS);
      this.behavior.moveDirection.set(0, 0, 0);
      return;
    }

    this.behavior.state = 'patrol';
    this.behavior.timer = getRandomRange(PATROL_SECONDS);
    this.pickPatrolDirection();
  }

  pickPatrolDirection() {
    const angle = Math.random() * Math.PI * 2;

    this.behavior.moveDirection.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
  }

  applyBehaviorMovement(deltaTime) {
    if (!['chase', 'patrol', 'flee'].includes(this.behavior.state)) {
      return;
    }

    const speed = this.getCurrentSpeed();

    this.transform.position.addScaledVector(this.behavior.moveDirection, speed * deltaTime);

    if (this.behavior.moveDirection.lengthSq() > 0) {
      this.transform.rotation.y = Math.atan2(this.behavior.moveDirection.x, this.behavior.moveDirection.z);
    }
  }

  getCurrentSpeed() {
    if (this.behavior.state === 'chase') {
      return CHASE_SPEED;
    }

    if (this.behavior.state === 'flee') {
      return FLEE_SPEED;
    }

    return PATROL_SPEED;
  }

  attackPlayer(damageSystem) {
    if (!damageSystem || this.behavior.attackCooldown > 0) {
      return;
    }

    const wasApplied = damageSystem.applyPlayerDamage({
      amount: ATTACK_DAMAGE,
      type: DAMAGE_TYPES.attack,
      source: this.id,
    });

    if (wasApplied) {
      this.behavior.attackCooldown = ATTACK_COOLDOWN_SECONDS;
    }
  }

  applyDamage({ amount, type, source, knockback }) {
    const wasApplied = super.applyDamage({ amount, type, source, knockback });

    if (wasApplied) {
      this.behavior.targetMemory = CHASE_MEMORY_SECONDS;
      this.combat.state = this.isAlive() ? ENTITY_COMBAT_STATES.hurt : ENTITY_COMBAT_STATES.death;
    }

    return wasApplied;
  }

  getDeathDrops() {
    return [
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.wildCore, count: 1 },
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.fiber, count: 2 },
    ];
  }

  updatePresentation() {
    const isFlashing = this.combat.damageFlashTimer > 0;
    const isDead = this.combat.state === ENTITY_COMBAT_STATES.death;
    const healthPercent = Math.max(0, this.getHealthPercent());

    this.bodyMesh.material.emissive.set(isFlashing ? '#ffb3a5' : '#000000');
    this.headMesh.material.emissive.set(isFlashing ? '#ffb3a5' : '#000000');
    this.object.scale.setScalar(isDead ? 0.88 : 1);
    this.healthBarGroup.visible = healthPercent < 1 || this.combat.state !== ENTITY_COMBAT_STATES.idle;
    this.healthBarFill.scale.x = Math.max(0.02, healthPercent);
    this.healthBarFill.position.x = -0.45 * (1 - this.healthBarFill.scale.x);
  }
}

function createHostileModel() {
  const group = new Group();
  const body = new Mesh(
    bodyGeometry,
    new MeshStandardMaterial({ color: '#7e3144', roughness: 0.88 }),
  );
  const head = new Mesh(
    headGeometry,
    new MeshStandardMaterial({ color: '#b54b58', roughness: 0.82 }),
  );
  const healthBarGroup = new Group();
  const healthBarBack = new Mesh(
    healthBarBackGeometry,
    new MeshStandardMaterial({ color: '#20151a', roughness: 0.75 }),
  );
  const healthBarFill = new Mesh(
    healthBarFillGeometry,
    new MeshStandardMaterial({ color: '#e85d64', roughness: 0.75 }),
  );

  body.position.y = 0.48;
  head.position.y = 1.08;
  healthBarGroup.position.y = 1.52;
  healthBarBack.position.z = 0.02;
  healthBarFill.position.z = 0.06;
  body.castShadow = true;
  body.receiveShadow = true;
  head.castShadow = true;
  head.receiveShadow = true;
  healthBarGroup.visible = false;
  healthBarGroup.add(healthBarBack, healthBarFill);
  group.add(body, head, healthBarGroup);

  return {
    group,
    body,
    head,
    healthBarGroup,
    healthBarFill,
  };
}

function getRandomRange([minimum, maximum]) {
  return minimum + Math.random() * (maximum - minimum);
}
