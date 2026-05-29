import { getItemDisplay } from '../items/itemRegistry.js';

export class HotbarUI {
  constructor({ rootElement, inventorySystem }) {
    this.inventorySystem = inventorySystem;
    this.element = document.createElement('div');
    this.element.className = 'hotbar-ui';
    rootElement.appendChild(this.element);
    this.lastRenderedState = '';
    this.unsubscribe = this.inventorySystem.onChange(() => this.update());
    this.update();
  }

  dispose() {
    this.unsubscribe?.();
    this.element.remove();
  }

  update() {
    const snapshot = this.inventorySystem.getSnapshot();
    const serializedState = JSON.stringify(snapshot);

    if (serializedState === this.lastRenderedState) {
      return;
    }

    this.lastRenderedState = serializedState;
    this.element.innerHTML = snapshot.hotbar
      .map((stack, index) => this.createSlotMarkup({ stack, index, selectedSlot: snapshot.selectedSlot }))
      .join('');
  }

  createSlotMarkup({ stack, index, selectedSlot }) {
    const isSelected = index === selectedSlot;
    const slotClassName = `hotbar-slot${isSelected ? ' hotbar-slot--selected' : ''}`;

    if (!stack) {
      return `
        <div class="${slotClassName}">
          <span class="hotbar-slot__key">${index + 1}</span>
        </div>
      `;
    }

    const display = getStackDisplay(stack);
    const countLabel = stack.count > 1 && stack.count !== Infinity ? stack.count : '';

    return `
      <div class="${slotClassName}" style="--slot-color: ${display.color}">
        <span class="hotbar-slot__key">${index + 1}</span>
        <span class="hotbar-slot__swatch"></span>
        <span class="hotbar-slot__name">${escapeHtml(display.shortName)}</span>
        <span class="hotbar-slot__count">${countLabel}</span>
      </div>
    `;
  }
}

function getStackDisplay(stack) {
  const itemDisplay = getItemDisplay(stack);

  return {
    color: itemDisplay.color,
    shortName: getShortName(itemDisplay.shortName ?? itemDisplay.name),
  };
}

function getShortName(name) {
  return name
    .split(' ')
    .map((part) => part.slice(0, 3))
    .join(' ')
    .slice(0, 9);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
