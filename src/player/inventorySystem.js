import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';
import { getBlockDefinition, isPlaceableBlock } from '../world/blockRegistry.js';

const HOTBAR_SIZE = 9;

export class InventorySystem {
  constructor({ playerState, hotbarSize = HOTBAR_SIZE, initialStacks = createDefaultHotbar() }) {
    this.playerState = playerState;
    this.hotbarSize = hotbarSize;
    this.hotbar = normalizeHotbar(initialStacks, hotbarSize);
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

  addItem({ itemType, itemId, count = 1, maxStack = 64, name = null }) {
    const existingStack = this.hotbar.find((stack) => {
      return stack?.itemType === itemType && stack.itemId === itemId && stack.count < stack.maxStack;
    });

    if (existingStack) {
      existingStack.count = Math.min(existingStack.maxStack, existingStack.count + count);
      this.notifyChanged();
      return true;
    }

    const emptySlotIndex = this.hotbar.findIndex((stack) => stack === null);

    if (emptySlotIndex === -1) {
      return false;
    }

    this.hotbar[emptySlotIndex] = {
      itemType,
      itemId,
      count,
      maxStack,
      name: name ?? getInventoryItemName({ itemType, itemId }),
    };
    this.notifyChanged();
    return true;
  }

  getSnapshot() {
    return {
      selectedSlot: this.playerState.selectedSlot,
      selectedItemLabel: this.getSelectedItemLabel(),
      selectedBlockId: this.getSelectedBlockId(),
      hotbar: this.hotbar.map((stack) => (stack ? { ...stack } : null)),
    };
  }
}

function createDefaultHotbar() {
  return [
    createBlockStack(BLOCK_IDS.grass),
    createBlockStack(BLOCK_IDS.dirt),
    createBlockStack(BLOCK_IDS.stone),
    createBlockStack(BLOCK_IDS.sand),
    createBlockStack(BLOCK_IDS.wood),
    createBlockStack(BLOCK_IDS.water),
    createToolStack(TOOL_IDS.pickaxe, 'Pickaxe'),
    createToolStack(TOOL_IDS.axe, 'Axe'),
    createToolStack(TOOL_IDS.hand, 'Hand'),
  ];
}

function createBlockStack(blockId) {
  const blockDefinition = getBlockDefinition(blockId);

  return {
    itemType: 'block',
    itemId: blockId,
    name: blockDefinition.name,
    count: 64,
    maxStack: 64,
  };
}

function createToolStack(toolId, name) {
  return {
    itemType: 'tool',
    itemId: toolId,
    name,
    count: 1,
    maxStack: 1,
  };
}

function normalizeHotbar(stacks, hotbarSize) {
  return Array.from({ length: hotbarSize }, (_, index) => stacks[index] ?? null);
}

function wrapSlot(slotIndex, hotbarSize) {
  return (slotIndex + hotbarSize) % hotbarSize;
}

function getInventoryItemName({ itemType, itemId }) {
  if (itemType === 'block') {
    return getBlockDefinition(itemId).name;
  }

  return String(itemId);
}
