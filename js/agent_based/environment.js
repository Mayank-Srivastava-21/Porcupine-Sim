import { QLearningAgent } from '../q_learning.js';

function mod(n, m) {
  return ((n % m) + m) % m;
}

class Environment {
  constructor(width, height, ambientTemperature) {
    this.width = width;
    this.height = height;
    this.ambientTemperature = Math.max(-25, Math.min(40, ambientTemperature));
    this.localTemperature = Array(width).fill().map(() => Array(height).fill(this.ambientTemperature));
    this.timeStep = 0;
    this.baseAmbientTemp = this.ambientTemperature;
    this.painHistory = {};
  }

  decayTemperature() {
    this.localTemperature = this.localTemperature.map(row =>
      row.map(temp => this.ambientTemperature + (temp - this.ambientTemperature) * 0.8)
    );
    this.localTemperature = this.localTemperature.map(row =>
      row.map(temp => Math.max(temp, this.ambientTemperature))
    );
  }

  // Read temperature at continuous coords using bilinear interpolation (temperature values are floats)
  getLocalTemperature(x, y) {
    if (!this.localTemperature || this.localTemperature.length === 0 || this.localTemperature[0].length === 0) {
      return this.ambientTemperature;
    }
    // wrap coordinates into [0, width) and [0, height)
    let fx = x % this.width;
    if (fx < 0) fx += this.width;
    let fy = y % this.height;
    if (fy < 0) fy += this.height;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix; // fractional part x
    const ty = fy - iy; // fractional part y
    const ix1 = (ix + 1) % this.width;
    const iy1 = (iy + 1) % this.height;
    const v00 = this.localTemperature[ix][iy];
    const v10 = this.localTemperature[ix1][iy];
    const v01 = this.localTemperature[ix][iy1];
    const v11 = this.localTemperature[ix1][iy1];
    // bilinear interpolation
    const vx0 = v00 * (1 - tx) + v10 * tx;
    const vx1 = v01 * (1 - tx) + v11 * tx;
    const v = vx0 * (1 - ty) + vx1 * ty;
    return v;
  }

  // Increase temperature at continuous (x,y) by distributing amount to four surrounding grid cells (bilinear)
  increaseLocalTemperature(x, y, amount) {
    // wrap coordinates
    let fx = x % this.width;
    if (fx < 0) fx += this.width;
    let fy = y % this.height;
    if (fy < 0) fy += this.height;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const ix1 = (ix + 1) % this.width;
    const iy1 = (iy + 1) % this.height;
    // bilinear weights
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    this.localTemperature[ix][iy] += amount * w00;
    this.localTemperature[ix1][iy] += amount * w10;
    this.localTemperature[ix][iy1] += amount * w01;
    this.localTemperature[ix1][iy1] += amount * w11;
  }

