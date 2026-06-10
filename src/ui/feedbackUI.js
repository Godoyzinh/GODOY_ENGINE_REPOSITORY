import {
  AUTONOMOUS_INVENTORY_PROFILE_OPTIONS,
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
} from '../diagnostics/autonomousInventoryProfiles.js';
import { getPlaytestModes } from '../diagnostics/playtestSimulationModes.js';

export class FeedbackUI {
  constructor({
    rootElement,
    reportSystem,
    getRuntimeSnapshot,
    getAutoTestSnapshot = null,
    getAiMemorySnapshot = null,
    onRunAutoTest = null,
    onRunNeuralTraining = null,
    onStopAutoTest = null,
    runtimeConfig = null,
    onUiAction = null,
  }) {
    this.reportSystem = reportSystem;
    this.getRuntimeSnapshot = getRuntimeSnapshot;
    this.getAutoTestSnapshot = getAutoTestSnapshot;
    this.getAiMemorySnapshot = getAiMemorySnapshot;
    this.onRunAutoTest = onRunAutoTest;
    this.onRunNeuralTraining = onRunNeuralTraining;
    this.onStopAutoTest = onStopAutoTest;
    this.runtimeConfig = runtimeConfig;
    this.onUiAction = onUiAction;
    this.isOpen = false;
    this.lastReport = null;
    this.autoTestSnapshot = getAutoTestSnapshot?.() ?? null;
    this.selectedAutoTestMode = 'quick';
    this.selectedInventoryProfile = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID;
    this.neuralPopulationSize = 8;
    this.neuralGenerations = 2;
    this.neuralEpisodeDuration = 60;
    this.neuralMutationRate = 0.08;
    this.neuralUseChampion = true;
    this.neuralShowClones = false;
    this.neuralHeadlessMode = true;
    this.statusMessage = 'Reports stay local until you copy or download them.';
    this.element = document.createElement('div');
    this.element.className = 'feedback-ui';
    rootElement.appendChild(this.element);
    this.render();
  }

  dispose() {
    this.element.remove();
  }

  render() {
    this.element.innerHTML = `
      <button class="feedback-ui__toggle" type="button" data-action="toggle-feedback">
        Feedback
      </button>
      <section class="feedback-ui__panel ${this.isOpen ? '' : 'feedback-ui__panel--hidden'}" aria-label="Feedback and AI report">
        <div class="feedback-ui__header">
          <span>AI Session Report</span>
          <button type="button" data-action="close-feedback" aria-label="Close feedback panel">Close</button>
        </div>
        <p>${escapeHtml(this.statusMessage)}</p>
        <div class="feedback-ui__stats">
          ${this.renderReportStats()}
        </div>
        ${this.renderAutoTestControls()}
        ${this.renderAiMemory()}
        <div class="feedback-ui__actions">
          <button type="button" data-action="generate-report">Generate</button>
          <button type="button" data-action="copy-report" ${this.lastReport ? '' : 'disabled'}>Copy JSON</button>
          <button type="button" data-action="download-report" ${this.lastReport ? '' : 'disabled'}>Download JSON</button>
        </div>
        ${this.renderFeedbackLink()}
      </section>
    `;
    this.bindEvents();
  }

  renderReportStats() {
    if (!this.lastReport) {
      return `
        <span>Issues: 0</span>
        <span>AI tasks: 0</span>
      `;
    }

    return `
      <span>Issues: ${this.lastReport.issues.length}</span>
      <span>AI tasks: ${this.lastReport.aiTasks.length}</span>
      <span>FPS: ${this.lastReport.telemetry.fps.average}</span>
    `;
  }

