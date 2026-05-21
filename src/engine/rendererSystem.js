import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';

const MAX_PIXEL_RATIO = 2;

export class RendererSystem {
  constructor({ rootElement }) {
    this.rootElement = rootElement;
    this.width = rootElement.clientWidth || window.innerWidth;
    this.height = rootElement.clientHeight || window.innerHeight;

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.domElement = this.renderer.domElement;

    this.rootElement.appendChild(this.renderer.domElement);
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}