  getFrameData(agents, step) {
    this.timeStep += 1;
    const pain_history = this.painHistory;
    let totalReward = 0, totalPainReward = 0, totalTempReward = 0, totalDistance = 0, pairCount = 0;
    const isQLearning = agents.some(a => a.useQLearning);
    agents.forEach(agent => {
      if (!pain_history[agent.id]) {
        pain_history[agent.id] = [];
      }
      pain_history[agent.id].push(agent.pain);
      if (pain_history[agent.id].length > 100) {
        pain_history[agent.id].shift();
      }
    });
    agents.forEach(agent => {
      const [dist] = agent.getNearestAgentDistance();
      if (Number.isFinite(dist)) {
        totalDistance += dist;
        pairCount++;
      }
    });
    const average_distance = pairCount > 0 ? totalDistance / pairCount : 0;
    const visited = new Set();
    const clusters = [];
    function findCluster(agent) {
      const cluster = [];
      const stack = [agent];
      visited.add(agent.id);
      while (stack.length > 0) {
        const current = stack.pop();
        cluster.push(current);
        agents.forEach(other => {
          if (!visited.has(other.id) && other.id !== current.id) {
            const dist = current.toroidalDistance(current.x, current.y, other.x, other.y);
            if (dist <= 3) {
              stack.push(other);
              visited.add(other.id);
            }
          }
        });
      }
      return cluster;
    }
    agents.forEach(agent => {
      if (!visited.has(agent.id)) {
        const cluster = findCluster(agent);
        if (cluster.length >= 2) {
          clusters.push(cluster);
        }
      }
    });
    const num_clusters = clusters.length;
    agents.forEach(agent => {
      const cluster = clusters.find(c => c.includes(agent));
      agent.isClustered = !!cluster;
      agent.cluster_size = cluster ? cluster.length : 1;
    });
    let totalAngleDiff = 0;
    let totalPairs = 0;
    clusters.forEach(cluster => {
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          const agent1 = cluster[i];
          const agent2 = cluster[j];
          const frameAgent1 = agents.find(a => a.id === agent1.id);
          const frameAgent2 = agents.find(a => a.id === agent2.id);
          const heading1 = frameAgent1.heading * Math.PI / 180;
          const heading2 = frameAgent2.heading * Math.PI / 180;
          let angleDiff = Math.abs(heading1 - heading2);
          angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
          angleDiff = Math.abs(angleDiff) * 180 / Math.PI;
          totalAngleDiff += angleDiff;
          totalPairs++;
        }
      }
    });
    const avg_orientation_diff = totalPairs > 0 ? totalAngleDiff / totalPairs : 0;
    const frame = {
      step,
      local_temperatures: this.localTemperature,
      agents: agents.map(a => ({
        id: a.id,
        x: a.x,
        y: a.y,
        heading: a.heading * 180 / Math.PI,
        bodyHeat: a.bodyHeat,
        pain: a.pain,
        stopMovement: a.stopMovement,
        is_clustered: a.isClustered,
        cluster_size: a.cluster_size,
        color: a.getPainColor() // Add color based on painTolerance
      })),
      ambientTemperature: this.ambientTemperature,
      pain_history,
      average_distance,
      num_clusters,
      avg_orientation_diff
    };
    if (isQLearning) {
      agents.forEach(agent => {
        if (agent.useQLearning) {
          const [reward, painReward, tempReward] = agent.computeReward(
            agent.senseLocalTemperature(),
            agent.getNearbyAgentsCount()
          );
          if (Number.isFinite(reward)) totalReward += reward;
          if (Number.isFinite(painReward)) totalPainReward += painReward;
          if (Number.isFinite(tempReward)) totalTempReward += tempReward;
        }
      });
      const qAgentCount = agents.filter(a => a.useQLearning).length;
      frame.average_reward = qAgentCount > 0 ? totalReward / qAgentCount : 0;
      frame.average_pain_reward = qAgentCount > 0 ? totalPainReward / qAgentCount : 0;
      frame.average_temp_reward = qAgentCount > 0 ? totalTempReward / qAgentCount : 0;
    }
    return frame;
  }
}

class Agent {
  //constructor(agentId, env, coldTolerance, bodyHeat, painTolerance, allAgents, useQLearning, sharedQLearning = true) {
  constructor(agentId, env, coldTolerance, bodyHeat, painTolerance, allAgents, useQLearning) {
    this.id = agentId;
    this.env = env;
    this.allAgents = allAgents;
    this.x = Math.random() * env.width;
    this.y = Math.random() * env.height;
    this.heading = Math.random() * 2 * Math.PI;
    this.speed = 1;
    this.bodyHeat = Math.min(39, Math.max(35, bodyHeat));
    this.preferredHeatMin = 35;
    this.preferredHeatMax = 39;
    this.pain = 0;
    this.coldTolerance = Math.max(0, Math.min(1, coldTolerance));
    this.painTolerance = Math.max(0, Math.min(1, painTolerance));
    this.spineNumber = Math.floor(Math.random() * 11) + 8;
    //this.spineNumber = Math.floor(Math.random() * 19) + 18;
    this.spineSize = Math.random() * 0.5 + 0.8;
    this.stopMovement = false;
    this.useQLearning = useQLearning;
    //this.qAgent = useQLearning ? new QLearningAgent(25, 25, 5, 0.1, 0.8, 0.3, sharedQLearning) : null;
    this.qAgent = useQLearning ? new QLearningAgent(25, 25, 5, 0.1, 0.8, 0.3) : null;
    this.isClustered = false;
    this.cluster_size = 1;
  }

