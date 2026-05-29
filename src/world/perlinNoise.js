const PRIME_X = 501125321;
const PRIME_Y = 1136930381;
const PRIME_Z = 1720413743;

export class PerlinNoise {
  constructor(seedText) {
    this.seed = hashString(seedText);
  }

  noise2D(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = fade(x - x0);
    const sy = fade(y - y0);

    const n00 = gradientDot2D(this.hash2D(x0, y0), x - x0, y - y0);
    const n10 = gradientDot2D(this.hash2D(x1, y0), x - x1, y - y0);
    const n01 = gradientDot2D(this.hash2D(x0, y1), x - x0, y - y1);
    const n11 = gradientDot2D(this.hash2D(x1, y1), x - x1, y - y1);

    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
  }

  noise3D(x, y, z) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;
    const sx = fade(x - x0);
    const sy = fade(y - y0);
    const sz = fade(z - z0);

    const n000 = gradientDot3D(this.hash3D(x0, y0, z0), x - x0, y - y0, z - z0);
    const n100 = gradientDot3D(this.hash3D(x1, y0, z0), x - x1, y - y0, z - z0);
    const n010 = gradientDot3D(this.hash3D(x0, y1, z0), x - x0, y - y1, z - z0);
    const n110 = gradientDot3D(this.hash3D(x1, y1, z0), x - x1, y - y1, z - z0);
    const n001 = gradientDot3D(this.hash3D(x0, y0, z1), x - x0, y - y0, z - z1);
    const n101 = gradientDot3D(this.hash3D(x1, y0, z1), x - x1, y - y0, z - z1);
    const n011 = gradientDot3D(this.hash3D(x0, y1, z1), x - x0, y - y1, z - z1);
    const n111 = gradientDot3D(this.hash3D(x1, y1, z1), x - x1, y - y1, z - z1);

    const nx00 = lerp(n000, n100, sx);
    const nx10 = lerp(n010, n110, sx);
    const nx01 = lerp(n001, n101, sx);
    const nx11 = lerp(n011, n111, sx);

    return lerp(lerp(nx00, nx10, sy), lerp(nx01, nx11, sy), sz);
  }

  fractal2D(x, y, { octaves = 4, frequency = 0.01, lacunarity = 2, persistence = 0.5 } = {}) {
    let value = 0;
    let amplitude = 1;
    let amplitudeTotal = 0;
    let currentFrequency = frequency;

    for (let octave = 0; octave < octaves; octave += 1) {
      value += this.noise2D(x * currentFrequency, y * currentFrequency) * amplitude;
      amplitudeTotal += amplitude;
      amplitude *= persistence;
      currentFrequency *= lacunarity;
    }

    return value / amplitudeTotal;
  }

  fractal3D(x, y, z, { octaves = 3, frequency = 0.04, lacunarity = 2, persistence = 0.5 } = {}) {
    let value = 0;
    let amplitude = 1;
    let amplitudeTotal = 0;
    let currentFrequency = frequency;

    for (let octave = 0; octave < octaves; octave += 1) {
      value += this.noise3D(x * currentFrequency, y * currentFrequency, z * currentFrequency) * amplitude;
      amplitudeTotal += amplitude;
      amplitude *= persistence;
      currentFrequency *= lacunarity;
    }

    return value / amplitudeTotal;
  }

  random2D(x, y) {
    return normalizeHash(this.hash2D(Math.floor(x), Math.floor(y)));
  }

  hash2D(x, y) {
    return avalanche(Math.imul(x, PRIME_X) ^ Math.imul(y, PRIME_Y) ^ this.seed);
  }

  hash3D(x, y, z) {
    return avalanche(Math.imul(x, PRIME_X) ^ Math.imul(y, PRIME_Y) ^ Math.imul(z, PRIME_Z) ^ this.seed);
  }
}

function hashString(text) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function avalanche(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function normalizeHash(hash) {
  return hash / 4294967295;
}

function gradientDot2D(hash, x, y) {
  const angle = normalizeHash(hash) * Math.PI * 2;

  return Math.cos(angle) * x + Math.sin(angle) * y;
}

function gradientDot3D(hash, x, y, z) {
  const gradients = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
  ];
  const gradient = gradients[hash % gradients.length];

  return gradient[0] * x + gradient[1] * y + gradient[2] * z;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}
