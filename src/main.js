import './style.css';
import { Engine } from './engine/engine.js';

const appElement = document.querySelector('#app');

try {
  const engine = new Engine({ rootElement: appElement });
  engine.start();
} catch (error) {
  appElement.innerHTML = `
    <div class="engine-error">
      <strong>Godoy Engine</strong>
      <span>WebGL is unavailable in this browser context.</span>
    </div>
  `;
  console.error(error);
}
