import { csvData, graphData, currentAlgorithm, currentStep, agentParams, labelPositions, popupState } from './globals.js';
import { latestFrame, iterationData, selectAgent } from './simulation.js';

function renderFrame(frame, excludeText = false) {
  try {
    console.log("Rendering frame:", frame, "excludeText:", excludeText);
    const simCanvas = document.getElementById("simulationCanvas");
    if (!simCanvas || !simCanvas.getContext) {
      console.error("Simulation canvas not found or not accessible");
      throw new Error("Simulation canvas not found");
    }
    const ctx = simCanvas.getContext("2d");
    const maxSteps = parseInt(document.getElementById("steps").value) || 1000;
    const maxIterations = parseInt(document.getElementById("iterations").value) || 1;
    const progressElement = document.getElementById("progress");
    if (!progressElement) {
      console.error("Progress element not found");
      throw new Error("Progress element not found");
    }

    if (!frame || !frame.local_temperatures || !frame.agents) {
      console.error("Invalid simulation frame data:", frame);
      progressElement.textContent = "Invalid frame data";
      return;
    }

    const gridWidth = frame.local_temperatures.length;
    const gridHeight = frame.local_temperatures[0].length;
    const cellSize = simCanvas.width / gridWidth;

    ctx.clearRect(0, 0, simCanvas.width, simCanvas.height);

    // Draw temperature grid
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        const temp = frame.local_temperatures[x][y];
        const ambientTemp = frame.ambientTemperature;
        const range = 10;
        let delta = temp - ambientTemp;
        let factor = Math.abs(delta) / range;
        let color;
        if (delta < 0) {
          let r = Math.floor(255 * (1 - factor));
          let g = Math.floor(255 * (1 - factor));
          let b = Math.floor(255 * (1 - factor) + 255 * factor);
          color = `rgb(${r},${g},${b})`;
        } else if (delta > 0) {
          let r = 255;
          let g = Math.floor(255 * (1 - factor));
          let b = Math.floor(255 * (1 - factor));
          color = `rgb(${r},${g},${b})`;
        } else {
          color = "rgb(255,255,255)";
        }
        ctx.fillStyle = color;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    for (let x = 0; x <= gridWidth; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, gridHeight * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= gridHeight; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(gridWidth * cellSize, y * cellSize);
      ctx.stroke();
    }

    // Draw agents with pain-tolerance-based colors and variable sizes
    frame.agents.forEach(agent => {
      ctx.save();
      let px = agent.x * cellSize;
      let py = agent.y * cellSize;
      ctx.translate(px, py);
      ctx.rotate(agent.heading * Math.PI / 180);

      // Use the color from frame data (RGB array converted to CSS color)
      const agentColor = `rgb(${agent.color[0]},${agent.color[1]},${agent.color[2]})`;
      const sizeFactor = 1;

      ctx.fillStyle = agentColor;
      ctx.beginPath();
      ctx.moveTo(0, 0); // Head at (0, 0), corresponding to (agent.x, agent.y)
      ctx.lineTo(cellSize * sizeFactor / 2, cellSize * sizeFactor); // Base vertex 1
      ctx.lineTo(-cellSize * sizeFactor / 2, cellSize * sizeFactor); // Base vertex 2
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "cyan";
      ctx.beginPath();
      ctx.arc(0, 0, 1.5 * sizeFactor, 0, 2 * Math.PI); // Cyan dot at head
      ctx.fill();

      ctx.restore();
    });

    // Draw step number, ambient temperature, and clusters only if excludeText is false
    if (!excludeText) {
      ctx.fillStyle = "black";
      ctx.font = "16px Arial";
      ctx.fillText(`Step: ${frame.step}`, 10, 20);
      ctx.textAlign = "right";
      ctx.fillText(`Ambient Temp: ${frame.ambientTemperature.toFixed(2)}°C`, simCanvas.width - 10, 20);
      ctx.fillText(`Clusters: ${frame.num_clusters || 0}`, simCanvas.width - 10, 40);
      ctx.textAlign = "left";
    }

    // Render pain tolerance legend below iteration status table
    renderPainLegend();

    const isQLearning = currentAlgorithm === 'q_learning';
    const totalRewardElement = document.getElementById("totalReward");
    const painRewardElement = document.getElementById("painReward");
    const tempRewardElement = document.getElementById("tempReward");
    if (!totalRewardElement || !painRewardElement || !tempRewardElement) {
      console.error("Reward elements missing:", {
        totalReward: !!totalRewardElement,
        painReward: !!painRewardElement,
        tempReward: !!tempRewardElement
      });
      throw new Error("Reward elements not found");
    }

    if (isQLearning) {
      const totalReward = Number.isFinite(frame.average_reward) ? frame.average_reward.toFixed(2) : 'N/A';
      const painReward = Number.isFinite(frame.average_pain_reward) ? frame.average_pain_reward.toFixed(2) : 'N/A';
      const tempReward = Number.isFinite(frame.average_temp_reward) ? frame.average_temp_reward.toFixed(2) : 'N/A';
      totalRewardElement.textContent = totalReward;
      painRewardElement.textContent = painReward;
      tempRewardElement.textContent = tempReward;
    } else {
      totalRewardElement.textContent = '0.00';
      painRewardElement.textContent = '0.00';
      tempRewardElement.textContent = '0.00';
    }

    //changed
    //graphData.distance.push(frame.average_distance || 0);

    const distanceCanvas = document.getElementById("distanceCanvas");
    const painStateCanvas = document.getElementById("painStateCanvas");
    const rewardCanvas = document.getElementById("rewardCanvas");
    const clustersCanvas = document.getElementById("clustersCanvas");
    if (!distanceCanvas || !painStateCanvas || !rewardCanvas || !clustersCanvas) {
      console.error("Canvas elements missing:", {
        distanceCanvas: !!distanceCanvas,
        painStateCanvas: !!painStateCanvas,
        rewardCanvas: !!rewardCanvas,
        clustersCanvas: !!clustersCanvas
      });
      throw new Error("One or more required canvas elements not found");
    }

    drawGraph(distanceCanvas, graphData.distance, "Average Distance", frame.step, maxSteps);
    drawGraph(painStateCanvas, graphData.avg_orientation_diff, "Average Orientation Difference", frame.step, maxSteps);
    if (isQLearning) {
      drawGraph(rewardCanvas, graphData.total_reward, "Average Total Reward", frame.step, maxSteps, -10, 5);
    }
    if (maxIterations > 1) {
      drawGraph(clustersCanvas, graphData.num_clusters, "Clusters", frame.iteration || maxIterations, maxIterations);
    }

    if (popupState.isOpen) {
      const popupCanvas = document.getElementById("graphPopupCanvas");
      if (!popupCanvas) {
        console.error("Popup canvas not found");
        throw new Error("Popup canvas not found");
      }
      const minY = popupState.canvasId === "rewardCanvas" ? -10 : popupState.canvasId === "clustersCanvas" ? 0 : undefined;
      const maxY = popupState.canvasId === "rewardCanvas" ? 5 : undefined;
      const step = popupState.canvasId === "clustersCanvas" ? (frame.iteration || maxIterations) : frame.step;
      const max = popupState.canvasId === "clustersCanvas" ? maxIterations : maxSteps;
      drawGraph(popupCanvas, popupState.data, popupState.yLabel, step, max, minY, maxY);
    }

    progressElement.textContent = `Running simulation: Step ${frame.step}/${maxSteps}`;
  } catch (err) {
    console.error("Render error:", err);
    progressElement.textContent = "Visualization failed: " + err.message;
  }
}

