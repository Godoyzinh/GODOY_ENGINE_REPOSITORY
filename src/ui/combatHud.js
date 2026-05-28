export class CombatHud {
  constructor({ rootElement, combatSystem, entitySystem }) {
    this.combatSystem = combatSystem;
    this.entitySystem = entitySystem;
    this.element = document.createElement('div');
    this.element.className = 'combat-hud';
    rootElement.appendChild(this.element);
    this.lastRenderedState = '';
  }

  dispose() {
    this.element.remove();
  }

  update() {
    const combatSnapshot = this.combatSystem.getSnapshot();
    const targetSnapshot = this.entitySystem.getFocusedCombatTarget();
    const serializedState = JSON.stringify({ combatSnapshot, targetSnapshot });
    const shouldShow = Boolean(targetSnapshot) ||
      combatSnapshot.cooldownRemaining > 0 ||
      combatSnapshot.damageIndicators.length > 0;

    this.element.classList.toggle('combat-hud--hidden', !shouldShow);

    if (serializedState === this.lastRenderedState) {
      return;
    }

    this.lastRenderedState = serializedState;
    this.element.innerHTML = `
      <div class="combat-hud__cooldown">
        <span class="combat-hud__label">Attack</span>
        <span class="combat-hud__track">
          <span class="combat-hud__fill" style="width: ${Math.round(combatSnapshot.cooldownPercent * 100)}%"></span>
        </span>
      </div>
      ${createTargetMarkup(targetSnapshot)}
      ${createDamageIndicatorMarkup(combatSnapshot.damageIndicators)}
    `;
  }
}

function createTargetMarkup(targetSnapshot) {
  if (!targetSnapshot) {
    return '<div class="combat-hud__target combat-hud__target--empty">No target</div>';
  }

  return `
    <div class="combat-hud__target">
      <span>${targetSnapshot.state}</span>
      <span class="combat-hud__track">
        <span class="combat-hud__fill combat-hud__fill--health" style="width: ${Math.round(targetSnapshot.healthPercent * 100)}%"></span>
      </span>
      <span>${Math.round(targetSnapshot.health)}/${targetSnapshot.maxHealth}</span>
    </div>
  `;
}

function createDamageIndicatorMarkup(damageIndicators) {
  if (damageIndicators.length === 0) {
    return '';
  }

  return `
    <div class="combat-hud__indicators">
      ${damageIndicators.map((indicator) => `
        <span class="combat-hud__indicator">-${indicator.damage}</span>
      `).join('')}
    </div>
  `;
}
