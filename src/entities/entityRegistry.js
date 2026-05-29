export class EntityRegistry {
  constructor({ group }) {
    this.group = group;
    this.entities = new Map();
    this.pools = new Map();
  }

  acquire(EntityClass, options) {
    const type = options.type;
    const pool = this.getPool(type);
    const entity = pool.pop() ?? new EntityClass();

    entity.initialize(options);
    this.register(entity);

    return entity;
  }

  register(entity) {
    this.entities.set(entity.id, entity);

    if (!this.group.children.includes(entity.object)) {
      this.group.add(entity.object);
    }
  }

  release(entity) {
    this.entities.delete(entity.id);
    this.group.remove(entity.object);
    entity.prepareForReuse();
    this.getPool(entity.type).push(entity);
  }

  updateActivation({ focusPosition, activationDistance, visibleDistance }) {
    for (const entity of this.entities.values()) {
      const distance = entity.getDistanceTo(focusPosition);

      entity.setSimulationActive(distance <= activationDistance);
      entity.setVisible(distance <= visibleDistance);
    }
  }

  getEntities() {
    return [...this.entities.values()];
  }

  getActiveEntities() {
    return this.getEntities().filter((entity) => entity.state.isActive);
  }

  getCountByType(type) {
    return this.getEntities().filter((entity) => entity.type === type).length;
  }

  getPooledCount() {
    return [...this.pools.values()].reduce((total, pool) => total + pool.length, 0);
  }

  getPool(type) {
    if (!this.pools.has(type)) {
      this.pools.set(type, []);
    }

    return this.pools.get(type);
  }
}