function renderPainLegend() {
  try {
    const legendCanvas = document.getElementById("painLegendCanvas");
    if (!legendCanvas || !legendCanvas.getContext) {
      console.error("Pain legend canvas not found or not accessible");
      return;
    }
    const ctx = legendCanvas.getContext("2d");
    ctx.clearRect(0, 0, legendCanvas.width, legendCanvas.height);

    const painToleranceCategories = [
      { name: "Low Pain Tolerance", color: "#FF0000", range: "(0, 0.3]" },
      { name: "Medium Pain Tolerance", color: "#0000FF", range: "(0.3, 0.7)" },
      { name: "High Pain Tolerance", color: "#006400", range: "[0.7, 1]" }
    ];

    let fontSize = 13.3;
    ctx.font = `${fontSize}px sans-serif`;
    const prefix = "Pain Tolerance Levels: ";
    const separator = " | ";
    const categoryStrings = painToleranceCategories.map(category => `${category.name} (${category.range})`);
    const fullText = `${prefix}${categoryStrings.join(separator)}`;
    let totalWidth = ctx.measureText(fullText).width;

    // Adjust font size if the text exceeds canvas width (502px - 20px padding)
    const maxWidth = legendCanvas.width - 20;
    while (totalWidth > maxWidth && fontSize > 10) {
      fontSize -= 1;
      ctx.font = `${fontSize}px sans-serif`;
      totalWidth = ctx.measureText(fullText).width;
    }

    let currentX = 10; // Start with 10px padding
    const yPosition = 20; // Center vertically in 30px height canvas

    // Draw "Pain Tolerance Levels:"
    ctx.fillStyle = "black";
    ctx.fillText(prefix, currentX, yPosition);
    currentX += ctx.measureText(prefix).width;

    // Draw each pain tolerance category with color square
    painToleranceCategories.forEach((category, index) => {
      // Draw color square
      ctx.fillStyle = category.color;
      ctx.fillRect(currentX, yPosition - 10, 10, 10);
      currentX += 15; // Space after square

      // Draw category text
      ctx.fillStyle = "black";
      ctx.fillText(categoryStrings[index], currentX, yPosition);
      currentX += ctx.measureText(categoryStrings[index]).width;

      // Draw separator (except for the last category)
      if (index < painToleranceCategories.length - 1) {
        ctx.fillText(separator, currentX, yPosition);
        currentX += ctx.measureText(separator).width;
      }
    });
  } catch (err) {
    console.error("renderPainLegend error:", err);
  }
}

