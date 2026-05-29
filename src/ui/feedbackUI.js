export class FeedbackUI {
  constructor({
    rootElement,
    reportSystem,
    getRuntimeSnapshot,
    runtimeConfig = null,
    onUiAction = null,
  }) {
    this.reportSystem = reportSystem;
    this.getRuntimeSnapshot = getRuntimeSnapshot;
    this.runtimeConfig = runtimeConfig;
    this.onUiAction = onUiAction;
    this.isOpen = false;
    this.lastReport = null;
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
