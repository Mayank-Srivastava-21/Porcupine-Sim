export class QLearningAgent {
  //static sharedQTable = null;

  //(numTempBins = 100, numPainBins = 100, numActions = 5, initialAlpha = 0.1, gamma = 0.8, epsilon = 0.3, useSharedQTable = true) {
  constructor(numTempBins = 25, numPainBins = 25, numActions = 5, initialAlpha = 0.1, gamma = 0.8, epsilon = 0.3) {
    //console.log("Initializing QLearningAgent with params:", { numTempBins, numPainBins, numActions, initialAlpha, gamma, epsilon, useSharedQTable });
    this.numTempBins = numTempBins;
    this.numPainBins = numPainBins;
    this.numActions = numActions;
    this.initialAlpha = initialAlpha;
    this.alphaDecayRate = 0.0001;
    this.stepCount = 0;
    this.gamma = gamma;
    this.epsilon = epsilon;
    this.epsilonMin = 0.01;
    this.epsilonDecay = 0.99995;
    //if (useSharedQTable && QLearningAgent.sharedQTable !== null) {
    //  this.qTable = QLearningAgent.sharedQTable;
    //} else {
    //  this.qTable = Array(numTempBins).fill().map(() =>
    //    Array(numPainBins).fill().map(() =>
    //      Array(numActions).fill(0)
    //    )
    //  );
    //  if (useSharedQTable) {
    //    QLearningAgent.sharedQTable = this.qTable;
    //  }
    //}
    this.qTable = Array(numTempBins).fill().map(() =>
      Array(numPainBins).fill().map(() =>
        Array(numActions).fill(0)
      )
    );
    this.tempMin = -20; 
    this.tempMax = 40;
    this.painMin = 0;
    this.painMax = 1;
  }

  getState(tempDiff, pain) {
    console.log("Getting state with tempDiff:", tempDiff, "pain:", pain);
    const clampedPain = Math.min(Math.max(pain, this.painMin), this.painMax);
    const tempBin = Math.min(
      this.numTempBins - 1,
      Math.max(0, Math.floor((tempDiff - this.tempMin) / (this.tempMax - this.tempMin) * this.numTempBins))
    );
    const painBin = Math.min(
      this.numPainBins - 1,
      Math.max(0, Math.floor((clampedPain - this.painMin) / (this.painMax - this.painMin) * this.numPainBins))
    );
    return [tempBin, painBin];
  }

  chooseAction(state) {
    console.log("Choosing action for state:", state);
    if (Math.random() < this.epsilon) {
      const action = Math.floor(Math.random() * this.numActions);
      console.log("Random action chosen:", action);
      return action;
    } else {
      const [tempBin, painBin] = state;
      const actions = this.qTable[tempBin][painBin];
      const maxQ = Math.max(...actions.filter(Number.isFinite));
      const maxActions = actions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q === maxQ)
        .map(({ i }) => i);
      const action = maxActions[Math.floor(Math.random() * maxActions.length)];
      console.log("Max Q action chosen:", action);
      return action;
    }
  }

  update(state, action, reward, nextState) {
    console.log("Updating Q-table with state:", state, "action:", action, "reward:", reward, "nextState:", nextState);
    if (!Number.isFinite(reward)) return; // Skip update if reward is invalid
    this.stepCount += 1;
    const alpha = this.initialAlpha / (1 + this.alphaDecayRate * this.stepCount);
    const [tempBin, painBin] = state;
    const [nextTempBin, nextPainBin] = nextState;
    const currentQ = this.qTable[tempBin][painBin][action];
    const nextMaxQ = Math.max(...this.qTable[nextTempBin][nextPainBin].filter(Number.isFinite));
    const newQ = currentQ + alpha * (reward + this.gamma * nextMaxQ - currentQ);
    this.qTable[tempBin][painBin][action] = newQ;
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    console.log("Updated Q-value:", newQ, "new epsilon:", this.epsilon);
  }
}