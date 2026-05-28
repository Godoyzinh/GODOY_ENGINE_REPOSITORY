export const TOOL_IDS = {
  hand: 'hand',
  pickaxe: 'pickaxe',
  axe: 'axe',
  ironPickaxe: 'ironPickaxe',
  ironAxe: 'ironAxe',
};

export const TOOL_DEFINITIONS = {
  [TOOL_IDS.hand]: {
    id: TOOL_IDS.hand,
    name: 'Hand',
    category: 'hand',
    tier: 'starter',
    miningMultiplier: 1,
    preferredToolTypes: ['hand'],
  },
  [TOOL_IDS.pickaxe]: {
    id: TOOL_IDS.pickaxe,
    name: 'Pickaxe',
    category: 'pickaxe',
    tier: 'stone',
    miningMultiplier: 2.8,
    preferredToolTypes: ['pickaxe'],
  },
  [TOOL_IDS.axe]: {
    id: TOOL_IDS.axe,
    name: 'Axe',
    category: 'axe',
    tier: 'wood',
    miningMultiplier: 2.4,
    preferredToolTypes: ['axe'],
  },
  [TOOL_IDS.ironPickaxe]: {
    id: TOOL_IDS.ironPickaxe,
    name: 'Iron Pickaxe',
    category: 'pickaxe',
    tier: 'iron',
    miningMultiplier: 4.1,
    preferredToolTypes: ['pickaxe'],
  },
  [TOOL_IDS.ironAxe]: {
    id: TOOL_IDS.ironAxe,
    name: 'Iron Axe',
    category: 'axe',
    tier: 'iron',
    miningMultiplier: 3.6,
    preferredToolTypes: ['axe'],
  },
};

const WRONG_TOOL_MULTIPLIER = 0.55;
const BASE_MINING_SECONDS = 0.58;
const MIN_MINING_SECONDS = 0.12;

export class ToolSystem {
  getToolDefinition(toolId = TOOL_IDS.hand) {
    return TOOL_DEFINITIONS[toolId] ?? TOOL_DEFINITIONS[TOOL_IDS.hand];
  }

  getToolFromInventoryStack(stack) {
    if (stack?.itemType === 'tool') {
      return this.getToolDefinition(stack.itemId);
    }

    return this.getToolDefinition(TOOL_IDS.hand);
  }

  getMiningMultiplier({ toolId, blockDefinition }) {
    const tool = this.getToolDefinition(toolId);

    if (!blockDefinition || blockDefinition.id === 0) {
      return 0;
    }

    if (tool.preferredToolTypes.includes(blockDefinition.toolType)) {
      return tool.miningMultiplier;
    }

    if (blockDefinition.toolType === TOOL_IDS.hand) {
      return Math.max(1, tool.miningMultiplier * 0.45);
    }

    return WRONG_TOOL_MULTIPLIER;
  }

  getMiningDuration({ toolId, blockDefinition }) {
    if (!blockDefinition || blockDefinition.hardness <= 0) {
      return MIN_MINING_SECONDS;
    }

    const multiplier = this.getMiningMultiplier({ toolId, blockDefinition });
    const rawDuration = (blockDefinition.hardness * BASE_MINING_SECONDS) / Math.max(multiplier, 0.1);

    return Math.max(MIN_MINING_SECONDS, rawDuration);
  }
}