  renderAutoTestControls() {
    if (!this.onRunAutoTest) {
      return '';
    }

    const snapshot = this.autoTestSnapshot;
    const isRunning = snapshot?.status === 'running';
    const progressPercent = Math.round((snapshot?.progress ?? 0) * 100);
    const statusLabel = snapshot
      ? `${snapshot.mode.label}: ${snapshot.status} ${progressPercent}%`
      : 'Quick Smoke: idle';

    return `
      <div class="feedback-ui__auto-test">
        <div class="feedback-ui__auto-test-row">
          <span>${escapeHtml(statusLabel)}</span>
          <select data-action="auto-test-mode" ${isRunning ? 'disabled' : ''}>
            ${getPlaytestModes().map((mode) => `
              <option value="${escapeAttribute(mode.id)}" ${this.selectedAutoTestMode === mode.id ? 'selected' : ''}>
                ${escapeHtml(formatModeOption(mode))}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="feedback-ui__auto-test-row">
          <span>Starting Inventory</span>
          <select data-action="auto-test-inventory" ${isRunning ? 'disabled' : ''}>
            ${AUTONOMOUS_INVENTORY_PROFILE_OPTIONS.map((profile) => `
              <option value="${escapeAttribute(profile.id)}" ${this.selectedInventoryProfile === profile.id ? 'selected' : ''}>
                ${escapeHtml(profile.label)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="feedback-ui__progress" aria-hidden="true">
          <span style="width: ${progressPercent}%"></span>
        </div>
        ${this.renderAiGoalOverlay(snapshot?.planner)}
        ${this.renderNeuralAgentStatus(snapshot?.neuralAgent)}
        <button type="button" data-action="run-auto-test" ${isRunning ? 'disabled' : ''}>
          ${isRunning ? 'Running Auto Test' : 'Run Auto Test'}
        </button>
        ${this.renderNeuralEvolutionControls(snapshot?.neuralEvolution, isRunning)}
      </div>
    `;
  }

  renderNeuralEvolutionControls(neuralEvolution, isRunning) {
    const disabled = isRunning ? 'disabled' : '';

    return `
      <div class="feedback-ui__ai-plan" aria-label="Neural evolution controls">
        <div class="feedback-ui__ai-plan-title">Neural Evolution</div>
        ${this.renderAiPlanRow('Generation', neuralEvolution?.currentGeneration ?? 0)}
        ${this.renderAiPlanRow('Best Fitness', neuralEvolution?.bestFitness ?? 0)}
        ${this.renderAiPlanRow('Average Fitness', neuralEvolution?.averageFitness ?? 0)}
        ${this.renderAiPlanRow('Champion Fitness', neuralEvolution?.championFitness ?? 0)}
        ${this.renderAiPlanRow('Best Goal', neuralEvolution?.bestGoalReached ?? 'none')}
        ${this.renderAiPlanRow('Wood', neuralEvolution?.woodCollectedByBest ?? 0)}
        ${this.renderAiPlanRow('Deaths', neuralEvolution?.deathsByBest ?? 0)}
        ${this.renderAiPlanRow('Blocked', neuralEvolution?.blockedActionsByBest ?? 0)}
        <div class="feedback-ui__auto-test-row">
          <span>Population</span>
          <input data-action="neural-population" type="number" min="1" max="128" value="${this.neuralPopulationSize}" ${disabled}>
        </div>
        <div class="feedback-ui__auto-test-row">
          <span>Generations</span>
          <input data-action="neural-generations" type="number" min="1" max="50" value="${this.neuralGenerations}" ${disabled}>
        </div>
        <div class="feedback-ui__auto-test-row">
          <span>Episode</span>
          <input data-action="neural-duration" type="number" min="10" max="1800" value="${this.neuralEpisodeDuration}" ${disabled}>
        </div>
        <div class="feedback-ui__auto-test-row">
          <span>Mutation</span>
          <input data-action="neural-mutation" type="number" min="0" max="1" step="0.01" value="${this.neuralMutationRate}" ${disabled}>
        </div>
        <label class="feedback-ui__note">
          <input data-action="neural-use-champion" type="checkbox" ${this.neuralUseChampion ? 'checked' : ''} ${disabled}>
          Use champion
        </label>
        <label class="feedback-ui__note">
          <input data-action="neural-show-clones" type="checkbox" ${this.neuralShowClones ? 'checked' : ''} ${disabled}>
          Visual Clone Arena
        </label>
        <label class="feedback-ui__note">
          <input data-action="neural-headless" type="checkbox" ${this.neuralHeadlessMode ? 'checked' : ''} ${disabled}>
          Headless mode
        </label>
        <div class="feedback-ui__actions">
          <button type="button" data-action="run-neural-quick" ${disabled}>Run Neural Quick 60s</button>
          <button type="button" data-action="run-neural-standard" ${disabled}>Run Neural Standard 5m</button>
          <button type="button" data-action="run-neural-evolution" ${disabled}>Run Neural Evolution 30m</button>
          <button type="button" data-action="run-neural-training" ${disabled}>Train Population</button>
          <button type="button" data-action="run-neural-arena" ${disabled}>Visual Clone Arena</button>
          <button type="button" data-action="stop-neural-training" ${isRunning ? '' : 'disabled'}>Stop Training</button>
          <button type="button" data-action="save-neural-champion">Save Champion</button>
          <button type="button" data-action="reset-neural-champion">Reset Champion</button>
          <button type="button" data-action="export-neural-champion">Export Champion JSON</button>
          <button type="button" data-action="import-neural-champion">Import Champion JSON</button>
        </div>
      </div>
    `;
  }

  renderNeuralAgentStatus(neuralAgent) {
    if (!neuralAgent?.enabled) {
      return '';
    }

    return `
      <div class="feedback-ui__ai-plan" aria-label="Neural survival agent">
        <div class="feedback-ui__ai-plan-title">Neural Agent</div>
        ${this.renderAiPlanRow('Generation', neuralAgent.generation ?? 0)}
        ${this.renderAiPlanRow('Fitness', neuralAgent.currentFitness ?? 0)}
        ${this.renderAiPlanRow('Action', neuralAgent.selectedAction ?? 'none')}
        ${this.renderAiPlanRow('Reason', neuralAgent.neuralDecisionReason ?? 'planner fallback')}
      </div>
    `;
  }

  renderAiGoalOverlay(plannerSnapshot) {
    if (!plannerSnapshot) {
      return '';
    }

    const goalProgressPercent = Math.round((plannerSnapshot.progress ?? 0) * 100);

    return `
      <div class="feedback-ui__ai-plan" aria-label="AI survival plan">
        <div class="feedback-ui__ai-plan-title">AI Plan</div>
        ${this.renderAiPlanRow('Current Goal', plannerSnapshot.currentGoal)}
        ${this.renderAiPlanRow('Current Subgoal', plannerSnapshot.currentSubgoal)}
        ${this.renderAiPlanRow('Reason', plannerSnapshot.reason)}
        ${this.renderAiPlanRow('Progress', `${goalProgressPercent}%`)}
        ${this.renderAiPlanRow('Target', plannerSnapshot.target)}
      </div>
    `;
  }

  renderAiPlanRow(label, value) {
    return `
      <div class="feedback-ui__ai-plan-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value ?? 'None')}</strong>
      </div>
    `;
  }

  renderAiMemory() {
    const memorySnapshot = this.getAiMemorySnapshot?.() ?? this.lastReport?.runtimeStats?.simulation?.aiMemory ?? null;

    if (!memorySnapshot) {
      return '';
    }

    const knowledge = (memorySnapshot.learnedKnowledge ?? []).slice(-4);
    const successfulStrategies = (memorySnapshot.successfulStrategies ?? memorySnapshot.strategies?.successful ?? []).slice(-3);
    const failedStrategies = (memorySnapshot.failedStrategies ?? memorySnapshot.strategies?.failed ?? []).slice(-3);
    const suggestions = (memorySnapshot.optimizationSuggestions ?? []).slice(-3);
    const knownStructures = (memorySnapshot.knownStructures ?? []).slice(0, 3);
    const bestBiome = memorySnapshot.bestWoodBiome ?? memorySnapshot.strategyHints?.preferredWoodBiome ?? 'unknown';
    const averageIronTime = Number(memorySnapshot.averageIronTime ?? 0);
    const tier = memorySnapshot.lastRun?.progressionTierReached ?? 'none';

    return `
      <div class="feedback-ui__ai-memory" aria-label="AI learned knowledge">
        <div class="feedback-ui__ai-plan-title">AI Memory</div>
        ${this.renderAiPlanRow('Runs Learned', memorySnapshot.runs ?? 0)}
        ${this.renderAiPlanRow('Best Biome', bestBiome)}
        ${this.renderAiPlanRow('Avg Iron', averageIronTime > 0 ? `${averageIronTime}s` : 'unknown')}
        ${this.renderAiPlanRow('Structures', knownStructures.length > 0 ? knownStructures.map((structure) => structure.type ?? structure.id).join(', ') : 'none')}
        ${this.renderAiPlanRow('Last Tier', tier)}
        ${knowledge.length > 0 ? `
          <ul class="feedback-ui__knowledge-list">
            ${knowledge.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
          </ul>
        ` : '<span class="feedback-ui__note">No learned knowledge yet. Run an auto test to train local memory.</span>'}
        ${successfulStrategies.length > 0 ? this.renderMemoryList('Learned Strategies', successfulStrategies.map((strategy) => strategy.strategy ?? strategy.goalName)) : ''}
        ${failedStrategies.length > 0 ? this.renderMemoryList('Failed Strategies', failedStrategies.map((strategy) => strategy.reason ?? strategy.strategy)) : ''}
        ${suggestions.length > 0 ? this.renderMemoryList('Suggestions', suggestions) : ''}
      </div>
    `;
  }

  renderMemoryList(title, entries) {
    return `
      <div class="feedback-ui__ai-plan-title">${escapeHtml(title)}</div>
      <ul class="feedback-ui__knowledge-list">
        ${entries.map((entry) => `<li>${escapeHtml(entry ?? 'Unknown')}</li>`).join('')}
      </ul>
    `;
  }

  renderFeedbackLink() {
    if (!this.runtimeConfig?.feedbackUrl) {
      return '<span class="feedback-ui__note">External feedback link not configured yet.</span>';
    }

    return `
      <a class="feedback-ui__link" href="${escapeAttribute(this.runtimeConfig.feedbackUrl)}" target="_blank" rel="noreferrer">
        Open feedback form
      </a>
    `;
  }

  bindEvents() {
    this.element.querySelector('[data-action="toggle-feedback"]')?.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      this.onUiAction?.('feedback-toggle');
      this.render();
    });
    this.element.querySelector('[data-action="close-feedback"]')?.addEventListener('click', () => {
      this.isOpen = false;
      this.onUiAction?.('feedback-close');
      this.render();
    });
    this.element.querySelector('[data-action="generate-report"]')?.addEventListener('click', () => {
      this.generateReport();
    });
    this.element.querySelector('[data-action="copy-report"]')?.addEventListener('click', () => {
      this.copyReportToClipboard();
    });
    this.element.querySelector('[data-action="download-report"]')?.addEventListener('click', () => {
      this.downloadReport();
    });
    this.element.querySelector('[data-action="auto-test-mode"]')?.addEventListener('change', (event) => {
      this.selectedAutoTestMode = event.target.value;
    });
    this.element.querySelector('[data-action="auto-test-inventory"]')?.addEventListener('change', (event) => {
      this.selectedInventoryProfile = event.target.value;
    });
    this.bindNeuralControls();
    this.element.querySelector('[data-action="run-auto-test"]')?.addEventListener('click', () => {
      this.runAutoTest();
    });
    this.element.querySelector('[data-action="run-neural-training"]')?.addEventListener('click', () => {
      this.runNeuralTraining({ modeId: this.selectedAutoTestMode, trainPopulation: true });
    });
    this.element.querySelector('[data-action="run-neural-quick"]')?.addEventListener('click', () => {
      this.runNeuralTraining({ modeId: 'quick', episodeDuration: 60 });
    });
    this.element.querySelector('[data-action="run-neural-standard"]')?.addEventListener('click', () => {
      this.runNeuralTraining({ modeId: 'standard', episodeDuration: 5 * 60 });
    });
    this.element.querySelector('[data-action="run-neural-evolution"]')?.addEventListener('click', () => {
      this.runNeuralTraining({ modeId: 'evolution', episodeDuration: 30 * 60 });
    });
    this.element.querySelector('[data-action="run-neural-arena"]')?.addEventListener('click', () => {
      this.neuralShowClones = true;
      this.runNeuralTraining({ modeId: this.selectedAutoTestMode, showClones: true });
    });
    this.element.querySelector('[data-action="stop-neural-training"]')?.addEventListener('click', () => {
      this.stopNeuralTraining();
    });
    this.element.querySelector('[data-action="save-neural-champion"]')?.addEventListener('click', () => {
      this.statusMessage = 'Champion is saved automatically after valid neural runs.';
      this.render();
    });
    this.element.querySelector('[data-action="reset-neural-champion"]')?.addEventListener('click', () => {
      this.resetNeuralChampion();
    });
    this.element.querySelector('[data-action="export-neural-champion"]')?.addEventListener('click', () => {
      this.exportNeuralChampion();
    });
    this.element.querySelector('[data-action="import-neural-champion"]')?.addEventListener('click', () => {
      this.importNeuralChampion();
    });
  }

  bindNeuralControls() {
    this.element.querySelector('[data-action="neural-population"]')?.addEventListener('change', (event) => {
      this.neuralPopulationSize = clampInteger(event.target.value, 1, 128, this.neuralPopulationSize);
    });
    this.element.querySelector('[data-action="neural-generations"]')?.addEventListener('change', (event) => {
      this.neuralGenerations = clampInteger(event.target.value, 1, 50, this.neuralGenerations);
    });
    this.element.querySelector('[data-action="neural-duration"]')?.addEventListener('change', (event) => {
      this.neuralEpisodeDuration = clampInteger(event.target.value, 10, 1800, this.neuralEpisodeDuration);
    });
    this.element.querySelector('[data-action="neural-mutation"]')?.addEventListener('change', (event) => {
      this.neuralMutationRate = clampNumber(event.target.value, 0, 1, this.neuralMutationRate);
    });
    this.element.querySelector('[data-action="neural-use-champion"]')?.addEventListener('change', (event) => {
      this.neuralUseChampion = Boolean(event.target.checked);
    });
    this.element.querySelector('[data-action="neural-show-clones"]')?.addEventListener('change', (event) => {
      this.neuralShowClones = Boolean(event.target.checked);
    });
    this.element.querySelector('[data-action="neural-headless"]')?.addEventListener('change', (event) => {
      this.neuralHeadlessMode = Boolean(event.target.checked);
    });
  }

  generateReport() {
    const runtimeSnapshot = this.getRuntimeSnapshot();
    const autoTestSnapshot = this.getAutoTestSnapshot?.() ?? this.autoTestSnapshot;

    if (!runtimeSnapshot.simulation && autoTestSnapshot) {
      runtimeSnapshot.lastSimulationSnapshot = autoTestSnapshot;
    }

    this.lastReport = this.reportSystem.createReport({
      runtimeSnapshot,
      trigger: 'feedback-ui',
    });
    this.statusMessage = `Generated ${this.lastReport.id}. Review before sharing.`;
    this.onUiAction?.('feedback-generate');
    this.render();
  }

  runAutoTest() {
    const result = this.onRunAutoTest?.({
      modeId: this.selectedAutoTestMode,
      inventoryProfileId: this.selectedInventoryProfile,
    });

    this.autoTestSnapshot = result?.snapshot ?? this.getAutoTestSnapshot?.() ?? this.autoTestSnapshot;
    this.statusMessage = result?.message ?? 'Autonomous playtest started.';
    this.onUiAction?.('auto-test-run');
    this.render();
  }

  runNeuralTraining({ modeId = 'quick', episodeDuration = this.neuralEpisodeDuration, trainPopulation = false, showClones = this.neuralShowClones } = {}) {
    const result = this.onRunNeuralTraining?.({
      modeId,
      inventoryProfileId: this.selectedInventoryProfile,
      populationSize: this.neuralPopulationSize,
      generations: this.neuralGenerations,
      episodeDuration,
      mutationRate: this.neuralMutationRate,
      useChampion: this.neuralUseChampion,
      trainPopulation,
      showClones,
      headlessMode: this.neuralHeadlessMode,
    }) ?? this.onRunAutoTest?.({
      modeId,
      inventoryProfileId: this.selectedInventoryProfile,
      neuralAgentEnabled: true,
      neuralTrainingMode: true,
      neuralTrainingMetadata: {
        mode: modeId,
        populationSize: this.neuralPopulationSize,
        generations: this.neuralGenerations,
        episodeDuration,
        mutationRate: this.neuralMutationRate,
        useChampion: this.neuralUseChampion,
        trainPopulation,
        showClones,
        headlessMode: this.neuralHeadlessMode,
      },
    });

    this.selectedAutoTestMode = modeId;
    this.autoTestSnapshot = result?.snapshot ?? this.getAutoTestSnapshot?.() ?? this.autoTestSnapshot;
    this.statusMessage = result?.message ?? 'Neural training started.';
    this.onUiAction?.('neural-training-run');
    this.render();
  }

  stopNeuralTraining() {
    const snapshot = this.onStopAutoTest?.('neural-training-stopped') ?? null;

    this.autoTestSnapshot = snapshot ?? this.getAutoTestSnapshot?.() ?? this.autoTestSnapshot;
    this.statusMessage = 'Neural training stopped.';
    this.onUiAction?.('neural-training-stop');
    this.render();
  }

  resetNeuralChampion() {
    globalThis.localStorage?.removeItem?.('godoy:ai-neural-champion');
    this.statusMessage = 'Neural champion reset locally.';
    this.onUiAction?.('neural-champion-reset');
    this.render();
  }

  async exportNeuralChampion() {
    const championJson = globalThis.localStorage?.getItem?.('godoy:ai-neural-champion') ?? '';

    if (!championJson) {
      this.statusMessage = 'No local neural champion found.';
      this.render();
      return;
    }

    const wasCopied = await copyText(championJson);

    this.statusMessage = wasCopied ? 'Champion JSON copied to clipboard.' : 'Clipboard unavailable for champion export.';
    this.onUiAction?.('neural-champion-export');
    this.render();
  }

  importNeuralChampion() {
    const championJson = globalThis.window?.prompt?.('Paste champion JSON') ?? '';

    if (!championJson) {
      return;
    }

    try {
      JSON.parse(championJson);
      globalThis.localStorage?.setItem?.('godoy:ai-neural-champion', championJson);
      this.statusMessage = 'Champion JSON imported locally.';
      this.onUiAction?.('neural-champion-import');
    } catch {
      this.statusMessage = 'Champion JSON import failed.';
    }

    this.render();
  }

  setAutoTestSnapshot(snapshot, report = null) {
    this.autoTestSnapshot = snapshot;

    if (report) {
      this.lastReport = report;
      this.statusMessage = `Auto test complete: ${report.id}. Review before sharing.`;
    }

    if (this.isOpen) {
      this.render();
    }
  }

  async copyReportToClipboard() {
    if (!this.lastReport) {
      return;
    }

    const reportJson = this.createReportJson();
    const wasCopied = await copyText(reportJson);

    this.statusMessage = wasCopied
      ? 'Report JSON copied to clipboard.'
      : 'Clipboard unavailable. Download the JSON instead.';
    this.onUiAction?.('feedback-copy');
    this.render();
  }

  downloadReport() {
    if (!this.lastReport) {
      return;
    }

    const blob = new Blob([this.createReportJson()], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${this.lastReport.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    this.statusMessage = 'Report JSON download started.';
    this.onUiAction?.('feedback-download');
    this.render();
  }

  createReportJson() {
    return JSON.stringify(this.lastReport, null, 2);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  const textArea = document.createElement('textarea');

  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();

  let wasCopied = false;

  try {
    wasCopied = document.execCommand('copy');
  } catch {
    wasCopied = false;
  }

  textArea.remove();

  return wasCopied;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function formatModeOption(mode) {
  const durationMinutes = Math.round((mode.durationSeconds ?? 60) / 60);

  if (durationMinutes <= 1) {
    return `${mode.label} 60s`;
  }

  return `${mode.label} ${durationMinutes}m`;
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, parsed));
}
