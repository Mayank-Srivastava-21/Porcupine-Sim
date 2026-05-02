export let agentParams = Array(20).fill().map(() => ({
  bodyHeat: 35 + Math.random() * (39 - 35), // Random between 35–39°C
  coldTolerance: Math.random(), // Random between 0–1
  painTolerance: Math.random() // Random between 0–1
}));

export function setAgentParams(newParams) {
  // Validate parameters
  for (const params of newParams) {
    if (params.bodyHeat < 35 || params.bodyHeat > 39) {
      throw new Error(`Invalid body heat: ${params.bodyHeat}, must be between 35 and 39`);
    }
    if (params.coldTolerance < 0 || params.coldTolerance > 1) {
      throw new Error(`Invalid cold tolerance: ${params.coldTolerance}, must be between 0 and 1`);
    }
    if (params.painTolerance < 0 || params.painTolerance > 1) {
      throw new Error(`Invalid pain tolerance: ${params.painTolerance}, must be between 0 and 1`);
    }
  }
  agentParams = newParams;
}

export let currentAlgorithm = 'q_learning';

export function setCurrentAlgorithm(algorithm) {
  currentAlgorithm = algorithm;
}

export let currentStep = 0;

export function setCurrentStep(step) {
  currentStep = step;
}

export let animationFrameId = null;

export function setAnimationFrameId(id) {
  animationFrameId = id;
}

export let selectedAgentId = null;

export function setSelectedAgentId(id) {
  selectedAgentId = id;
}

export const csvData = [];

export const graphData = {
  distance: [],
  total_reward: [],
  pain_reward: [],
  temp_reward: [],
  pain_history: {},
  avg_orientation_diff: []
};

export const labelPositions = {};

export const popupState = {
  isOpen: false,
  canvasId: null,
  yLabel: null,
  data: null
};

export let timeoutId = null;

export function setTimeoutId(id) {
  timeoutId = id;
}