import './style.css';
import { Engine } from './engine/engine.js';

const appElement = document.querySelector('#app');

try {
  const engine = new Engine({ rootElement: appElement });
  engine.start();
} catch (error) {
  window.__GODOY_BOOT_ERROR__ = {
    message: error.message,
    stack: error.stack,
  };
  appElement.dataset.bootError = error.message;
  appElement.innerHTML = `
    <div class="engine-error">
      <strong>Godoy Engine</strong>
      <span>Rendering could not start. Check WebGL support, hardware acceleration, and the browser console.</span>
      <small></small>
    </div>
  `;
  appElement.querySelector('.engine-error small').textContent = error.message;
  console.error(error);
}
