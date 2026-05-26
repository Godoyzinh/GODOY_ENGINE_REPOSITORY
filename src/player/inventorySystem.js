import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';
import { getBlockDefinition, isPlaceableBlock } from '../world/blockRegistry.js';
import {
  createItemStack,
  getItemDefinition,
  ITEM_IDS,
  ITEM_TYPES,
} from '../items/itemRegistry.js';

const HOTBAR_SIZE = 9;
const BACKPACK_SIZE = 18;

export class InventorySystem {
  constructor({
    playerState,
    hotbarSize = HOTBAR_SIZE,
    backpackSize = BACKPACK_SIZE,
    initialStacks = createDefaultHotbar(),
  }) {
    this.playerState = playerState;
    this.hotbarSize = hotbarSize;
    this.backpackSize = backpackSize;
    this.hotbar = normalizeHotbar(initialStacks, hotbarSize);
    this.backpack = [];
    this.listeners = new Set();

    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    window.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
  }

  dispose() {
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  onChange(listener) {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  notifyChanged() {
    for (const listener of this.listeners) {
      listener(this.getSnapshot());
    }
  }

  handleWheel(event) {
    if (event.ctrlKey || Math.abs(event.deltaY) < 1) {
      return;
    }

    event.preventDefault();
    this.cycleSelectedSlot(event.deltaY > 0 ? 1 : -1);
  }

  handleKeyDown(event) {
    if (!event.code.startsWith('Digit')) {
      return;
    }

    const slotNumber = Number(event.code.replace('Digit', ''));

    if (slotNumber >= 1 && slotNumber <= this.hotbarSize) {
      this.selectSlot(slotNumber - 1);
    }
  }

  selectSlot(slotIndex) {
    const wrappedSlot = wrapSlot(slotIndex, this.hotbarSize);

    if (wrappedSlot === this.playerState.selectedSlot) {
      return;
    }

    this.playerState.setSelectedSlot(wrappedSlot);
    this.notifyChanged();
  }

  cycleSelectedSlot(direction) {
    this.selectSlot(this.playerState.selectedSlot + direction);
  }

  getSelectedStack() {
    return this.hotbar[this.playerState.selectedSlot] ?? null;
  }

  getSelectedBlockId() {
    const selectedStack = this.getSelectedStack();

    if (selectedStack?.itemType !== 'block' || !isPlaceableBlock(selectedStack.itemId)) {
      return null;
    }

    return selectedStack.itemId;
  }

  getSelectedItemLabel() {
    const selectedStack = this.getSelectedStack();

    if (!selectedStack) {
      return 'Empty';
    }

    if (selectedStack.itemType === 'block') {
      return getBlockDefinition(selectedStack.itemId).name;
    }

    return selectedStack.name;
  }

  consumeSelected(count = 1) {
    const selectedStack = this.getSelectedStack();

    if (!selectedStack || selectedStack.count === Infinity) {
      return true;
    }

    if (selectedStack.count < count) {
      return false;
    }

    selectedStack.count -= count;

    if (selectedStack.count <= 0) {
      this.hotbar[this.playerState.selectedSlot] = null;
    }

    this.notifyChanged();
    return true;
  }

  addItem({ itemType, itemId, count = 1, maxStack = null, name = null }) {
    const incomingStack = createItemStack({ itemType, itemId, count, maxStack, name });

    if (!this.canAcceptItem(incomingStack)) {
      return false;
    }

    if (!Number.isFinite(incomingStack.count)) {
      this.addInfiniteStack(incomingStack);
      this.notifyChanged();
      return true;
    }

    let remainingCount = incomingStack.count;

    for (const stack of this.getAllStacks()) {
      if (!isMatchingStack(stack, incomingStack)) {
        continue;
      }

      const acceptedCount = Math.min(remainingCount, stack.maxStack - stack.count);
      stack.count += acceptedCount;
      remainingCount -= acceptedCount;

      if (remainingCount <= 0) {
        this.notifyChanged();
        return true;
      }
    }

    while (remainingCount > 0) {
      const storedCount = Math.min(remainingCount, incomingStack.maxStack);
      this.storeNewStack({
        ...incomingStack,
        count: storedCount,
      });
      remainingCount -= storedCount;
    }

    this.notifyChanged();
    return true;
  }

  canAcceptItem({ itemType, itemId, count = 1, maxStack = null, name = null }, { plannedRemovals = [] } = {}) {
    const incomingStack = createItemStack({ itemType, itemId, count, maxStack, name });
    const projectedStorage = this.createProjectedStorage(plannedRemovals);
    const projectedStacks = [...projectedStorage.hotbar, ...projectedStorage.backpack];
    const availableStackSpace = projectedStacks.reduce((availableCount, stack) => {
      if (!isMatchingStack(stack, incomingStack)) {
        return availableCount;
      }

      return availableCount + Math.max(0, stack.maxStack - stack.count);
    }, 0);
    const emptySlotCount = projectedStorage.hotbar.filter((stack) => stack === null).length +
      Math.max(0, this.backpackSize - projectedStorage.backpack.length);

    if (!Number.isFinite(incomingStack.count)) {
      return availableStackSpace > 0 || emptySlotCount > 0;
    }

    return availableStackSpace + emptySlotCount * incomingStack.maxStack >= incomingStack.count;
  }

  removeItem({ itemType, itemId, count = 1 }) {
    if (this.getItemCount({ itemType, itemId }) < count) {
      return false;
    }

    let remainingCount = count;

    for (const storage of [this.hotbar, this.backpack]) {
      for (const stack of storage) {
        if (!stack || stack.itemType !== itemType || stack.itemId !== itemId) {
          continue;
        }

        const removedCount = Math.min(stack.count, remainingCount);
        stack.count -= removedCount;
        remainingCount -= removedCount;

        if (remainingCount <= 0) {
          break;
        }
      }

      if (remainingCount <= 0) {
        break;
      }
    }

    this.hotbar = this.hotbar.map((stack) => (stack && stack.count > 0 ? stack : null));
    this.backpack = this.backpack.filter((stack) => stack.count > 0);
    this.notifyChanged();

    return remainingCount === 0;
  }

  getItemCount({ itemType, itemId }) {
    return this.getAllStacks().reduce((total, stack) => {
      if (!stack || stack.itemType !== itemType || stack.itemId !== itemId) {
        return total;
      }

      return total + stack.count;
    }, 0);
  }

  getSnapshot() {
    return {
      selectedSlot: this.playerState.selectedSlot,
      selectedItemLabel: this.getSelectedItemLabel(),
      selectedBlockId: this.getSelectedBlockId(),
      hotbar: this.hotbar.map((stack) => (stack ? { ...stack } : null)),
      backpack: this.backpack.map((stack) => ({ ...stack })),
    };
  }

  getAllStacks() {
    return [...this.hotbar, ...this.backpack];
  }

  createProjectedStorage(plannedRemovals) {
    const projectedStorage = {
      hotbar: this.hotbar.map((stack) => (stack ? { ...stack } : null)),
      backpack: this.backpack.map((stack) => ({ ...stack })),
    };

    for (const removal of plannedRemovals) {
      removeFromProjectedStorage(projectedStorage, removal);
    }

    projectedStorage.hotbar = projectedStorage.hotbar.map((stack) => (stack && stack.count > 0 ? stack : null));
    projectedStorage.backpack = projectedStorage.backpack.filter((stack) => stack.count > 0);

    return projectedStorage;
  }

  storeNewStack(stack) {
    const emptySlotIndex = this.hotbar.findIndex((candidateStack) => candidateStack === null);
    const stackToStore = createItemStack(stack);

    if (emptySlotIndex !== -1) {
      this.hotbar[emptySlotIndex] = stackToStore;
      return;
    }

    this.backpack.push(stackToStore);
  }

  addInfiniteStack(stack) {
    const existingStack = this.getAllStacks().find((candidateStack) => isMatchingStack(candidateStack, stack));

    if (existingStack) {
      existingStack.count = Infinity;
      return;
    }

    this.storeNewStack(stack);
  }
}

function createDefaultHotbar() {
  return [
    createBlockStack(BLOCK_IDS.grass),
    createBlockStack(BLOCK_IDS.dirt),
    createBlockStack(BLOCK_IDS.stone),
    createBlockStack(BLOCK_IDS.sand),
    createBlockStack(BLOCK_IDS.wood),
    createConsumableStack(ITEM_IDS.berries, 6),
    createToolStack(TOOL_IDS.pickaxe, 'Pickaxe'),
    createToolStack(TOOL_IDS.axe, 'Axe'),
    createToolStack(TOOL_IDS.hand, 'Hand'),
  ];
}

function createBlockStack(blockId) {
  const blockDefinition = getBlockDefinition(blockId);

  return createItemStack({
    itemType: ITEM_TYPES.block,
    itemId: blockId,
    name: blockDefinition.name,
    count: 32,
  });
}

function createToolStack(toolId, name) {
  return createItemStack({
    itemType: ITEM_TYPES.tool,
    itemId: toolId,
    name,
    count: 1,
  });
}

function createConsumableStack(itemId, count) {
  return createItemStack({
    itemType: ITEM_TYPES.consumable,
    itemId,
    count,
  });
}

function normalizeHotbar(stacks, hotbarSize) {
  return Array.from({ length: hotbarSize }, (_, index) => stacks[index] ?? null);
}

function wrapSlot(slotIndex, hotbarSize) {
  return (slotIndex + hotbarSize) % hotbarSize;
}

function isMatchingStack(stack, incomingStack) {
  return Boolean(stack) &&
    stack.itemType === incomingStack.itemType &&
    stack.itemId === incomingStack.itemId &&
    stack.count < stack.maxStack;
}

function removeFromProjectedStorage(projectedStorage, { itemType, itemId, count }) {
  let remainingCount = count;

  for (const storage of [projectedStorage.hotbar, projectedStorage.backpack]) {
    for (const stack of storage) {
      if (!stack || stack.itemType !== itemType || stack.itemId !== itemId) {
        continue;
      }

      const removedCount = Math.min(stack.count, remainingCount);
      stack.count -= removedCount;
      remainingCount -= removedCount;

      if (remainingCount <= 0) {
        break;
      }
    }

    if (remainingCount <= 0) {
      break;
    }
  }
}

function getInventoryItemName({ itemType, itemId }) {
  if (itemType === ITEM_TYPES.block) {
    return getBlockDefinition(itemId).name;
  }

  return getItemDefinition({ itemType, itemId }).name;
}