function drawGraph(canvas, graphData, yLabel, currentStep, maxSteps, minY, maxY) {
  try {
    if (!canvas || !canvas.getContext) {
      console.error(`Canvas is null or invalid for ${yLabel}`);
      throw new Error(`Invalid canvas for ${yLabel}`);
    }
    if (!graphData || !Array.isArray(graphData)) {
      console.warn(`Invalid or missing graphData for ${yLabel}, skipping graph drawing`);
      const gctx = canvas.getContext("2d");
      gctx.fillStyle = "black";
      gctx.font = "14px sans-serif";
      gctx.fillText(`No valid ${yLabel} data available`, 40, canvas.height / 2);
      return;
    }
    console.log(`Drawing graph on ${canvas.id || 'unknown'} with data length:`, graphData.length, `yLabel: ${yLabel}, minY: ${minY}, maxY: ${maxY}`);
    const gctx = canvas.getContext("2d");
    gctx.save();
    gctx.clearRect(0, 0, canvas.width, canvas.height);
    gctx.fillStyle = "white";
    gctx.fillRect(0, 0, canvas.width, canvas.height);
    const padding = 40;
    const graphWidth = canvas.width - 2 * padding;
    const graphHeight = canvas.height - 2 * padding;

    if (graphData.length === 0) {
      gctx.fillStyle = "black";
      gctx.font = "14px sans-serif";
      gctx.fillText(`No ${yLabel} data available`, padding, padding + graphHeight / 2);
      gctx.restore();
      return;
    }

    // Sample data for large datasets to prevent rendering issues
    const maxPoints = 1000;
    let sampledData = graphData;
    if (graphData.length > maxPoints) {
      const step = Math.ceil(graphData.length / maxPoints);
      sampledData = [];
      for (let i = 0; i < graphData.length; i += step) {
        sampledData.push(graphData[i]);
      }
    }
    const filteredData = sampledData.filter(val => Number.isFinite(val));

    let minVal, maxVal;
    if (yLabel === "Average Total Reward" && minY !== undefined && maxY !== undefined) {
      minVal = minY;
      maxVal = maxY;
    } else if (yLabel === "Clusters" && minY !== undefined) {
      minVal = minY;
      maxVal = filteredData.length ? Math.max(...filteredData, 1) : 1;
    } else if (filteredData.length) {
      minVal = Math.min(...filteredData);
      maxVal = Math.max(...filteredData);
      if (yLabel === "Average Distance" || yLabel === "Average Orientation Difference" || yLabel === "Clusters") {
        minVal = Math.max(0, minVal);
      }
      const minRange = Math.max(0.1, (maxVal - minVal) * 0.1);
      if (maxVal - minVal < minRange) {
        const mid = (maxVal + minVal) / 2;
        minVal = mid - minRange / 2;
        maxVal = mid + minRange / 2;
      }
      const rangePadding = (maxVal - minVal) * 0.1;
      minVal -= rangePadding;
      if (yLabel === "Average Distance" || yLabel === "Average Orientation Difference" || yLabel === "Clusters") {
        minVal = Math.max(0, minVal);
      }
      maxVal += rangePadding;
    } else {
      if (yLabel === "Average Distance" || yLabel === "Average Orientation Difference" || yLabel === "Clusters") {
        minVal = 0;
        maxVal = 1;
      } else if (yLabel === "Average Total Reward") {
        minVal = -5;
        maxVal = 5;
      }
    }

    const range = maxVal - minVal || 1;

    gctx.strokeStyle = "#888";
    gctx.beginPath();
    gctx.moveTo(padding, padding);
    gctx.lineTo(padding, padding + graphHeight);
    gctx.stroke();
    gctx.beginPath();
    gctx.moveTo(padding, padding + graphHeight);
    gctx.lineTo(padding + graphWidth, padding + graphHeight);
    gctx.stroke();

    gctx.fillStyle = "black";
    gctx.font = "12px sans-serif";
    gctx.save();
    gctx.translate(padding - 30, padding + graphHeight / 2);
    gctx.rotate(-Math.PI / 2);
    gctx.fillText(yLabel, 0, 0);
    gctx.restore();

    gctx.fillText(yLabel === "Clusters" ? "Iterations" : "Time Steps", padding + graphWidth / 2 - 30, padding + graphHeight + 30);

    gctx.fillStyle = "black";
    gctx.font = "10px sans-serif";
    const maxVisibleTicks = 8;
    const effectiveMaxSteps = Math.min(currentStep, maxSteps);
    const xTickInterval = yLabel === "Clusters" ? 1 : effectiveMaxSteps > 100000 ? Math.ceil(effectiveMaxSteps / 6000) * 1000 : effectiveMaxSteps > 600 ? Math.ceil(effectiveMaxSteps / 600) * 100 : 100;
    const ticks = [];
    for (let step = 0; step <= effectiveMaxSteps; step += xTickInterval) {
      if (step <= currentStep) {
        ticks.push(step);
      }
    }
    if (!ticks.includes(currentStep) && currentStep <= effectiveMaxSteps) {
      ticks.push(currentStep);
    }
    ticks.sort((a, b) => a - b);

    const visibleTicks = ticks.slice(0, maxVisibleTicks);
    visibleTicks.forEach(step => {
      const normalizedStep = step / (effectiveMaxSteps || 1);
      const x = padding + normalizedStep * graphWidth;
      gctx.fillText(Math.round(step), x - 20, padding + graphHeight + 20);
      gctx.beginPath();
      gctx.moveTo(x, padding + graphHeight);
      gctx.lineTo(x, padding + graphHeight + 5);
      gctx.stroke();
    });

    gctx.fillStyle = "black";
    gctx.font = "10px sans-serif";
    const tickCount = 5;
    const yTickInterval = range / tickCount;
    for (let i = 0; i <= tickCount; i++) {
      const val = minVal + i * yTickInterval;
      const norm = (val - minVal) / range;
      const y = padding + graphHeight - norm * graphHeight;
      gctx.fillText(val.toFixed(yLabel === "Clusters" ? 0 : 2), padding - 30, y + 5);
      gctx.beginPath();
      gctx.moveTo(padding - 5, y);
      gctx.lineTo(padding, y);
      gctx.stroke();
    }

    gctx.strokeStyle = "blue";
    gctx.lineWidth = 2;
    gctx.beginPath();
    let hasMoved = false;
    sampledData.forEach((val, i) => {
      if (!Number.isFinite(val)) return;
      const x = padding + (i / (sampledData.length - 1 || 1)) * graphWidth;
      const norm = (val - minVal) / range;
      const y = padding + graphHeight - norm * graphHeight;
      if (!hasMoved) {
        gctx.moveTo(x, y);
        hasMoved = true;
      } else {
        gctx.lineTo(x, y);
      }
    });
    if (hasMoved) gctx.stroke();
    gctx.restore();
  } catch (err) {
    console.error("drawGraph error:", err);
  }
}

