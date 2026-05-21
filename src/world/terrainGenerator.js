import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';

const TERRAIN_SIZE = 96;
const TERRAIN_SEGMENTS = 96;

export class TerrainGenerator {
  constructor() {
    this.group = new Group();
    this.group.name = 'TerrainGenerator';
    this.stats = {
      chunksLoaded: 1,
      vertices: (TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1),
    };

    this.material = new MeshStandardMaterial({
      color: '#5ca66f',
      roughness: 0.92,
      metalness: 0,
      vertexColors: true,
    });

    this.mesh = new Mesh(this.createTerrainGeometry(), this.material);
    this.mesh.name = 'FoundationTerrain';
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  update() {
    this.group.position.set(0, 0, 0);
  }

  getHeightAt(x, z) {
    return this.sampleHeight(x, z);
  }

  sampleHeight(x, z) {
    const broadHills = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2.2;
    const detail = Math.sin((x + z) * 0.22) * 0.5;
    return broadHills + detail;
  }

  createTerrainGeometry() {
    const geometry = new BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];
    const halfSize = TERRAIN_SIZE / 2;
    const color = new Color();

    for (let zIndex = 0; zIndex <= TERRAIN_SEGMENTS; zIndex += 1) {
      for (let xIndex = 0; xIndex <= TERRAIN_SEGMENTS; xIndex += 1) {
        const x = (xIndex / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize;
        const z = (zIndex / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize;
        const y = this.sampleHeight(x, z);

        vertices.push(x, y, z);

        if (y > 1.4) {
          color.set('#6f8f54');
        } else if (y < -1.2) {
          color.set('#4f8f88');
        } else {
          color.set('#5ca66f');
        }

        colors.push(color.r, color.g, color.b);
      }
    }

    for (let zIndex = 0; zIndex < TERRAIN_SEGMENTS; zIndex += 1) {
      for (let xIndex = 0; xIndex < TERRAIN_SEGMENTS; xIndex += 1) {
        const topLeft = zIndex * (TERRAIN_SEGMENTS + 1) + xIndex;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + TERRAIN_SEGMENTS + 1;
        const bottomRight = bottomLeft + 1;

        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }
}
