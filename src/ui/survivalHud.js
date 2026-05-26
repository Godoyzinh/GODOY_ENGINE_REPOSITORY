export class SurvivalHud {
  constructor({ rootElement, survivalSystem }) {
    this.survivalSystem = survivalSystem;
    this.element = document.createElement('div');
    this.element.className = 'survival-hud';
    rootElement.appendChild(this.element);
    this.lastRenderedState = '';
  }

  dispose() {
    this.element.remove();
  }

  update() {
    const snapshot = this.survivalSystem.getSnapshot();
    const serializedState = JSON.stringify(snapshot);

    if (serializedState === this.lastRenderedState) {
      return;
    }

    this.lastRenderedState = serializedState;
    this.element.innerHTML = `
      ${createHeartsMarkup(snapshot)}
      ${createBarMarkup({
        className: 'survival-hud__bar--hunger',
        label: 'Food',
        value: snapshot.hunger,
        maximum: snapshot.maxHunger,
      })}
      ${createBarMarkup({
        className: 'survival-hud__bar--stamina',
        label: 'Stam',
        value: snapshot.stamina,
        maximum: snapshot.maxStamina,
      })}
    `;
  }
}

function createHeartsMarkup(snapshot) {
  const heartCount = 10;
  const activeHearts = Math.ceil((snapshot.health / snapshot.maxHealth) * heartCount);
  const heartsMarkup = Array.from({ length: heartCount }, (_, index) => {
    const className = index < activeHearts ? 'survival-hud__heart survival-hud__heart--filled' : 'survival-hud__heart';

    return `<span class="${className}"></span>`;
  }).join('');

  return `
    <div class="survival-hud__hearts-row">
      <span class="survival-hud__label">HP</span>
      <span class="survival-hud__hearts">${heartsMarkup}</span>
      <span class="survival-hud__value">${Math.round(snapshot.health)}</span>
    </div>
  `;
}

function createBarMarkup({ className, label, value, maximum }) {
  const percent = Math.round((value / maximum) * 100);

  return `
    <div class="survival-hud__bar ${className}">
      <span class="survival-hud__label">${label}</span>
      <span class="survival-hud__track">
        <span class="survival-hud__fill" style="width: ${percent}%"></span>
      </span>
      <span class="survival-hud__value">${Math.round(value)}</span>
    </div>
  `;
}
