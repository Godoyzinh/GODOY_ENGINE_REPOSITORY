export class ReleaseBannerUI {
  constructor({ rootElement, runtimeConfig }) {
    this.runtimeConfig = runtimeConfig;
    this.element = document.createElement('div');
    this.element.className = 'release-banner';
    rootElement.appendChild(this.element);
    this.render();
  }

  render() {
    const feedbackMarkup = this.runtimeConfig.feedbackUrl
      ? `<a href="${escapeAttribute(this.runtimeConfig.feedbackUrl)}" target="_blank" rel="noreferrer">Feedback</a>`
      : '<span>Feedback soon</span>';

    this.element.innerHTML = `
      <span>${escapeHtml(this.runtimeConfig.releaseLabel)}</span>
      ${feedbackMarkup}
    `;
  }

  dispose() {
    this.element.remove();
  }
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