function drawPainHistoryChart(canvas, painHistory, yLabel, currentStep, maxSteps) {
  try {
    console.log(`Drawing pain history chart on ${canvas.id || 'unknown'} with agents:`, Object.keys(painHistory).length, `yLabel: ${yLabel}`);
    const gctx = canvas.getContext("2d");
    gctx.save();
    gctx.clearRect(0, 0, canvas.width, canvas.height);
    gctx.fillStyle = "white";
    gctx.fillRect(0, 0, canvas.width, canvas.height);
    const padding = 40;
    const graphWidth = canvas.width - 2 * padding;
    const graphHeight = canvas.height - 2 * padding;

    if (!painHistory || Object.keys(painHistory).length === 0) {
      gctx.fillStyle = "black";
      gctx.font = "14px sans-serif";
      gctx.fillText(`No ${yLabel} data available`, padding, padding + graphHeight / 2);
      gctx.restore();
      return;
    }

    const colors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
      '#FF9F40', '#66BB6A', '#EF5350', '#26A69A', '#AB47BC'
    ];
    const stepsPerRecord = 100;
    const maxPoints = 1000;
    const minVal = 0;
    const maxVal = 1;
    const range = maxVal - minVal;

    gctx.strokeStyle = "#888";
    gctx.beginPath();
    gctx.moveTo(padding, padding);
    gctx.lineTo(padding, padding + graphHeight);
    gctx.stroke();
    gctx.beginPath();
    gctx.moveTo(padding, padding + graphHeight);
    gctx.lineTo(padding + graphWidth, padding + graphHeight);
    gctx.stroke();

    gctx.fillStyle = "black";
    gctx.font = "12px sans-serif";
    gctx.save();
    gctx.translate(padding - 30, padding + graphHeight / 2);
    gctx.rotate(-Math.PI / 2);
    gctx.fillText(yLabel, 0, 0);
    gctx.restore();

    gctx.fillText("Time Steps", padding + graphWidth / 2 - 30, padding + graphHeight + 30);

    gctx.fillStyle = "black";
    gctx.font = "10px sans-serif";
    const maxVisibleTicks = 8;
    const effectiveMaxSteps = Math.min(currentStep, maxSteps);
    const xTickInterval = effectiveMaxSteps > 100000 ? Math.ceil(effectiveMaxSteps / 6000) * 1000 : effectiveMaxSteps > 600 ? Math.ceil(effectiveMaxSteps / 600) * 100 : 100;
    const ticks = [];
    for (let step = 0; step <= effectiveMaxSteps; step += xTickInterval) {
      if (step <= currentStep) {
        ticks.push(step);
      }
    }
    if (!ticks.includes(currentStep) && currentStep <= effectiveMaxSteps) {
      ticks.push(currentStep);
    }
    ticks.sort((a, b) => a - b);

    const visibleTicks = ticks.slice(0, maxVisibleTicks);
    visibleTicks.forEach(step => {
      const normalizedStep = step / (effectiveMaxSteps || 1);
      const x = padding + normalizedStep * graphWidth;
      gctx.fillText(Math.round(step), x - 20, padding + graphHeight + 20);
      gctx.beginPath();
      gctx.moveTo(x, padding + graphHeight);
      gctx.lineTo(x, padding + graphHeight + 5);
      gctx.stroke();
    });

    gctx.fillStyle = "black";
    gctx.font = "10px sans-serif";
    const tickCount = 5;
    const yTickInterval = range / tickCount;
    for (let i = 0; i <= tickCount; i++) {
      const val = minVal + i * yTickInterval;
      const norm = (val - minVal) / range;
      const y = padding + graphHeight - norm * graphHeight;
      gctx.fillText(val.toFixed(2), padding - 30, y + 5);
      gctx.beginPath();
      gctx.moveTo(padding - 5, y);
      gctx.lineTo(padding, y);
      gctx.stroke();
    }

    Object.keys(painHistory).forEach((agentId, index) => {
      let data = painHistory[agentId].filter(val => Number.isFinite(val));
      if (data.length === 0) return;
      if (data.length > maxPoints) {
        const step = Math.ceil(data.length / maxPoints);
        const sampledData = [];
        for (let i = 0; i < data.length; i += step) {
          sampledData.push(data[i]);
        }
        data = sampledData;
      }
      gctx.strokeStyle = colors[index % colors.length];
      gctx.lineWidth = 2;
      gctx.beginPath();
      let hasMoved = false;
      data.forEach((val, i) => {
        const clampedVal = Math.max(0, Math.min(1, val));
        const x = padding + (i * stepsPerRecord / (effectiveMaxSteps || 1)) * graphWidth;
        const norm = (clampedVal - minVal) / range;
        const y = padding + graphHeight - norm * graphHeight;
        if (!hasMoved) {
          gctx.moveTo(x, y);
          hasMoved = true;
        } else {
          gctx.lineTo(x, y);
        }
      });
      if (hasMoved) gctx.stroke();
    });

    gctx.restore();
  } catch (err) {
    console.error("drawPainHistoryChart error:", err);
    const gctx = canvas.getContext("2d");
    gctx.fillStyle = "black";
    gctx.font = "14px sans-serif";
    gctx.fillText(`Error rendering ${yLabel}: ${err.message}`, 40, canvas.height / 2);
  }
}