  getBodyCells() {
    const cells = [];
    // removed Math.round — use continuous positions for body cell calculation
    const cx = this.x;
    const cy = this.y;
    cells.push([mod(Math.floor(cx), this.env.width), mod(Math.floor(cy), this.env.height)]);
    const bx1 = this.x - Math.cos(this.heading);
    const by1 = this.y - Math.sin(this.heading);
    cells.push([mod(Math.floor(bx1), this.env.width), mod(Math.floor(by1), this.env.height)]);
    const bx2 = this.x - 2 * Math.cos(this.heading);
    const by2 = this.y - 2 * Math.sin(this.heading);
    cells.push([mod(Math.floor(bx2), this.env.width), mod(Math.floor(by2), this.env.height)]);
    return cells;
  }

  getPersonalSpaceCells() {
    const bodyCells = this.getBodyCells();
    const personal = new Set();
    for (const [cx, cy] of bodyCells) {
      // cx, cy are now integer indices after getBodyCells uses Math.floor for indexing
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= 2) {
            const nx = mod(cx + dx, this.env.width);
            const ny = mod(cy + dy, this.env.height);
            if (!bodyCells.some(([bx, by]) => bx === nx && by === ny)) {
              personal.add(`${nx},${ny}`);
            }
          }
        }
      }
    }
    return Array.from(personal).map(coord => coord.split(',').map(Number));
  }

  senseLocalTemperature() {
    const bodyCells = this.getBodyCells();
    const personalCells = this.getPersonalSpaceCells();
    const temps = [
      ...bodyCells.map(([x, y]) => this.env.getLocalTemperature(x, y)),
      ...personalCells.map(([x, y]) => this.env.getLocalTemperature(x, y) * 0.5)
    ];
    return temps.length ? Math.max(...temps) : this.env.ambientTemperature;
  }

  getNearestAgentDistance() {
    let minDist = Infinity;
    let nearestAgent = null;
    for (const other of this.allAgents) {
      if (other.id !== this.id) {
        const dist = this.toroidalDistance(this.x, this.y, other.x, other.y);
        if (dist < minDist) {
          minDist = dist;
          nearestAgent = other;
        }
      }
    }
    return [minDist, nearestAgent];
  }

  getNearbyAgentsCount() {
    let count = 0;
    for (const other of this.allAgents) {
      if (other.id !== this.id) {
        const dist = this.toroidalDistance(this.x, this.y, other.x, other.y);
        if (dist <= 3) {
          count++;
        }
      }
    }
    return count;
  }

  toroidalDistance(x1, y1, x2, y2) {
    let dx = Math.abs(x1 - x2);
    let dy = Math.abs(y1 - y2);
    dx = Math.min(dx, this.env.width - dx);
    dy = Math.min(dy, this.env.height - dy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // **UPDATED**: calculatePain now uses continuous quill reach so quills cause pain before integer-grid overlap
  // and spine strength is directional: head has no spine, back has most spine.
  calculatePain(otherAgents) {
    this.pain = 0;
    const BODY_SIZE = 3; // kept for scaling to retain similar magnitude
    // helper: continuous body radius and quill extra based on spines
    const getBodyRadius = () => 0.6; // tuneable
    const quillExtraFor = (entity) => 0.25 * entity.spineSize * (entity.spineNumber / 10);
    for (const agent of otherAgents) {
      if (agent === this) continue;
      // compute shortest toroidal vector between centers (this -> agent)
      let dx = agent.x - this.x;
      let dy = agent.y - this.y;
      if (Math.abs(dx) > this.env.width / 2) dx -= Math.sign(dx) * this.env.width;
      if (Math.abs(dy) > this.env.height / 2) dy -= Math.sign(dy) * this.env.height;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // compute where contact is relative to each agent's heading
      // angle from this -> agent
      const angleToAgent = Math.atan2(dy, dx);
      let relOnThis = angleToAgent - this.heading;
      relOnThis = ((relOnThis + Math.PI) % (2 * Math.PI)) - Math.PI; // normalize to [-pi,pi]
      // angle from agent -> this
      const angleToThisFromAgent = Math.atan2(-dy, -dx);
      let relOnAgent = angleToThisFromAgent - agent.heading;
      relOnAgent = ((relOnAgent + Math.PI) % (2 * Math.PI)) - Math.PI; // normalize
      // directional spine modifier: 0 at head (front), 1 at back, smooth in-between
      // using (1 - cos(theta))/2 produces: theta=0 -> 0 (front no spine), theta=pi -> 1 (back max spine)
      const dirModThis = (1 - Math.cos(relOnThis)) / 2;
      const dirModAgent = (1 - Math.cos(relOnAgent)) / 2;
      // effective quill reach for each agent (body radius + directional extra)
      const myQuill = getBodyRadius() + quillExtraFor(this) * dirModThis;
      const otherQuill = getBodyRadius() + quillExtraFor(agent) * dirModAgent;
      const quillThresh = myQuill + otherQuill;
      const bodyThresh = getBodyRadius() + getBodyRadius();
      // if within quill reach, produce pain (quill-contact), stronger when bodies overlap
      if (dist < quillThresh) {
        // depth into quill zone (0..1)
        const depth = Math.max(0, (quillThresh - dist) / quillThresh);
        // scale pain: closer => higher; body overlap stronger
        const overlapFactor = dist < bodyThresh ? 1.0 : 0.5;
        // spine effect uses the *other* agent's spine density *and* directional modifier (spines on other's back hurt more)
        //const directionalSpineEffect = (agent.spineNumber / 15) * agent.spineSize * dirModAgent;
        const directionalSpineEffect = (agent.spineNumber) * agent.spineSize * dirModAgent;
        let painIncrease = (1 - this.painTolerance) * (BODY_SIZE * depth) * overlapFactor * directionalSpineEffect;
        // clamp per-step contribution
        painIncrease = Math.max(0, Math.min(0.3, painIncrease));
        this.pain += painIncrease;
        // temperature exchange: stronger when very close, weaker when quill-only
        if (dist < bodyThresh + 0.2) {
          if (this.bodyHeat > agent.bodyHeat) {
            this.bodyHeat = this.bodyHeat * 0.9;
            agent.bodyHeat = agent.bodyHeat * 1.1;
          } else if (this.bodyHeat < agent.bodyHeat) {
            this.bodyHeat = this.bodyHeat * 1.1;
            agent.bodyHeat = agent.bodyHeat * 0.9;
          }
        } else {
          // milder nudge when quill-only
          const avg = (this.bodyHeat + agent.bodyHeat) / 2;
          this.bodyHeat = this.bodyHeat + 0.01 * (avg - this.bodyHeat) * (1 - this.painTolerance);
          agent.bodyHeat = agent.bodyHeat + 0.01 * (avg - agent.bodyHeat) * (1 - agent.painTolerance);
        }
      }
    }
    this.pain = Math.max(0, Math.min(1, this.pain));
  }

  getPainColor() {
    if (this.painTolerance <= 0.3) return [255, 0, 0]; // red for low (0, 0.3]
    else if (this.painTolerance < 0.7) return [0, 0, 255]; // blue for medium (0.3, 0.7)
    else return [0, 100, 0]; // dark green for high [0.7, 1]
  }

  updatePreferredRange() {
    this.preferredHeatMin = 35;
    this.preferredHeatMax = 39;
  }

  computeReward(sensedTemp, nearbyAgentsCount) {
    //const painReward = -this.pain * (1 - this.painTolerance);
    const painReward = -5 * this.pain * (1 - this.painTolerance);
    const midPoint = (this.preferredHeatMin + this.preferredHeatMax) / 2;
    let tempReward;
    if (this.bodyHeat >= this.preferredHeatMin && this.bodyHeat <= this.preferredHeatMax) {
      //tempReward = 2 * (1 - Math.abs(this.bodyHeat - midPoint) / ((this.preferredHeatMax - this.preferredHeatMin) / 2));
      tempReward = 5 * (1 - Math.abs(this.bodyHeat - midPoint) / ((this.preferredHeatMax - this.preferredHeatMin) / 2));
    } else {
      tempReward = -2 * Math.abs(this.bodyHeat - midPoint) * (1 - this.coldTolerance);
    }
    tempReward = Math.max(-5, Math.min(5, tempReward));
    const totalReward = painReward + tempReward;
    return this.useQLearning ? [totalReward, painReward, tempReward] : [null, null, null];
  }

  senseWarmestDirection() {
    const directions = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
    let maxTemp = -Infinity;
    let warmestDirection = this.heading;
    const lookAheadDistance = 3;
    for (const angle of directions) {
      const testX = this.x + lookAheadDistance * Math.cos(angle);
      const testY = this.y + lookAheadDistance * Math.sin(angle);
      const temp = this.env.getLocalTemperature(testX, testY);
      if (temp > maxTemp) {
        maxTemp = temp;
        warmestDirection = angle;
      }
    }
    return warmestDirection;
  }

  moveTowardWarmest() {
    const targetHeading = this.senseWarmestDirection();
    let headingDiff = targetHeading - this.heading;
    headingDiff = ((headingDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    this.heading += Math.min(Math.max(headingDiff, -0.2), 0.2);
  }

  decideMovement(algorithm) {
    // at top of decideMovement(algorithm) — right after sensing and before any decisions:
    this.stopMovement = false;
    const sensedTemp = this.senseLocalTemperature();
    this.calculatePain(this.allAgents);
    const nearbyAgentsCount = this.getNearbyAgentsCount();
    const [minDist, nearestAgent] = this.getNearestAgentDistance();
    this.updatePreferredRange();
    //const coldThreshold = 34 - 30 * this.coldTolerance ** 2; // Low tol: ~35°C (feels cold fast), High tol: ~5°C (feels cold late)
    const coldThreshold = 29 - 25 * this.coldTolerance ** 2; // Lowered: Low tol: ~30°C, High tol: ~4°C
    // Deterministic stop: sigmoid as soft threshold for reproducibility
    const painRatio = this.pain / this.painTolerance; // 0-∞, normalized to tolerance
    const stopProb = 1 / (1 + Math.exp(2 * (painRatio - 0.7))); // Sigmoid: >0.5 when painRatio<0.7
    //const coldFactor = this.env.ambientTemperature < this.preferredHeatMin //? 1 : 0;
    //const feelingCold = (this.bodyHeat <= coldThreshold);
    const heatSafe = this.bodyHeat >= this.preferredHeatMin && this.bodyHeat <= this.preferredHeatMax;
    // Before 10 steps: stopMovement always false; after 10 steps: use normal stop condition
    this.stopMovement = (this.env && this.env.timeStep < 10)
      ? false
      : (heatSafe && (stopProb > 0.5));
    //this.stopMovement = heatSafe && (stopProb > 0.5) && !feelingCold //coldFactor//(stopProb * coldFactor > 0.5); // Stop if "prob" >50% threshold (equiv to original ~70% pain cutoff)
    //console.log(`Agent ${this.id} decideMovement -> bodyHeat=${this.bodyHeat.toFixed(2)}, ambient=${this.env.ambientTemperature}, heatSafe=${(this.bodyHeat>=this.preferredHeatMin && this.bodyHeat<=this.preferredHeatMax)}, pain=${this.pain.toFixed(3)}, painTol=${this.painTolerance}, stopProb=${stopProb.toFixed(3)}, stopMovement=${this.stopMovement}`);
    if (this.stopMovement) {
      return [null, null, null];
    }
    if (this.useQLearning && this.qAgent && algorithm === 'q_learning') {
      const state = this.qAgent.getState(sensedTemp - this.bodyHeat, this.pain);
      let action;
      if (this.bodyHeat <= coldThreshold && this.env.ambientTemperature < this.preferredHeatMin) {
        this.moveTowardWarmest();
        action = this.qAgent.chooseAction(state);
      } else {
        action = this.qAgent.chooseAction(state);
      }
      if (action === 0) this.heading -= 0.1;
      else if (action === 1) this.heading += 0.1;
      else if (action === 2) this.move(true);
      else if (action === 3) this.move(false);
      const [reward, painReward, tempReward] = this.computeReward(sensedTemp, nearbyAgentsCount);
      const nextSensedTemp = this.senseLocalTemperature();
      const nextState = this.qAgent.getState(nextSensedTemp - this.bodyHeat, this.pain);
      this.qAgent.update(state, action, reward, nextState);
      return [reward, painReward, tempReward];
    } else {
      if (painRatio > 0.7) {
        if (nearestAgent) {
          let dx = this.x - nearestAgent.x;
          let dy = this.y - nearestAgent.y;
          if (Math.abs(dx) > this.env.width / 2) dx -= Math.sign(dx) * this.env.width;
          if (Math.abs(dy) > this.env.height / 2) dy -= Math.sign(dy) * this.env.height;
          const awayAngle = Math.atan2(dy, dx);
          let headingDiff = awayAngle - this.heading;
          headingDiff = ((headingDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
          this.heading += Math.min(Math.max(headingDiff, -0.5), 0.5);
          this.move(true);
        } else {
        this.heading += Math.random() * 0.1 - 0.05;
        this.move(true);
        }
      } else if (this.env.ambientTemperature < this.preferredHeatMin) {
        this.moveTowardWarmest();
        this.move(true);
      } else {
        // Always add small warmth bias during wander
        //const warmestDir = this.senseWarmestDirection();
        //let biasDiff = warmestDir - this.heading;
        //biasDiff = ((biasDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
        //this.heading += 0.01 * biasDiff;
        this.heading += Math.random() * 0.1 - 0.05;
        this.move(true);
      }
      return [null, null, null];
    }
  }

  move(forward = true) {
    if (this.stopMovement) return;
    const direction = forward ? 1 : -1;
    this.x = mod(this.x + direction * this.speed * Math.cos(this.heading), this.env.width);
    this.y = mod(this.y + direction * this.speed * Math.sin(this.heading), this.env.height);
  }

  update(deltaAmbient, baseAmbientTemp, algorithm) {
    this.bodyHeat += deltaAmbient;
    const sensedTemp = this.senseLocalTemperature();
    const nearbyAgentsCount = this.getNearbyAgentsCount();
  
    if (this.env.ambientTemperature < this.preferredHeatMin) {
      const toleranceScaled = 1 / (1 + Math.exp(1 * (this.coldTolerance - 0.5))); // Sigmoid: high k (fast cool) for low tol, low k for high tol
      const k = 0.001 * toleranceScaled; // Increase base to 0.005 for faster cooling
      this.bodyHeat = this.bodyHeat - k * (this.bodyHeat - this.env.ambientTemperature);
    }
    this.bodyHeat = Math.min(this.preferredHeatMax, Math.max(this.env.ambientTemperature, this.bodyHeat + (sensedTemp - this.bodyHeat) * this.coldTolerance * 0.1));
    if (nearbyAgentsCount > 0) {
      this.bodyHeat = Math.min(this.preferredHeatMax, this.bodyHeat + nearbyAgentsCount * 0.8 * (1 + this.coldTolerance));
      //this.bodyHeat = Math.min(this.preferredHeatMax, this.bodyHeat + nearbyAgentsCount * 0.5 * (1 + this.coldTolerance));
    }
    const result = this.decideMovement(algorithm);
  
    for (const [x, y] of this.getBodyCells()) {
      this.env.increaseLocalTemperature(x, y, 0.01);
    }
    for (const [x, y] of this.getPersonalSpaceCells()) {
      this.env.increaseLocalTemperature(x, y, 0.005);
    }
    return result;
  }
}

export { mod, Environment, Agent };
