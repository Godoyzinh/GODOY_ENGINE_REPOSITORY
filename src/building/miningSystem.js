import { getBlockDefinition, getBlockDrop } from '../world/blockRegistry.js';

const MINING_COOLDOWN_SECONDS = 0.16;

export class MiningSystem {
  constructor({ toolSystem }) {
    this.toolSystem = toolSystem;
    this.targetKey = null;
    this.targetBlock = null;
    this.progress = 0;
    this.cooldownRemaining = 0;
    this.activeToolId = null;
  }

  update({ deltaTime, targetBlock, isMining, activeTool }) {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);

    if (!targetBlock) {
      this.resetTarget();
      return this.createResult();
    }

    const nextTargetKey = createTargetKey(targetBlock);

    if (nextTargetKey !== this.targetKey) {
      this.targetKey = nextTargetKey;
      this.targetBlock = targetBlock;
      this.progress = 0;
    }

    this.activeToolId = activeTool.id;

    if (!isMining || this.cooldownRemaining > 0) {
      this.progress = 0;
      return this.createResult();
    }

    const blockDefinition = getBlockDefinition(targetBlock.blockId);
    const miningDuration = this.toolSystem.getMiningDuration({
      toolId: activeTool.id,
      blockDefinition,
    });

    this.progress = Math.min(1, this.progress + deltaTime / miningDuration);

    if (this.progress < 1) {
      return this.createResult();
    }

    const completedTarget = this.targetBlock;
    const dropId = getBlockDrop(completedTarget.blockId);

    this.cooldownRemaining = MINING_COOLDOWN_SECONDS;
    this.progress = 0;
    this.targetKey = null;
    this.targetBlock = null;

    return this.createResult({
      completed: true,
      targetBlock: completedTarget,
      dropId,
      blockDefinition,
    });
  }

  getSnapshot() {
    const blockDefinition = this.targetBlock ? getBlockDefinition(this.targetBlock.blockId) : null;

    return {
      progress: this.progress,
      cooldownRemaining: this.cooldownRemaining,
      targetName: blockDefinition?.name ?? 'None',
      activeToolId: this.activeToolId,
    };
  }

  resetTarget() {
    this.targetKey = null;
    this.targetBlock = null;
    this.progress = 0;
  }

  createResult({ completed = false, targetBlock = null, dropId = null, blockDefinition = null } = {}) {
    return {
      completed,
      targetBlock,
      dropId,
      blockDefinition,
      snapshot: this.getSnapshot(),
    };
  }
}

function createTargetKey(targetBlock) {
  return `${targetBlock.worldX},${targetBlock.y},${targetBlock.worldZ},${targetBlock.blockId}`;
}
