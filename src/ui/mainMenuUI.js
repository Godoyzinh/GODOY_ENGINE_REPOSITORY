import { GRAPHICS_QUALITY, RENDER_DISTANCE_PRESETS } from '../settings/settingsSystem.js';

const DEFAULT_SERVER_URL = 'ws://127.0.0.1:8787';

export class MainMenuUI {
  constructor({
    rootElement,
    settingsSystem,
    networkMode,
    onPlaySolo,
    onJoinMultiplayer,
    onStudioMode,
    onSettingsChanged,
    onMenuVisibilityChanged,
  }) {
    this.rootElement = rootElement;
    this.settingsSystem = settingsSystem;
    this.networkMode = networkMode;
    this.onPlaySolo = onPlaySolo;
    this.onJoinMultiplayer = onJoinMultiplayer;
    this.onStudioMode = onStudioMode;
    this.onSettingsChanged = onSettingsChanged;
    this.onMenuVisibilityChanged = onMenuVisibilityChanged;
    this.isMenuOpen = true;
    this.isJoiningMultiplayer = false;
    this.statusMessage = null;
    this.activePanel = settingsSystem.getSnapshot().firstLaunchComplete ? 'main' : 'onboarding';
    this.element = document.createElement('div');
    this.element.className = 'main-menu';
    this.hintElement = document.createElement('div');
    this.hintElement.className = 'controls-hint';
    rootElement.append(this.element, this.hintElement);

    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
    this.notifyMenuVisibilityChanged();
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
    this.hintElement.remove();
  }

  handleKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (event.code === 'Escape') {
      this.isMenuOpen = !this.isMenuOpen;
      this.activePanel = 'main';
      this.render();
      this.notifyMenuVisibilityChanged();
    } else if (event.code === 'F1') {
      this.isMenuOpen = true;
      this.activePanel = 'controls';
      this.render();
      this.notifyMenuVisibilityChanged();
      event.preventDefault();
    }
  }

  openPanel(panelId) {
    this.activePanel = panelId;
    this.statusMessage = null;
    this.isMenuOpen = true;
    this.render();
    this.notifyMenuVisibilityChanged();
  }

  closeMenu() {
    this.isMenuOpen = false;
    this.render();
    this.notifyMenuVisibilityChanged();
  }

  render() {
    this.element.classList.toggle('main-menu--hidden', !this.isMenuOpen);
    this.hintElement.classList.toggle('controls-hint--hidden', this.isMenuOpen || !this.settingsSystem.getSnapshot().controlsHelp);

    if (!this.isMenuOpen) {
      this.element.innerHTML = '';
      this.renderHint();
      return;
    }

    this.element.innerHTML = `
      <div class="main-menu__backdrop"></div>
      <section class="main-menu__panel">
        <div class="main-menu__header">
          <span class="main-menu__kicker">Alpha Build</span>
          <h1>Godoy Engine</h1>
          <p>Sandbox survival, multiplayer hosting, studio tools, and publishing foundation.</p>
        </div>
        ${this.renderPanel()}
      </section>
    `;
    this.bindPanelEvents();
  }

  renderPanel() {
    if (this.activePanel === 'settings') {
      return this.renderSettingsPanel();
    }

    if (this.activePanel === 'controls') {
      return this.renderControlsPanel();
    }

    if (this.activePanel === 'credits') {
      return this.renderCreditsPanel();
    }

    if (this.activePanel === 'onboarding') {
      return this.renderOnboardingPanel();
    }

    return this.renderMainPanel();
  }

  renderMainPanel() {
    const primaryActionLabel = this.settingsSystem.getSnapshot().firstLaunchComplete ? 'Resume Game' : 'Play Solo';

    return `
      <div class="main-menu__actions">
        <button class="main-menu__button main-menu__button--primary" data-action="play-solo">${primaryActionLabel}</button>
        <button class="main-menu__button" data-action="join-multiplayer" ${this.isJoiningMultiplayer ? 'disabled' : ''}>
          ${this.isJoiningMultiplayer ? 'Checking Server...' : 'Join Multiplayer'}
        </button>
        <button class="main-menu__button" data-action="studio-mode">Studio Mode</button>
        <button class="main-menu__button" data-panel="settings">Settings</button>
        <button class="main-menu__button" data-panel="credits">Credits</button>
      </div>
      <div class="main-menu__status">
        <span>Mode: ${this.networkMode}</span>
        <span>Debug: ${this.settingsSystem.getSnapshot().debugOverlay ? 'on' : 'off'}</span>
      </div>
      ${this.statusMessage ? `<div class="main-menu__notice" role="status">${this.statusMessage}</div>` : ''}
    `;
  }

  renderSettingsPanel() {
    const settings = this.settingsSystem.getSnapshot();

    return `
      <div class="settings-panel">
        ${this.renderSelect({
          id: 'graphicsQuality',
          label: 'Graphics',
          value: settings.graphicsQuality,
          options: Object.values(GRAPHICS_QUALITY),
        })}
        ${this.renderSelect({
          id: 'renderDistancePreset',
          label: 'Render Distance',
          value: settings.renderDistancePreset,
          options: Object.values(RENDER_DISTANCE_PRESETS),
        })}
        <label class="settings-panel__field">
          <span>Audio Volume</span>
          <input data-setting="audioVolume" type="range" min="0" max="1" step="0.05" value="${settings.audioVolume}">
        </label>
        <label class="settings-panel__toggle">
          <input data-setting="controlsHelp" type="checkbox" ${settings.controlsHelp ? 'checked' : ''}>
          <span>Controls Help</span>
        </label>
        <label class="settings-panel__toggle">
          <input data-setting="debugOverlay" type="checkbox" ${settings.debugOverlay ? 'checked' : ''}>
          <span>Debug Overlay</span>
        </label>
        <div class="main-menu__actions main-menu__actions--inline">
          <button class="main-menu__button" data-panel="controls">Controls</button>
          <button class="main-menu__button" data-panel="main">Back</button>
        </div>
      </div>
    `;
  }

  renderControlsPanel() {
    return `
      <div class="controls-panel">
        ${this.renderControlGroup('Gameplay', [
          ['WASD', 'Move relative to camera'],
          ['Mouse', 'Orbit camera / look'],
          ['Left Mouse', 'Mine / attack target block'],
          ['Right Mouse', 'Place selected block'],
          ['1-9 / Wheel', 'Select hotbar slot'],
          ['E / R / Q / T', 'Consume, craft, melee, sleep'],
          ['F3', 'Toggle debug overlay'],
        ])}
        ${this.renderControlGroup('Studio', [
          ['`', 'Toggle Studio'],
          ['F / G', 'Select block / cycle tool'],
          ['Arrows / Page', 'Move selected block'],
          ['B / V / O', 'Cycle prefab, place prefab, publish world'],
          ['Ctrl+Z / Ctrl+Y', 'Undo / redo studio edit'],
        ])}
        <div class="main-menu__actions main-menu__actions--inline">
          <button class="main-menu__button" data-panel="settings">Settings</button>
          <button class="main-menu__button" data-panel="main">Back</button>
        </div>
      </div>
    `;
  }

  renderCreditsPanel() {
    return `
      <div class="credits-panel">
        <p>Creative direction by the player. Architecture and implementation by AI-assisted systems.</p>
        <p>Built with Three.js, Vite, and a modular Godoy Engine runtime.</p>
        <div class="main-menu__actions main-menu__actions--inline">
          <button class="main-menu__button" data-panel="main">Back</button>
        </div>
      </div>
    `;
  }

  renderOnboardingPanel() {
    return `
      <div class="onboarding-panel">
        <ol>
          <li>Explore the procedural world and collect resources.</li>
          <li>Use the hotbar to place blocks and build structures.</li>
          <li>Open Studio Mode when you want creator tools and prefab placement.</li>
          <li>Run the dedicated server before testing multiplayer.</li>
        </ol>
        <div class="main-menu__actions main-menu__actions--inline">
          <button class="main-menu__button main-menu__button--primary" data-action="finish-onboarding">Start Alpha</button>
          <button class="main-menu__button" data-panel="controls">Controls</button>
        </div>
      </div>
    `;
  }

  renderHint() {
    this.hintElement.innerHTML = `
      <span>Esc Menu</span>
      <span>F1 Controls</span>
      <span>Left Mine</span>
      <span>Right Place</span>
      <span>\` Studio</span>
    `;
  }

  renderSelect({ id, label, value, options }) {
    return `
      <label class="settings-panel__field">
        <span>${label}</span>
        <select data-setting="${id}">
          ${options.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${formatOption(option)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  renderControlGroup(title, rows) {
    return `
      <div class="controls-panel__group">
        <h2>${title}</h2>
        ${rows.map(([key, action]) => `
          <div class="controls-panel__row">
            <span>${key}</span>
            <span>${action}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  bindPanelEvents() {
    for (const button of this.element.querySelectorAll('[data-panel]')) {
      button.addEventListener('click', () => this.openPanel(button.dataset.panel));
    }

    this.element.querySelector('[data-action="play-solo"]')?.addEventListener('click', () => {
      this.onPlaySolo?.();
      this.closeMenu();
    });
    this.element.querySelector('[data-action="join-multiplayer"]')?.addEventListener('click', async () => {
      if (this.isJoiningMultiplayer) {
        return;
      }

      this.isJoiningMultiplayer = true;
      this.statusMessage = 'Checking dedicated server...';
      this.render();

      const result = await Promise.resolve(this.onJoinMultiplayer?.(DEFAULT_SERVER_URL));

      if (result?.ok) {
        return;
      }

      this.isJoiningMultiplayer = false;
      this.statusMessage = result?.message ?? 'Multiplayer launch unavailable.';
      this.render();
    });
    this.element.querySelector('[data-action="studio-mode"]')?.addEventListener('click', () => {
      this.onStudioMode?.();
      this.closeMenu();
    });
    this.element.querySelector('[data-action="finish-onboarding"]')?.addEventListener('click', () => {
      this.settingsSystem.markFirstLaunchComplete();
      this.onSettingsChanged?.(this.settingsSystem.getSnapshot());
      this.closeMenu();
    });

    for (const input of this.element.querySelectorAll('[data-setting]')) {
      input.addEventListener('change', () => this.updateSettingFromInput(input));
      input.addEventListener('input', () => {
        if (input.type === 'range') {
          this.updateSettingFromInput(input);
        }
      });
    }
  }

  updateSettingFromInput(input) {
    const key = input.dataset.setting;
    const value = input.type === 'checkbox'
      ? input.checked
      : input.type === 'range'
        ? Number(input.value)
        : input.value;

    const settings = this.settingsSystem.updateSettings({
      [key]: value,
    });

    this.onSettingsChanged?.(settings);
    this.render();
  }

  notifyMenuVisibilityChanged() {
    this.onMenuVisibilityChanged?.(this.isMenuOpen);
  }
}

function formatOption(option) {
  return option
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
