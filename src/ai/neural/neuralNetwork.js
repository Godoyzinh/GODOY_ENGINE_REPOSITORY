export const DEFAULT_NEURAL_ARCHITECTURE = Object.freeze({
  inputCount: 22,
  hiddenLayers: [12],
  outputCount: 8,
});

const DEFAULT_WEIGHT_SCALE = 1.25;

export class NeuralNetwork {
  constructor({
    inputCount = DEFAULT_NEURAL_ARCHITECTURE.inputCount,
    hiddenLayers = DEFAULT_NEURAL_ARCHITECTURE.hiddenLayers,
    outputCount = DEFAULT_NEURAL_ARCHITECTURE.outputCount,
    layers = null,
    random = Math.random,
  } = {}) {
    this.inputCount = Number(inputCount);
    this.hiddenLayers = [...hiddenLayers].map(Number);
    this.outputCount = Number(outputCount);
    this.layerSizes = [
      this.inputCount,
      ...this.hiddenLayers,
      this.outputCount,
    ];
    this.layers = layers
      ? cloneLayers(layers)
      : createRandomLayers(this.layerSizes, random);
  }

  forward(inputs) {
    let activations = normalizeInputVector(inputs, this.inputCount);

    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
      const layer = this.layers[layerIndex];
      const isOutputLayer = layerIndex === this.layers.length - 1;

      activations = layer.neurons.map((neuron) => {
        const sum = neuron.weights.reduce((total, weight, index) => (
          total + weight * Number(activations[index] ?? 0)
        ), neuron.bias);

        return isOutputLayer ? relu(sum) : relu(sum);
      });
    }

    return activations;
  }

  clone() {
    return new NeuralNetwork({
      inputCount: this.inputCount,
      hiddenLayers: this.hiddenLayers,
      outputCount: this.outputCount,
      layers: this.layers,
    });
  }

  mutate({ mutationRate = 0.08, mutationStrength = 0.35, random = Math.random } = {}) {
    const mutated = this.clone();

    for (const layer of mutated.layers) {
      for (const neuron of layer.neurons) {
        neuron.weights = neuron.weights.map((weight) => (
          random() < mutationRate
            ? weight + randomSigned(random) * mutationStrength
            : weight
        ));

        if (random() < mutationRate) {
          neuron.bias += randomSigned(random) * mutationStrength;
        }
      }
    }

    return mutated;
  }

  crossover(otherNetwork, { random = Math.random } = {}) {
    const other = otherNetwork instanceof NeuralNetwork
      ? otherNetwork
      : NeuralNetwork.deserialize(otherNetwork);

    if (!isSameArchitecture(this, other)) {
      return this.clone();
    }

    const layers = this.layers.map((layer, layerIndex) => ({
      neurons: layer.neurons.map((neuron, neuronIndex) => {
        const otherNeuron = other.layers[layerIndex].neurons[neuronIndex];

        return {
          bias: random() < 0.5 ? neuron.bias : otherNeuron.bias,
          weights: neuron.weights.map((weight, weightIndex) => (
            random() < 0.5 ? weight : otherNeuron.weights[weightIndex]
          )),
        };
      }),
    }));

    return new NeuralNetwork({
      inputCount: this.inputCount,
      hiddenLayers: this.hiddenLayers,
      outputCount: this.outputCount,
      layers,
    });
  }

  serialize() {
    return {
      architecture: {
        inputCount: this.inputCount,
        hiddenLayers: [...this.hiddenLayers],
        outputCount: this.outputCount,
      },
      layers: cloneLayers(this.layers),
    };
  }

  static deserialize(serializedNetwork) {
    const architecture = serializedNetwork?.architecture ?? {};

    return new NeuralNetwork({
      inputCount: architecture.inputCount ?? serializedNetwork?.inputCount ?? DEFAULT_NEURAL_ARCHITECTURE.inputCount,
      hiddenLayers: architecture.hiddenLayers ?? serializedNetwork?.hiddenLayers ?? DEFAULT_NEURAL_ARCHITECTURE.hiddenLayers,
      outputCount: architecture.outputCount ?? serializedNetwork?.outputCount ?? DEFAULT_NEURAL_ARCHITECTURE.outputCount,
      layers: serializedNetwork?.layers,
    });
  }
}

export function createSeededRandom(seed = 1337) {
  let state = Math.max(1, Math.floor(Number(seed) || 1)) % 2147483647;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function createRandomLayers(layerSizes, random) {
  const layers = [];

  for (let layerIndex = 1; layerIndex < layerSizes.length; layerIndex += 1) {
    const inputCount = layerSizes[layerIndex - 1];
    const outputCount = layerSizes[layerIndex];

    layers.push({
      neurons: Array.from({ length: outputCount }, () => ({
        bias: randomSigned(random) * DEFAULT_WEIGHT_SCALE,
        weights: Array.from({ length: inputCount }, () => randomSigned(random) * DEFAULT_WEIGHT_SCALE),
      })),
    });
  }

  return layers;
}

function normalizeInputVector(inputs, inputCount) {
  const values = Array.isArray(inputs) ? inputs : [];

  return Array.from({ length: inputCount }, (_unused, index) => clampNumber(values[index] ?? 0));
}

function cloneLayers(layers) {
  return layers.map((layer) => ({
    neurons: layer.neurons.map((neuron) => ({
      bias: Number(neuron.bias ?? 0),
      weights: neuron.weights.map((weight) => Number(weight)),
    })),
  }));
}

function relu(value) {
  return Math.max(0, Number(value) || 0);
}

function randomSigned(random) {
  return random() * 2 - 1;
}

function clampNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  return Math.max(-1, Math.min(1, Number(value)));
}

function isSameArchitecture(left, right) {
  return left.inputCount === right.inputCount &&
    left.outputCount === right.outputCount &&
    left.hiddenLayers.length === right.hiddenLayers.length &&
    left.hiddenLayers.every((size, index) => size === right.hiddenLayers[index]);
}
