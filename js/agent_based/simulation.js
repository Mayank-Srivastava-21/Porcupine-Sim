import { Environment, Agent } from './environment.js';
import { csvData, graphData, currentAlgorithm, currentStep, animationFrameId, agentParams, labelPositions, popupState, setCurrentAlgorithm, setCurrentStep, setAnimationFrameId } from './globals.js';
import { renderFrame, showSimulationCompletePopup, updateLegends, drawGraph, drawPainHistoryChart } from './visualization.js';
import { validateForm, parameterMode } from './ui.js';
console.log("simulation.js loaded, currentAlgorithm imported:", currentAlgorithm);
let iterationData = [];
let iterationStatus = [];
let startTime = null;
let timerInterval = null;
let latestFrame = null;
let timeoutId = null;
let lastUpdateTime = null;
let selectedAgentId = null;
let currentIteration = 1;
let isRunning = false;
function updateIterationStatusTable(iteration, status, timeTaken = null, blob = null) {
  try {
    console.log(`Updating table: iteration=${iteration}, status=${status}, timeTaken=${timeTaken}, blob=${!!blob}`);
    const existing = iterationStatus.find(item => item.iteration === iteration);
    if (existing) {
      existing.status = status;
      if (timeTaken !== null) {
        if (timeTaken >= 60) {
          const minutes = Math.floor(timeTaken / 60);
          const seconds = (timeTaken % 60).toFixed(2);
          existing.timeTaken = `${minutes}m ${seconds}s`;
        } else {
          existing.timeTaken = timeTaken.toFixed(2) + 's';
        }
      }
      existing.blob = blob || existing.blob;
    } else {
      let formattedTime = 'N/A';
      if (timeTaken !== null) {
        if (timeTaken >= 60) {
          const minutes = Math.floor(timeTaken / 60);
          const seconds = (timeTaken % 60).toFixed(2);
          formattedTime = `${minutes}m ${seconds}s`;
        } else {
          formattedTime = timeTaken.toFixed(2) + 's';
        }
      }
      iterationStatus.push({
        iteration,
        status,
        timeTaken: formattedTime,
        blob
      });
    }
    const table = document.getElementById("iterationStatusTable");
    if (!table) {
      console.error("iterationStatusTable not found");
      return;
    }
    const tbody = table.getElementsByTagName("tbody")[0];
    tbody.innerHTML = '';
    iterationStatus.forEach(item => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = item.iteration;
      row.cells[0].setAttribute('aria-label', `Iteration ${item.iteration}`);
      row.insertCell(1).textContent = item.status;
      row.cells[1].setAttribute('aria-label', `Status: ${item.status}`);
      row.insertCell(2).textContent = item.timeTaken;
      row.cells[2].setAttribute('aria-label', `Time taken: ${item.timeTaken}`);
      const downloadCell = row.insertCell(3);
      downloadCell.setAttribute('aria-label', item.blob ? `Download iteration ${item.iteration} data` : 'No download available');
      if (item.blob) {
        const downloadLink = document.createElement("a");
        downloadLink.href = "#";
        downloadLink.textContent = "Click Here";
        downloadLink.className = "download-link";
        downloadLink.onclick = (e) => {
          e.preventDefault();
          console.log(`Downloading zip for iteration ${item.iteration}`);
          const algorithmPrefix = currentAlgorithm === 'q_learning' ? 'RL' : 'Rule';
          const numAgents = parseInt(document.getElementById("numAgents").value);
          const ambientTemp = parseFloat(document.getElementById("ambientTemp").value);
          const tempStr = Number.isInteger(ambientTemp) ? ambientTemp : ambientTemp.toFixed(2).replace('.', '');
          const modeSuffix = parameterMode === 'uniform' ? 'U' : 'NU';
          const fileName = `${algorithmPrefix}_iteration${item.iteration}_${numAgents}${tempStr}${modeSuffix}.zip`;
          saveAs(item.blob, fileName);
        };
        downloadCell.appendChild(downloadLink);
      } else {
        downloadCell.textContent = '';
      }
    });
  } catch (err) {
    console.error("updateIterationStatusTable error:", err);
  }
}
function selectAgent(agentId) {
  selectedAgentId = agentId;
  console.log(`Agent ${agentId} selected`);
  if (latestFrame && document.visibilityState === 'visible') {
    renderFrame(latestFrame); // Force render on agent selection
  }
}
function computeClusterAssignments(agents) {
  const visited = new Set();
  const assignments = [];
  function findCluster(startAgent) {
    const clusterIds = [];
    const stack = [startAgent];
    visited.add(startAgent.id);
    while (stack.length > 0) {
      const current = stack.pop();
      clusterIds.push(current.id);
      for (const other of agents) {
        if (!visited.has(other.id) && other.id !== current.id) {
          const dist = current.toroidalDistance(current.x, current.y, other.x, other.y);
          if (dist <= 3) {
            stack.push(other);
            visited.add(other.id);
          }
        }
      }
    }
    return clusterIds;
  }
  for (const agent of agents) {
    if (!visited.has(agent.id)) {
      const clusterIds = findCluster(agent);
      if (clusterIds.length >= 2) {
        assignments.push({clusterId: assignments.length, agents: clusterIds});
      }
    }
  }
  return assignments;
}
function runSimulation(steps, numAgents, gridWidth, gridHeight, baseAmbientTemp, agentParams, algorithm, callback, iteration = 1, maxIterations = 1) {
  try {
    console.log("Starting runSimulation with params:", { steps, numAgents, gridWidth, gridHeight, baseAmbientTemp, agentParams, algorithm, iteration, maxIterations });
    startTime = performance.now();
    updateIterationStatusTable(iteration, `Iteration ${iteration} running`);
    currentIteration = iteration;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const currentTime = (performance.now() - startTime) / 1000;
      updateIterationStatusTable(iteration, `Iteration ${iteration} running`, currentTime);
    }, 1000);
    const useQLearning = algorithm === 'q_learning';
   
    // Validate agentParams
    if (agentParams.length !== numAgents) {
      throw new Error("Agent parameters length does not match number of agents");
    }
    for (const params of agentParams) {
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
    const env = new Environment(gridWidth, gridHeight, baseAmbientTemp);
    const agents = Array.from({ length: numAgents }, (_, i) => {
      console.log(`Initializing Agent ${i + 1} with params:`, agentParams[i]);
      return new Agent(
        i + 1,
        env,
        agentParams[i].coldTolerance,
        agentParams[i].bodyHeat,
        agentParams[i].painTolerance,
        null,
        useQLearning
      );
    });
    agents.forEach(agent => agent.allAgents = agents);
    latestFrame = null;
    const d_safe = 1.5;
    const groupSumNN = {low: 0, med: 0, high: 0};
    const groupAgents = {low: [], med: [], high: []};
    const violationCounts = new Array(numAgents).fill(0);
    const clusteredCounts = new Array(numAgents).fill(0);
    for (let i = 0; i < numAgents; i++) {
      const ag = agents[i];
      const p = ag.painTolerance;
      const g = p <= 0.3 ? 'low' : p < 0.7 ? 'med' : 'high';
      groupAgents[g].push(ag.id);
    }
    function allAgentsClustered() {
      return agents.every(agent => agent.stopMovement);
    }
    function handleCollisions() {
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const agent1 = agents[i];
          const agent2 = agents[j];
          if (agent1.pain === 0 && agent2.pain === 0 &&
              agent1.bodyHeat >= agent1.preferredHeatMin && agent1.bodyHeat <= agent1.preferredHeatMax &&
              agent2.bodyHeat >= agent2.preferredHeatMin && agent2.bodyHeat <= agent2.preferredHeatMax &&
              env.ambientTemperature >= agent1.preferredHeatMin) {
            continue;
          }
          const aBody = agent1.getBodyCells();
          const bBody = agent2.getBodyCells();
          if (aBody.some(([ax, ay]) => bBody.some(([bx, by]) => ax === bx && ay === by))) {
            const avgHeading = (agent1.heading + agent2.heading) / 2;
            agent1.heading = avgHeading + (Math.random() - 0.5) * 0.1;
            agent2.heading = avgHeading + (Math.random() - 0.5) * 0.1;
          }
        }
      }
    }
    let step = 0;
    let globalMetricsData = [];
    function stepSimulation() {
      if (step >= steps || allAgentsClustered() || !isRunning) {
        const endTime = performance.now();
        const timeTaken = (endTime - startTime) / 1000;
        clearInterval(timerInterval);
        clearTimeout(timeoutId);
        cancelAnimationFrame(animationFrameId);
        setAnimationFrameId(null);
        const frameData = env.getFrameData(agents, step);
        latestFrame = frameData; // Ensure latestFrame is set for final step
        renderFrame(latestFrame); // Render the final frame
        const numClusters = frameData.num_clusters;
        const clusterAssignments = computeClusterAssignments(agents);
        document.getElementById("progress").innerHTML = `<strong>Simulation complete:</strong><br>Steps: ${step} | Iteration: ${iteration}`;
        console.log(`Iteration ${iteration} completed at step ${step}, time taken: ${timeTaken}s`);
        const iterationZip = new window.JSZip();
        const paramCondition = parameterMode === 'uniform' ? 'Uniform distribution' : 'Non-Uniform distribution';
        const algorithmName = algorithm === 'q_learning' ? 'Q-Learning' : 'Rule-Based';
        const configText = `
Simulation Configuration (Iteration ${iteration}):
Algorithm: ${algorithmName}
Number of Agents: ${numAgents}
Grid Width: ${gridWidth}
Grid Height: ${gridHeight}
Cell Size: ${document.getElementById("cellSize").value}
Base Ambient Temperature: ${baseAmbientTemp}
Simulation Steps: ${steps}
Steps Taken: ${step}
Total Clusters Formed: ${numClusters}
Time Taken: ${timeTaken.toFixed(2)} seconds
Parameter Conditions: ${paramCondition}
Agent Parameters:
${agentParams.map((params, i) =>
  `Agent ${i + 1}: Body Heat=${params.bodyHeat.toFixed(2)}, Pain Tolerance=${params.painTolerance.toFixed(2)}, Cold Tolerance=${params.coldTolerance.toFixed(2)}`
).join('\n')}
        `.trim();
        iterationZip.file(`simulation_config_iteration_${iteration}.txt`, configText);
        let clusterText = `Cluster Assignments for Iteration ${iteration}:\n\n`;
        clusterAssignments.forEach(({clusterId, agents: clusterAgentIds}) => {
          const sortedIds = [...clusterAgentIds].sort((a, b) => a - b);
          clusterText += `Cluster ${clusterId + 1}: ${sortedIds.join(', ')}\n`;
          const clusterAgents = sortedIds.map(id => agents.find(a => a.id === id));
          const num = clusterAgents.length;
          const centroidX = clusterAgents.reduce((s, a) => s + a.x, 0) / num;
          const centroidY = clusterAgents.reduce((s, a) => s + a.y, 0) / num;
          const xs = clusterAgents.map(a => a.x).sort((a,b) => a - b);
          const ys = clusterAgents.map(a => a.y).sort((a,b) => a - b);
          const medianX = xs[Math.floor(num / 2)];
          const medianY = ys[Math.floor(num / 2)];
          clusterText += `Centroid: (${centroidX.toFixed(2)}, ${centroidY.toFixed(2)})\n`;
          clusterText += `Median: (${medianX.toFixed(2)}, ${medianY.toFixed(2)})\n`;
          clusterText += `Distances to Centroid and Median:\n`;
          clusterAgents.forEach(agent => {
            const distC = agent.toroidalDistance(agent.x, agent.y, centroidX, centroidY);
            const distM = agent.toroidalDistance(agent.x, agent.y, medianX, medianY);
            clusterText += `Agent ${agent.id}: Centroid ${distC.toFixed(2)}, Median ${distM.toFixed(2)}\n`;
          });
          clusterText += '\n';
        });
        clusterText += `Total Clusters: ${clusterAssignments.length}`;
        clusterText += '\n\n=== PAIN GROUP METRICS ===\n';
        const T = step;
        ['low', 'med', 'high'].forEach(g => {
          const numAg = groupAgents[g].length;
          if (numAg === 0) return;
          const meanNN = groupSumNN[g] / (numAg * T);
          const totalViol = groupAgents[g].reduce((sum, id) => sum + violationCounts[id - 1], 0);
          const avgViolRate = totalViol / (numAg * T);
          const totalClustRatio = groupAgents[g].reduce((sum, id) => sum + (clusteredCounts[id - 1] / T), 0);
          const avgClustRatio = totalClustRatio / numAg;
          const groupName = g === 'low' ? 'Low' : g === 'med' ? 'Medium' : 'High';
          const range = g === 'low' ? '(0, 0.3]' : g === 'med' ? '(0.3, 0.7)' : '[0.7, 1]';
          clusterText += `\n${groupName} Pain Tolerance (${range}):\n`;
          clusterText += `Metric 2.1: Mean Nearest-Neighbor Distance = ${meanNN.toFixed(4)}\n`;
          clusterText += `Metric 2.2: Average Violation Rate = ${avgViolRate.toFixed(4)}\n`;
          clusterText += `Metric 3.1: Average Cluster Membership Ratio = ${avgClustRatio.toFixed(4)}\n`;
          clusterText += '\nPer Agent Details:\n';
          groupAgents[g].forEach(id => {
            const idx = id - 1;
            const violRate = violationCounts[idx] / T;
            const clustRatio = clusteredCounts[idx] / T;
            const ag = agents.find(a => a.id === id);
            clusterText += `Agent ${id} (p=${ag.painTolerance.toFixed(2)}): Violation Rate = ${violRate.toFixed(4)}, Cluster Membership Ratio = ${clustRatio.toFixed(4)}\n`;
          });
        });
        iterationZip.file(`cluster_assignments_iteration_${iteration}.txt`, clusterText);
        const headers = useQLearning ?
          "step,agent_id,x,y,heading,body_heat,pain,is_clustered,cold_tolerance,pain_tolerance,total_reward,pain_reward,temp_reward" :
          "step,agent_id,x,y,heading,body_heat,pain,is_clustered,cold_tolerance,pain_tolerance";
        const csvContent = [headers, ...csvData].join("\n");
        iterationZip.file(`agent_data_iteration_${iteration}.csv`, csvContent);
        const globalMetricsHeaders = "step,average_distance,avg_orientation_diff,num_clusters,average_reward,average_pain_reward,average_temp_reward";
        const globalMetricsContent = [globalMetricsHeaders, ...globalMetricsData].join("\n");
        iterationZip.file(`global_metrics.csv`, globalMetricsContent);
        const canvases = [
          { id: "simulationCanvas", name: `simulation_snapshot_iteration_${iteration}.png`, width: null, height: null },
          { id: "distanceCanvas", name: `distance_chart_iteration_${iteration}.png`, width: 500, height: 200 },
          { id: "painStateCanvas", name: `orientation_diff_chart_iteration_${iteration}.png`, width: 500, height: 200 }
        ];
        if (useQLearning) {
          canvases.push({ id: "rewardCanvas", name: `reward_chart_iteration_${iteration}.png`, width: 500, height: 200 });
        }
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 800;
        tempCanvas.height = 600;
        const maxSteps = steps;
        const promises = canvases.map(({ id, name, width, height }) => {
          return new Promise((resolve) => {
            const canvas = document.getElementById(id);
            if (canvas && (id !== "rewardCanvas" || useQLearning)) {
              if (width && height) {
                const originalWidth = canvas.width;
                const originalHeight = canvas.height;
                canvas.width = width;
                canvas.height = height;
                if (id === "distanceCanvas") {
                  drawGraph(canvas, graphData.distance, "Average Distance", step, maxSteps);
                } else if (id === "painStateCanvas") {
                  drawGraph(canvas, graphData.avg_orientation_diff, "Average Orientation Difference", step, maxSteps);
                } else if (id === "rewardCanvas") {
                  drawGraph(canvas, graphData.total_reward, "Average Total Reward", step, maxSteps, -10, 5);
                }
                const dataURL = canvas.toDataURL("image/png");
                canvas.width = originalWidth;
                canvas.height = originalHeight;
                const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
                iterationZip.file(name, imgData, { base64: true });
                resolve();
              } else {
                // Special handling for simulationCanvas to exclude steps, ambient temp, and clusters
                const ctx = canvas.getContext("2d");
                const originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
                renderFrame(latestFrame, true); // Pass excludeText=true to skip steps, ambient temp, and clusters
                const dataURL = canvas.toDataURL("image/png");
                ctx.putImageData(originalImage, 0, 0); // Restore original canvas content
                const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
                iterationZip.file(name, imgData, { base64: true });
                resolve();
              }
            } else {
              console.warn(`Canvas ${id} not found or skipped`);
              resolve();
            }
          });
        });
        const zoomedCanvases = [
          { id: "distanceCanvas", name: `distance_chart_zoomed_iteration_${iteration}.png`, data: graphData.distance, label: "Average Distance", draw: drawGraph },
          { id: "painStateCanvas", name: `orientation_diff_chart_zoomed_iteration_${iteration}.png`, data: graphData.avg_orientation_diff, label: "Average Orientation Difference", draw: drawGraph }
        ];
        if (useQLearning) {
          zoomedCanvases.push({ id: "rewardCanvas", name: `reward_chart_zoomed_iteration_${iteration}.png`, data: graphData.total_reward, label: "Average Total Reward", draw: (canvas, data, label, step, maxSteps) => drawGraph(canvas, data, label, step, maxSteps, -5, 5) });
        }
        zoomedCanvases.forEach(({ id, name, data, label, draw }) => {
          if (id !== "rewardCanvas" || useQLearning) {
            const promise = new Promise((resolve) => {
              draw(tempCanvas, data, label, step, maxSteps);
              const dataURL = tempCanvas.toDataURL("image/png");
              const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
              iterationZip.file(name, imgData, { base64: true });
              resolve();
            });
            promises.push(promise);
          }
        });
        Promise.all(promises).then(() => {
          iterationZip.generateAsync({ type: "blob" }).then(blob => {
            console.log(`Zip generated for iteration ${iteration}, blob size: ${blob.size}`);
            iterationData.push({
              iteration,
              blob,
              stepsTaken: step,
              numClusters,
              graphData: { ...graphData },
              frame: latestFrame
            });
            updateIterationStatusTable(iteration, `Iteration ${iteration} converges at step ${step}`, timeTaken, blob);
            if (iteration < maxIterations && isRunning) {
              csvData.length = 0;
              graphData.distance = [];
              graphData.total_reward = [];
              graphData.avg_orientation_diff = [];
              setCurrentStep(0);
              setAnimationFrameId(null);
              timeoutId = null;
              Object.keys(labelPositions).forEach(key => delete labelPositions[key]);
              popupState.isOpen = false;
              popupState.canvasId = null;
              popupState.yLabel = null;
              popupState.data = null;
              updateUIVisibility();
              updateLegends(numAgents);
              document.getElementById("progress").textContent = `Starting simulation for iteration ${iteration + 1}...`;
              console.log(`Starting next iteration: ${iteration + 1}`);
              updateIterationStatusTable(iteration + 1, `Iteration ${iteration + 1} running`);
              runSimulation(steps, numAgents, gridWidth, gridHeight, baseAmbientTemp, agentParams, algorithm, callback, iteration + 1, maxIterations);
            } else {
              document.getElementById("startBtn").textContent = "Start Simulation";
              document.getElementById("startBtn").disabled = false;
              isRunning = false;
              setAnimationFrameId(null);
              timeoutId = null;
              selectedAgentId = null;
              currentIteration = 1;
              console.log(`All iterations completed, showing popup for iteration ${iteration}`);
              showSimulationCompletePopup(step, numAgents, steps, numClusters, maxIterations);
              if (callback) callback();
            }
          }).catch(err => {
            console.error(`Error generating zip for iteration ${iteration}:`, err);
            updateIterationStatusTable(iteration, `Iteration ${iteration} failed to generate zip`, timeTaken);
            isRunning = false;
            document.getElementById("startBtn").disabled = false;
            clearInterval(timerInterval);
            setAnimationFrameId(null);
            timeoutId = null;
          });
        }).catch(err => {
          console.error(`Error processing canvases for iteration ${iteration}:`, err);
          updateIterationStatusTable(iteration, `Iteration ${iteration} failed to process canvases`, timeTaken);
          isRunning = false;
          document.getElementById("startBtn").disabled = false;
          clearInterval(timerInterval);
          setAnimationFrameId(null);
          timeoutId = null;
        });
        return;
      }
      env.decayTemperature();
      const csvLines = [];
      const allClustered = allAgentsClustered();
      for (const agent of agents) {
        const [reward, painReward, tempReward] = agent.update(0, baseAmbientTemp, algorithm);
        let csvLine = `${step},${agent.id},${agent.x.toFixed(2)},${agent.y.toFixed(2)},${(agent.heading * 180 / Math.PI).toFixed(2)},${agent.bodyHeat.toFixed(2)},${agent.pain.toFixed(2)},${agent.isClustered ? 1 : 0},${agent.coldTolerance.toFixed(2)},${agent.painTolerance.toFixed(2)}`;
        if (useQLearning) {
          csvLine += `,${(reward || 0).toFixed(2)},${(painReward || 0).toFixed(2)},${(tempReward || 0).toFixed(2)}`;
        }
        csvLines.push(csvLine);
      }
      csvData.push(...csvLines);
      handleCollisions();
      // Compute metrics
      const nnDists = new Array(numAgents).fill(Infinity);
      if (numAgents > 1) {
        for (let i = 0; i < numAgents; i++) {
          const ag1 = agents[i];
          for (let j = 0; j < numAgents; j++) {
            if (i === j) continue;
            const ag2 = agents[j];
            const dist = ag1.toroidalDistance(ag1.x, ag1.y, ag2.x, ag2.y);
            if (dist < nnDists[i]) nnDists[i] = dist;
          }
        }
      } else {
        nnDists.fill(100);
      }
      for (let i = 0; i < numAgents; i++) {
        const ag = agents[i];
        const group = ag.painTolerance <= 0.3 ? 'low' : ag.painTolerance < 0.7 ? 'med' : 'high';
        groupSumNN[group] += nnDists[i];
        if (nnDists[i] < d_safe) violationCounts[i]++;
      }
      const assignments = computeClusterAssignments(agents);
      const clusteredIds = new Set();
      assignments.forEach(cl => cl.agents.forEach(id => clusteredIds.add(id)));
      for (let i = 0; i < numAgents; i++) {
        if (clusteredIds.has(agents[i].id)) clusteredCounts[i]++;
      }
      const frameData = env.getFrameData(agents, step);
      latestFrame = frameData;
      graphData.distance.push(frameData.average_distance);
      graphData.avg_orientation_diff.push(frameData.avg_orientation_diff);
      if (step % 100 === 0 || step === 0) {
        graphData.pain_history = { ...frameData.pain_history };
        // Update graphs to ensure they reflect current data
        if (document.visibilityState === 'visible') {
          const totalSteps = parseInt(document.getElementById("steps").value) || 1000;
          drawGraph(document.getElementById("distanceCanvas"), graphData.distance, "Average Distance", step, totalSteps);
          drawGraph(document.getElementById("painStateCanvas"), graphData.avg_orientation_diff, "Average Orientation Difference", step, totalSteps);
          if (useQLearning) {
            drawGraph(document.getElementById("rewardCanvas"), graphData.total_reward, "Average Total Reward", step, totalSteps, -10, 5);
          }
        }
      }
      if (useQLearning) {
        graphData.total_reward.push(Math.max(-10, Math.min(5, frameData.average_reward)));
        graphData.pain_reward = graphData.pain_reward || [];
        graphData.temp_reward = graphData.temp_reward || [];
        graphData.pain_reward.push(Math.max(-5, Math.min(5, frameData.average_pain_reward)));
        graphData.temp_reward.push(Math.max(-5, Math.min(5, frameData.average_temp_reward)));
        console.log(`Step ${step}: average_reward=${frameData.average_reward.toFixed(2)}, pain_reward=${frameData.average_pain_reward.toFixed(2)}, temp_reward=${frameData.average_temp_reward.toFixed(2)}`);
      }
      let metricLine = `${step},${frameData.average_distance.toFixed(2)},${frameData.avg_orientation_diff.toFixed(2)},${frameData.num_clusters}`;
      if (useQLearning) {
        metricLine += `,${frameData.average_reward.toFixed(2)},${frameData.average_pain_reward.toFixed(2)},${frameData.average_temp_reward.toFixed(2)}`;
      } else {
        metricLine += ',,,';
      }
      globalMetricsData.push(metricLine);
      step++;
      setCurrentStep(step);
    }
    function renderLoop() {
      if (!isRunning) {
        cancelAnimationFrame(animationFrameId);
        setAnimationFrameId(null);
        return;
      }
      if (latestFrame) {
        if (document.visibilityState === 'visible') {
          renderFrame(latestFrame);
          if (selectedAgentId !== null && latestFrame.agents) {
            const selectedAgent = latestFrame.agents.find(agent => agent.id === selectedAgentId);
            if (selectedAgent) {
              const canvas = document.getElementById("simulationCanvas");
              const ctx = canvas.getContext("2d");
              const cellSize = parseInt(document.getElementById("cellSize").value);
              const x = selectedAgent.x * cellSize;
              const y = selectedAgent.y * cellSize - 30;
              ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 1;
              ctx.fillRect(x - 30, y - 30, 60, 40);
              ctx.strokeRect(x - 30, y - 30, 60, 40);
              ctx.fillStyle = "black";
              ctx.font = "12px Arial";
              ctx.textAlign = "center";
              ctx.fillText(`BT: ${selectedAgent.bodyHeat.toFixed(1)}`, x, y - 15);
              ctx.fillText(`P: ${selectedAgent.pain.toFixed(1)}`, x, y);
            }
          }
        }
      }
      setAnimationFrameId(requestAnimationFrame(renderLoop));
    }
    function simulationLoop(timestamp) {
      if (!isRunning) {
        clearTimeout(timeoutId);
        cancelAnimationFrame(animationFrameId);
        setAnimationFrameId(null);
        console.log("Simulation loop stopped: isRunning =", isRunning, "currentStep =", step);
        return;
      }
      if (!lastUpdateTime) lastUpdateTime = timestamp || performance.now();
      const targetTimeStep = 1000 / 120;
      const currentTime = performance.now();
      const elapsed = currentTime - lastUpdateTime;
      const stepsToRun = Math.floor(elapsed / targetTimeStep);
     
      const maxStepsPerFrame = 200;
      const stepsToExecute = Math.min(stepsToRun, maxStepsPerFrame);
      for (let i = 0; i < stepsToExecute && step < steps && !allAgentsClustered(); i++) {
        stepSimulation();
      }
      lastUpdateTime += stepsToExecute * targetTimeStep;
      if (step < steps && !allAgentsClustered()) {
        timeoutId = setTimeout(simulationLoop, 0);
      } else {
        stepSimulation();
      }
    }
    // Add visibility change listener to update UI when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isRunning && latestFrame) {
        renderFrame(latestFrame); // Render the latest frame
        const totalSteps = parseInt(document.getElementById("steps").value) || 1000;
        drawGraph(document.getElementById("distanceCanvas"), graphData.distance, "Average Distance", step, totalSteps);
        drawGraph(document.getElementById("painStateCanvas"), graphData.avg_orientation_diff, "Average Orientation Difference", step, totalSteps);
        if (useQLearning) {
          drawGraph(document.getElementById("rewardCanvas"), graphData.total_reward, "Average Total Reward", step, totalSteps, -10, 5);
        }
        document.getElementById("progress").innerHTML = `<strong>Simulation running:</strong><br>Steps: ${step} | Iteration: ${iteration}`;
      }
    });
    csvData.length = 0;
    graphData.distance = [];
    graphData.total_reward = [];
    graphData.pain_reward = [];
    graphData.temp_reward = [];
    graphData.pain_history = {};
    graphData.avg_orientation_diff = [];
    setCurrentStep(0);
    step = 0;
    latestFrame = null;
    isRunning = true;
    lastUpdateTime = null;
    timeoutId = setTimeout(simulationLoop, 0);
    setAnimationFrameId(requestAnimationFrame(renderLoop));
  } catch (err) {
    console.error("runSimulation error:", err);
    clearInterval(timerInterval);
    clearTimeout(timeoutId);
    cancelAnimationFrame(animationFrameId);
    setAnimationFrameId(null);
    isRunning = false;
    document.getElementById("progress").textContent = "Simulation failed: " + err.message;
    updateIterationStatusTable(iteration, `Iteration ${iteration} failed: ${err.message}`, null);
    document.getElementById("startBtn").textContent = "Start Simulation";
    document.getElementById("startBtn").disabled = false;
  }
}
function startSimulation() {
  try {
    console.log("startSimulation triggered, isRunning:", isRunning, "currentStep:", currentStep);
    if (!validateForm()) {
      console.error("Form validation failed");
      document.getElementById("startBtn").textContent = "Start Simulation";
      document.getElementById("startBtn").disabled = false;
      return;
    }
    if (isRunning) {
      isRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (timeoutId) clearTimeout(timeoutId);
      setAnimationFrameId(null);
      timeoutId = null;
      console.log("Stopped ongoing simulation: timerInterval, animationFrameId, timeoutId cleared");
      document.getElementById("startBtn").textContent = "Start Simulation";
      document.getElementById("startBtn").disabled = false;
      return;
    }
   
    csvData.length = 0;
    graphData.distance = [];
    graphData.total_reward = [];
    graphData.pain_reward = [];
    graphData.temp_reward = [];
    graphData.pain_history = {};
    graphData.avg_orientation_diff = [];
    setCurrentStep(0);
    selectedAgentId = null;
    iterationData = [];
    iterationStatus = [];
    currentIteration = 1;
    latestFrame = null;
    Object.keys(labelPositions).forEach(key => delete labelPositions[key]);
    popupState.isOpen = false;
    popupState.canvasId = null;
    popupState.yLabel = null;
    popupState.data = null;
    console.log("Reset all states: currentStep =", currentStep, "iterationData =", iterationData, "iterationStatus =", iterationStatus);
    const gridWidth = parseInt(document.getElementById("gridWidth").value);
    const gridHeight = parseInt(document.getElementById("gridHeight").value);
    const cellSize = parseInt(document.getElementById("cellSize").value);
    const numAgents = parseInt(document.getElementById("numAgents").value);
    const steps = parseInt(document.getElementById("steps").value);
    const baseAmbientTemp = Math.max(-25, Math.min(40, parseFloat(document.getElementById("ambientTemp").value)));
    const iterations = parseInt(document.getElementById("iterations").value);
    const simCanvas = document.getElementById("simulationCanvas");
    simCanvas.width = gridWidth * cellSize;
    simCanvas.height = gridHeight * cellSize;
    const distanceCanvas = document.getElementById("distanceCanvas");
    const painStateCanvas = document.getElementById("painStateCanvas");
    const rewardCanvas = document.getElementById("rewardCanvas");
    distanceCanvas.width = painStateCanvas.width = rewardCanvas.width = 500;
    distanceCanvas.height = painStateCanvas.height = rewardCanvas.height = 200;
    setCurrentAlgorithm(document.getElementById("algorithm").value);
    updateUIVisibility();
    updateLegends(numAgents);
    document.getElementById("progress").textContent = `Starting simulation for iteration 1...`;
    updateIterationStatusTable(1, `Iteration 1 running`);
    document.getElementById("startBtn").textContent = "Stop Simulation";
    document.getElementById("startBtn").disabled = false;
    console.log("Starting new simulation: currentAlgorithm =", currentAlgorithm, "iterations =", iterations);
    runSimulation(steps, numAgents, gridWidth, gridHeight, baseAmbientTemp, agentParams, currentAlgorithm, () => {
      document.getElementById("startBtn").textContent = "Start Simulation";
      document.getElementById("startBtn").disabled = false;
      isRunning = false;
      console.log("Simulation callback: enabled startBtn, isRunning =", isRunning);
    }, 1, iterations);
  } catch (err) {
    console.error("startSimulation error:", err);
    document.getElementById("progress").textContent = "Failed to start simulation: " + err.message;
    document.getElementById("startBtn").textContent = "Start Simulation";
    document.getElementById("startBtn").disabled = false;
    isRunning = false;
    if (timerInterval) clearInterval(timerInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (timeoutId) clearTimeout(timeoutId);
    setAnimationFrameId(null);
    timeoutId = null;
    console.log("startSimulation error cleanup: isRunning =", isRunning);
  }
}
function updateUIVisibility() {
  try {
    const isQLearning = currentAlgorithm === 'q_learning';
    document.getElementById("rewardCanvas").classList.toggle('hidden', !isQLearning);
    document.getElementById("rewardTable").classList.toggle('hidden', !isQLearning);
    document.getElementById("rewardZoom").classList.toggle('hidden', !isQLearning);
    document.getElementById("rewardDownload").classList.toggle('hidden', !isQLearning);
  } catch (err) {
    console.error("updateUIVisibility error:", err);
  }
}
export { startSimulation, updateUIVisibility, latestFrame, selectAgent, iterationData }; 