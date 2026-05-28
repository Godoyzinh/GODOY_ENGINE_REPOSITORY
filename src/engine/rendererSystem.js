import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';

export class RendererSystem {
  constructor({ rootElement, settingsSnapshot = null }) {
    this.rootElement = rootElement;
    this.width = rootElement.clientWidth || window.innerWidth;
    this.height = rootElement.clientHeight || window.innerHeight;
    this.maxPixelRatio = settingsSnapshot?.graphics?.maxPixelRatio ?? 2;
    this.shadowsEnabled = settingsSnapshot?.graphics?.shadows !== false;

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.domElement = this.renderer.domElement;

    this.rootElement.appendChild(this.renderer.domElement);
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
  }

  applySettings(settingsSnapshot) {
    this.maxPixelRatio = settingsSnapshot.graphics.maxPixelRatio;
    this.shadowsEnabled = settingsSnapshot.graphics.shadows;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.resize(this.width, this.height);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}