function downloadCanvas(canvas, filename, isZoomed = false, isCSV = false, selectedIteration = 'all') {
  try {
    if (isCSV) {
      if (selectedIteration === 'all') {
        const headers = currentAlgorithm === 'q_learning' ?
          "step,agent_id,x,y,heading,body_heat,pain,is_clustered,cold_tolerance,pain_tolerance,total_reward,pain_reward,temp_reward" :
          "step,agent_id,x,y,heading,body_heat,pain,is_clustered,cold_tolerance,pain_tolerance";
        const csvContent = [headers, ...csvData].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const iteration = iterationData.find(data => data.iteration === parseInt(selectedIteration));
        if (iteration && iteration.blob) {
          window.JSZip.loadAsync(iteration.blob).then(loadedZip => {
            loadedZip.file(`agent_data_iteration_${selectedIteration}.csv`).async("string").then(csvContent => {
              const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `agent_data_iteration_${selectedIteration}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            });
          });
        } else {
          console.error(`No valid blob data found for iteration ${selectedIteration}`);
        }
      }
    } else {
      if (isZoomed) {
        canvas = document.getElementById("graphPopupCanvas");
      }
      const dataURL = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = filename;
      a.click();
    }
  } catch (err) {
    console.error("downloadCanvas error:", err);
  }
}

function downloadZip(stepsTaken, numAgents, totalSteps, numClusters, selectedIteration = 'all') {
  try {
    console.log("downloadZip triggered with stepsTaken:", stepsTaken, "selectedIteration:", selectedIteration, "iterationData length:", iterationData.length);
    if (selectedIteration === 'all') {
      if (!iterationData || iterationData.length === 0) {
        console.error("No iteration data available for download");
        alert("No iteration data available. Please run the simulation first.");
        return;
      }

      const zip = new window.JSZip();
      const promises = [];

      iterationData.forEach(data => {
        if (!data || !data.iteration) {
          console.warn(`Invalid iteration data, skipping`);
          return;
        }
        const iterationFolder = zip.folder(`iteration_${data.iteration}`);
        const isQLearning = currentAlgorithm === 'q_learning';
        const canvases = [
          { id: "simulationCanvas", name: `simulation_snapshot_iteration_${data.iteration}.png`, width: null, height: null },
          { id: "distanceCanvas", name: `distance_chart_iteration_${data.iteration}.png`, width: 500, height: 200, data: data.graphData?.distance, label: "Average Distance" },
          { id: "painStateCanvas", name: `orientation_diff_chart_iteration_${data.iteration}.png`, width: 500, height: 200, data: data.graphData?.avg_orientation_diff, label: "Average Orientation Difference" },
          { id: "clustersCanvas", name: `clusters_chart_iteration_${data.iteration}.png`, width: 500, height: 200, data: data.graphData?.num_clusters, label: "Clusters" }
        ];
        if (isQLearning) {
          canvases.push({ id: "rewardCanvas", name: `reward_chart_iteration_${data.iteration}.png`, width: 500, height: 200, data: data.graphData?.total_reward, label: "Average Total Reward" });
        }

        const zoomedCanvases = [
          { id: "distanceCanvas", name: `distance_chart_zoomed_iteration_${data.iteration}.png`, data: data.graphData?.distance, label: "Average Distance", draw: drawGraph },
          { id: "painStateCanvas", name: `orientation_diff_chart_zoomed_iteration_${data.iteration}.png`, data: data.graphData?.avg_orientation_diff, label: "Average Orientation Difference", draw: drawGraph },
          { id: "clustersCanvas", name: `clusters_chart_zoomed_iteration_${data.iteration}.png`, data: data.graphData?.num_clusters, label: "Clusters", draw: (canvas, data, label, step, maxSteps) => drawGraph(canvas, data, label, step, maxSteps, 0) }
        ];
        if (isQLearning) {
          zoomedCanvases.push({ id: "rewardCanvas", name: `reward_chart_zoomed_iteration_${data.iteration}.png`, data: data.graphData?.total_reward, label: "Average Total Reward", draw: (canvas, data, label, step, maxSteps) => drawGraph(canvas, data, label, step, maxSteps, -10, 5) });
        }

        promises.push(
          new Promise((resolve, reject) => {
            console.log(`Processing iteration ${data.iteration}`);
            if (!data.blob) {
              console.error(`No blob data for iteration ${data.iteration}`);
              reject(new Error(`No blob data for iteration ${data.iteration}`));
              return;
            }

            data.blob.arrayBuffer().then(buffer => {
              const loadedZip = new window.JSZip();
              return loadedZip.loadAsync(buffer).then(zipContent => {
                const filePromises = Object.keys(zipContent.files).map(filename => {
                  return zipContent.file(filename).async("base64").then(content => {
                    iterationFolder.file(filename, content, { base64: true });
                  }).catch(err => {
                    console.error(`Error processing file ${filename} for iteration ${data.iteration}:`, err);
                    throw err;
                  });
                });
                return Promise.all(filePromises);
              });
            }).then(() => {
              const tempCanvas = document.createElement("canvas");
              tempCanvas.width = 800;
              tempCanvas.height = 600;
              const maxSteps = data.stepsTaken;

              const canvasPromises = canvases.map(({ id, name, width, height, data, label }) => {
                return new Promise((canvasResolve, canvasReject) => {
                  if (!id) {
                    console.warn(`Canvas ID is undefined for ${name}, skipping`);
                    canvasResolve();
                    return;
                  }
                  const canvas = document.getElementById(id);
                  if (!canvas || !canvas.getContext) {
                    console.warn(`Canvas ${id} not found or invalid for iteration ${data.iteration}, skipping`);
                    canvasResolve();
                    return;
                  }
                  if (id === "rewardCanvas" && !isQLearning) {
                    console.log(`Skipping rewardCanvas for iteration ${data.iteration} as algorithm is not q_learning`);
                    canvasResolve();
                    return;
                  }
                  if (!data || !Array.isArray(data)) {
                    console.warn(`No valid ${label} data for iteration ${data.iteration}, skipping canvas ${id}`);
                    canvasResolve();
                    return;
                  }
                  try {
                    if (width && height) {
                      const originalWidth = canvas.width;
                      const originalHeight = canvas.height;
                      canvas.width = width;
                      canvas.height = height;
                      if (id === "distanceCanvas") {
                        drawGraph(canvas, data, "Average Distance", maxSteps, maxSteps);
                      } else if (id === "painStateCanvas") {
                        drawGraph(canvas, data, "Average Orientation Difference", maxSteps, maxSteps);
                      } else if (id === "rewardCanvas") {
                        drawGraph(canvas, data, "Average Total Reward", maxSteps, maxSteps, -10, 5);
                      } else if (id === "clustersCanvas") {
                        drawGraph(canvas, data, "Clusters", data.iteration, data.iteration);
                      }
                      const dataURL = canvas.toDataURL("image/png");
                      const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
                      iterationFolder.file(name, imgData, { base64: true });
                      canvas.width = originalWidth;
                      canvas.height = originalHeight;
                      canvasResolve();
                    } else {
                      const ctx = canvas.getContext("2d");
                      const originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
                      renderFrame(data.frame, true);
                      const dataURL = canvas.toDataURL("image/png");
                      ctx.putImageData(originalImage, 0, 0);
                      const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
                      iterationFolder.file(name, imgData, { base64: true });
                      canvasResolve();
                    }
                  } catch (err) {
                    console.error(`Error processing canvas ${id} for iteration ${data.iteration}:`, err);
                    canvasResolve();
                  }
                });
              });

              const zoomedCanvasPromises = zoomedCanvases.map(({ id, name, data, label, draw }) => {
                return new Promise((zoomedResolve, zoomedReject) => {
                  if (!id) {
                    console.warn(`Canvas ID is undefined for zoomed canvas ${name}, skipping`);
                    zoomedResolve();
                    return;
                  }
                  if (!data || !Array.isArray(data)) {
                    console.warn(`No valid ${label} data for iteration ${data.iteration}, skipping zoomed canvas ${id}`);
                    zoomedResolve();
                    return;
                  }
                  try {
                    draw(tempCanvas, data, label, data.iteration || maxSteps, data.iteration || maxSteps);
                    const dataURL = tempCanvas.toDataURL("image/png");
                    const imgData = dataURL.replace(/^data:image\/png;base64,/, "");
                    iterationFolder.file(name, imgData, { base64: true });
                    zoomedResolve();
                  } catch (err) {
                    console.error(`Error processing zoomed canvas ${name} for iteration ${data.iteration || 'unknown'}:`, err);
                    zoomedResolve();
                  }
                });
              });

              Promise.all([...canvasPromises, ...zoomedCanvasPromises]).then(() => {
                console.log(`Completed processing iteration ${data.iteration}`);
                resolve();
              }).catch(err => {
                console.error(`Error in canvas processing for iteration ${data.iteration}:`, err);
                resolve();
              });
            }).catch(err => {
              console.error(`Error loading blob for iteration ${data.iteration}:`, err);
              resolve();
            });
          })
        );
      });

      Promise.all(promises).then(() => {
        console.log("Generating final zip file");
        zip.generateAsync({ type: "blob" }).then(blob => {
          console.log("Zip file generated, size:", blob.size);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `simulation_results_all_iterations.zip`;
          a.click();
          URL.revokeObjectURL(a.href);
          console.log("Download triggered for all iterations");
        }).catch(err => {
          console.error("Error generating zip file:", err);
          alert("Failed to generate zip file. Please check the console for details.");
        });
      }).catch(err => {
        console.error("Error processing iterations:", err);
        alert("Failed to process iteration data. Please check the console for details.");
      });
    } else {
      const iteration = iterationData.find(data => data.iteration === parseInt(selectedIteration));
      if (iteration) {
        console.log(`Downloading zip for iteration ${selectedIteration}`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(iteration.blob);
        a.download = `simulation_results_iteration_${selectedIteration}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        console.log(`Download triggered for iteration ${selectedIteration}`);
      } else {
        console.error(`No data found for iteration ${selectedIteration}`);
        alert(`No data found for iteration ${selectedIteration}. Please select a valid iteration.`);
      }
    }
  } catch (err) {
    console.error("downloadZip error:", err);
    alert("An error occurred while downloading the zip file. Please check the console for details.");
  }
}

function updateLegends(numAgents) {
  // Removed as legend is now drawn in renderPainLegend
}

function showSimulationCompletePopup(stepsTaken, numAgents, totalSteps, numClusters, maxIterations) {
  try {
    console.log("Showing simulation complete popup with stepsTaken:", stepsTaken, "maxIterations:", maxIterations);
    const popup = document.getElementById("simulationCompletePopup");
    const info = document.getElementById("simulationCompleteInfo");
    const iterationSelect = document.getElementById("iterationSelect");
    const buttonContainer = document.getElementById("simulationCompleteButtonContainer");

    if (!popup || !info || !iterationSelect || !buttonContainer) {
      console.error("Simulation complete popup elements missing:", {
        popup: !!popup,
        info: !!info,
        iterationSelect: !!iterationSelect,
        buttonContainer: !!buttonContainer
      });
      throw new Error("Simulation complete popup elements not found");
    }

    iterationSelect.innerHTML = '<option value="all">All</option>';
    for (let i = 1; i <= maxIterations; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      iterationSelect.appendChild(option);
    }

    if (maxIterations === 1) {
      info.innerHTML = `
        <p>Simulation completed in steps: ${stepsTaken}</p>
        <p>No. of agents: ${numAgents}</p>
        <p>Total clusters formed: ${numClusters}</p>
        <p>Parameter conditions: saved as ../simulation_config</p>
        <p>Simulation steps (set by user): ${totalSteps}</p>
      `;
    } else {
      info.innerHTML = `
        <p>Simulation completed for ${maxIterations} iterations</p>
        <p>Simulation steps (set by user): ${totalSteps}</p>
      `;
    }

    const updateButtons = () => {
      const selectedValue = iterationSelect.value;
      buttonContainer.innerHTML = '';
      if (selectedValue === "all") {
        const downloadAllBtn = document.createElement("button");
        downloadAllBtn.id = "downloadZipBtn";
        downloadAllBtn.textContent = "Download All Iterations (Zip File)";
        downloadAllBtn.addEventListener("click", () => {
          downloadZip(stepsTaken, numAgents, totalSteps, numClusters, 'all');
        });
        buttonContainer.appendChild(downloadAllBtn);
      } else {
        const downloadZipBtn = document.createElement("button");
        downloadZipBtn.id = "downloadZipBtn";
        downloadZipBtn.textContent = `Download ${selectedValue}th Iteration (Zip File)`;
        downloadZipBtn.addEventListener("click", () => {
          downloadZip(stepsTaken, numAgents, totalSteps, numClusters, selectedValue);
        });
        buttonContainer.appendChild(downloadZipBtn);

        const downloadCSVBtn = document.createElement("button");
        downloadCSVBtn.id = "downloadCSVPopup";
        downloadCSVBtn.textContent = "Download CSV Data";
        downloadCSVBtn.addEventListener("click", () => {
          downloadCanvas(null, `agent_data_iteration_${selectedValue}.csv`, false, true, selectedValue);
        });
        buttonContainer.appendChild(downloadCSVBtn);
      }
    };

    updateButtons();
    iterationSelect.addEventListener("change", updateButtons);

    popup.classList.remove("hidden");
    document.getElementById("overlay").style.display = "block";

    const closePopupBtn = document.getElementById("closeSimulationPopup");
    if (closePopupBtn) {
      closePopupBtn.addEventListener("click", () => {
        popup.classList.add("hidden");
        document.getElementById("overlay").style.display = "none";
        const distanceCanvas = document.getElementById("distanceCanvas");
        const painStateCanvas = document.getElementById("painStateCanvas");
        const rewardCanvas = document.getElementById("rewardCanvas");
        drawGraph(distanceCanvas, graphData.distance, "Average Distance", currentStep, totalSteps);
        drawGraph(painStateCanvas, graphData.avg_orientation_diff, "Average Orientation Difference", currentStep, totalSteps);
        if (currentAlgorithm === 'q_learning') {
          drawGraph(rewardCanvas, graphData.total_reward, "Average Total Reward", currentStep, totalSteps, -10, 5);
        }
      });
    }
  } catch (err) {
    console.error("showSimulationCompletePopup error:", err);
  }
}

export { renderFrame, drawGraph, drawPainHistoryChart, downloadCanvas, downloadZip, updateLegends, showSimulationCompletePopup, renderPainLegend };