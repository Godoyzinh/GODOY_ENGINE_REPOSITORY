export function renderBootFallback(rootElement, error) {
  const message = error?.message ?? 'Unknown renderer startup error.';

  window.__GODOY_BOOT_ERROR__ = {
    message,
    stack: error?.stack,
  };
  rootElement.dataset.bootError = message;
  rootElement.innerHTML = createBootFallbackMarkup(message);
}

export function createBootFallbackMarkup(message) {
  return `
    <div class="engine-error" role="alert">
      <strong>Godoy Engine</strong>
      <span>WebGL could not start. Enable hardware acceleration, update your browser, or try a lower graphics preset.</span>
      <small>${escapeHtml(message)}</small>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
