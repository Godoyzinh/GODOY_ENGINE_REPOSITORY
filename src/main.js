import './style.css';
import { Engine } from './engine/engine.js';
import { renderBootFallback } from './ui/bootFallback.js';

const appElement = document.querySelector('#app');

try {
  appElement.querySelector('.alpha-loading')?.remove();
  const engine = new Engine({ rootElement: appElement });
  engine.start();
} catch (error) {
  renderBootFallback(appElement, error);
  console.error(error);
}
