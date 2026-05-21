import './style.css';
import { Engine } from './engine/engine.js';

const appElement = document.querySelector('#app');
const engine = new Engine({ rootElement: appElement });

engine.start();
