import {
  AUTONOMOUS_INVENTORY_PROFILE_OPTIONS,
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
} from '../diagnostics/autonomousInventoryProfiles.js';

export class FeedbackUI {
  constructor({
    rootElement,
    reportSystem,
    getRuntimeSnapshot,
    getAutoTestSnapshot = null,
    onRunAutoTest = null,
    runtimeConfig = null,
    onUiAction = null,
  }) {
    this.reportSystem = reportSystem;
    this.getRuntimeSnapshot = getRuntimeSnapshot;
    this.getAutoTestSnapshot = getAutoTestSnapshot;
    this.onRunAutoTest = onRunAutoTest;
    this.runtimeConfig = runtimeConfig;
    this.onUiAction = onUiAction;
    this.isOpen = false;
    this.lastReport = null;
    this.autoTestSnapshot = getAutoTestSnapshot?.() ?? null;
    this.selectedAutoTestMode = 'quick';
    this.selectedInventoryProfile = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID;
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
            <option value="quick" ${this.selectedAutoTestMode === 'quick' ? 'selected' : ''}>Quick 60s</option>
            <option value="standard" ${this.selectedAutoTestMode === 'standard' ? 'selected' : ''}>Standard 5m</option>
            <option value="stress" ${this.selectedAutoTestMode === 'stress' ? 'selected' : ''}>Stress 15m</option>
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
        <button type="button" data-action="run-auto-test" ${isRunning ? 'disabled' : ''}>
          ${isRunning ? 'Running Auto Test' : 'Run Auto Test'}
        </button>
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
    this.element.querySelector('[data-action="run-auto-test"]')?.addEventListener('click', () => {
      this.runAutoTest();
    });
  }

  generateReport() {
    this.lastReport = this.reportSystem.createReport({
      runtimeSnapshot: this.getRuntimeSnapshot(),
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
