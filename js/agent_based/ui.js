import { agentParams, setAgentParams, currentAlgorithm, currentStep, graphData, popupState, setSelectedAgentId } from './globals.js';
import { startSimulation, updateUIVisibility, latestFrame } from './simulation.js';
import { drawGraph, drawPainHistoryChart, downloadCanvas } from './visualization.js';

let parameterMode = 'non-uniform'; // Track the selected parameter mode

function updateAgentParamsTable() {
  try {
    console.log("Updating agent params table with agentParams:", agentParams);
    const table = document.getElementById("agentParamsTable");
    if (!table) {
      console.error("Element with ID 'agentParamsTable' not found");
      alert("Agent parameters table not found. Please check the HTML for 'agentParamsTable' element.");
      return;
    }
    const tableBody = table.getElementsByTagName("tbody")[0];
    tableBody.innerHTML = '';
    agentParams.forEach((params, index) => {
      const row = tableBody.insertRow();
      const agentId = index + 1;
      const agent = latestFrame && latestFrame.agents ? latestFrame.agents.find(a => a.id === index) : null;
      row.insertCell(0).textContent = agentId;
      row.insertCell(1).textContent = agent ? agent.bodyHeat.toFixed(2) : params.bodyHeat.toFixed(2);
      row.insertCell(2).textContent = params.coldTolerance.toFixed(2);
      row.insertCell(3).textContent = params.painTolerance.toFixed(2);
    });
  } catch (err) {
    console.error("updateAgentParamsTable error:", err);
    alert("Failed to update agent parameters table: " + err.message);
  }
}

function validateForm() {
  try {
    const numAgents = parseInt(document.getElementById("numAgents").value);
    const gridWidth = parseInt(document.getElementById("gridWidth").value);
    const gridHeight = parseInt(document.getElementById("gridHeight").value);
    const cellSize = parseInt(document.getElementById("cellSize").value);
    const steps = parseInt(document.getElementById("steps").value);
    const ambientTemp = parseFloat(document.getElementById("ambientTemp").value);
    const iterations = parseInt(document.getElementById("iterations").value);

    if (isNaN(numAgents) || numAgents < 1) {
      alert("Number of agents must be at least 1.");
      return false;
    }
    if (isNaN(gridWidth) || gridWidth < 10) {
      alert("Grid width must be at least 10.");
      return false;
    }
    if (isNaN(gridHeight) || gridHeight < 10) {
      alert("Grid height must be at least 10.");
      return false;
    }
    if (isNaN(cellSize) || cellSize < 10 || cellSize > 50) {
      alert("Cell size must be between 10 and 50.");
      return false;
    }
    if (isNaN(steps) || steps < 1) {
      alert("Steps must be at least 1.");
      return false;
    }
    if (isNaN(ambientTemp) || ambientTemp < -25 || ambientTemp > 40) {
      alert("Ambient temperature must be between -25 and 40.");
      return false;
    }
    if (isNaN(iterations) || iterations < 1) {
      alert("Number of iterations must be at least 1.");
      return false;
    }
    if (agentParams.length !== numAgents) {
      alert("Agent parameters must match the number of agents.");
      return false;
    }
    for (const params of agentParams) {
      if (isNaN(params.coldTolerance) || params.coldTolerance <= 0 || params.coldTolerance > 1) {
        alert("Cold tolerance must be between 0 and 1.");
        return false;
      }
      if (isNaN(params.painTolerance) || params.painTolerance <= 0 || params.painTolerance > 1) {
        alert("Pain tolerance must be between 0 and 1.");
        return false;
      }
      if (isNaN(params.bodyHeat) || params.bodyHeat < 35 || params.bodyHeat > 39) {
        alert("Body heat must be between 35 and 39.");
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("validateForm error:", err);
    alert("Form validation failed: " + err.message);
    return false;
  }
}

function initializeAgentParams(numAgents) {
  try {
    console.log("Initializing agent params for numAgents:", numAgents);
    let newParams = agentParams.slice(0, numAgents);
    if (newParams.length < numAgents) {
      for (let i = newParams.length; i < numAgents; i++) {
        newParams.push({
          bodyHeat: 35 + Math.random() * (39 - 35),
          coldTolerance: Math.random(),
          painTolerance: Math.random()
        });
      }
    }
    setAgentParams(newParams);
    updateAgentParamsTable();
  } catch (err) {
    console.error("initializeAgentParams error:", err);
    alert("Failed to initialize agent parameters: " + err.message);
  }
}

function showAgentParamsPopup() {
  try {
    const form = document.getElementById("agentParamsForm");
    const popup = document.getElementById("agentParamsPopup");
    const overlay = document.getElementById("overlay");
    if (!form || !popup || !overlay) {
      console.error("Agent params popup elements missing:", {
        form: !!form,
        popup: !!popup,
        overlay: !!overlay
      });
      alert("Agent configuration popup elements not found. Please check the HTML for 'agentParamsForm', 'agentParamsPopup', and 'overlay' elements.");
      return;
    }
    
    // Helper function to render form based on mode
    function renderAgentParamsForm(mode) {
      form.innerHTML = `
        <style>
          .mode-selection { margin-bottom: 15px; }
          .mode-selection label { margin-right: 20px; font-weight: bold; display: inline-block; }
        </style>
        <div class="mode-selection">
          <label><input type="radio" name="paramMode" value="uniform" ${mode === 'uniform' ? 'checked' : ''}> Uniform</label>
          <label><input type="radio" name="paramMode" value="non-uniform" ${mode === 'non-uniform' ? 'checked' : ''}> Non-Uniform</label>
        </div>
      `;
      
      if (mode === 'uniform') {
        form.innerHTML += `
          <h4>Agents</h4>
          <label title="Body heat (35–39°C) for agent thermoregulation">Body Heat:
            <input type="number" name="bodyHeat_uniform" value="${agentParams[0]?.bodyHeat.toFixed(2) || 37}" step="0.1" min="35" max="39">
          </label>
          <label title="Cold tolerance (0–1) determines sensitivity to ambient temperature">Cold Tolerance:
            <input type="number" name="coldTolerance_uniform" value="${agentParams[0]?.coldTolerance.toFixed(2) || 0.5}" step="0.01" min="0" max="1">
          </label>
          <label title="Pain tolerance (0–1) determines threshold for stopping movement due to crowding">Pain Tolerance:
            <input type="number" name="painTolerance_uniform" value="${agentParams[0]?.painTolerance.toFixed(2) || 0.5}" step="0.01" min="0" max="1">
          </label>
        `;
      } else {
        agentParams.forEach((params, index) => {
          form.innerHTML += `
            <h4>Agent ${index + 1}</h4>
            <label title="Body heat (35–39°C) for agent thermoregulation">Body Heat:
              <input type="number" name="bodyHeat_${index}" value="${params.bodyHeat.toFixed(2)}" step="0.1" min="35" max="39">
            </label>
            <label title="Cold tolerance (0–1) determines sensitivity to ambient temperature">Cold Tolerance:
              <input type="number" name="coldTolerance_${index}" value="${params.coldTolerance.toFixed(2)}" step="0.01" min="0" max="1">
            </label>
            <label title="Pain tolerance (0–1) determines threshold for stopping movement due to crowding">Pain Tolerance:
              <input type="number" name="painTolerance_${index}" value="${params.painTolerance.toFixed(2)}" step="0.01" min="0" max="1">
            </label>
          `;
        });
      }
    }

    // Render initial form with non-uniform mode
    renderAgentParamsForm('non-uniform');

    // Add event listener for mode toggle
    form.addEventListener('change', (event) => {
      if (event.target.name === 'paramMode') {
        renderAgentParamsForm(event.target.value);
      }
    });

    popup.classList.remove("hidden");
    overlay.style.display = "block";
  } catch (err) {
    console.error("showAgentParamsPopup error:", err);
    alert("Failed to show agent parameters popup: " + err.message);
  }
}

function setupEventListeners() {
  try {
    console.log("Setting up event listeners");
    const elements = {
      startBtn: document.getElementById("startBtn"),
      numAgents: document.getElementById("numAgents"),
      configureAgentsBtn: document.getElementById("configureAgentsBtn"),
      algorithm: document.getElementById("algorithm"),
      distanceDownload: document.getElementById("distanceDownload"),
      painStateDownload: document.getElementById("painStateDownload"),
      rewardDownload: document.getElementById("rewardDownload"),
      closeGraphPopup: document.getElementById("closeGraphPopup"),
      closeSimulationPopup: document.getElementById("closeSimulationPopup"),
      graphPopupDownload: document.getElementById("graphPopupDownload"),
      downloadCSV: document.getElementById("downloadCSV"),
      saveAgentParams: document.getElementById("saveAgentParams"),
      closeAgentParamsPopup: document.getElementById("closeAgentParamsPopup"),
      simulationCanvas: document.getElementById("simulationCanvas"),
      distanceZoom: document.getElementById("distanceZoom"),
      painStateZoom: document.getElementById("painStateZoom"),
      rewardZoom: document.getElementById("rewardZoom")
    };

    const missingElements = Object.entries(elements)
      .filter(([_, element]) => !element)
      .map(([key]) => key);
    if (missingElements.length > 0) {
      console.error("Elements not found in the DOM:", missingElements);
      alert(`The following elements are missing in the HTML: ${missingElements.join(', ')}. Please ensure they are included in the DOM.`);
    }

    // Disable start button if no agent parameters
    if (elements.startBtn && agentParams.length === 0) {
      elements.startBtn.disabled = true;
      console.warn("Start button disabled: no agent parameters defined");
    }

    let isRunning = false;

    // Animation for live dots in iteration status
    let dotAnimationInterval = null;
    const updateStatusDots = () => {
      const tableBody = document.querySelector("#iterationStatusTable tbody");
      if (!tableBody) return;
      const rows = tableBody.getElementsByTagName("tr");
      for (let row of rows) {
        const statusCell = row.cells[1];
        if (statusCell.textContent.includes("running")) {
          const currentText = statusCell.textContent;
          const iteration = currentText.match(/Iteration \d+/)[0];
          const dots = currentText.replace(iteration, "").trim();
          let newDots;
          if (dots === "running.") newDots = "running..";
          else if (dots === "running..") newDots = "running…";
          else newDots = "running.";
          statusCell.textContent = `${iteration} ${newDots}`;
        }
      }
    };

    for (const [key, element] of Object.entries(elements)) {
      if (!element) continue;
      switch (key) {
        case "startBtn":
          element.addEventListener("click", () => {
            if (isRunning) {
              startSimulation();
              element.textContent = "Start Simulation";
              isRunning = false;
              if (dotAnimationInterval) {
                clearInterval(dotAnimationInterval);
                dotAnimationInterval = null;
              }
            } else {
              if (validateForm()) {
                startSimulation();
                element.textContent = "Stop Simulation";
                isRunning = true;
                if (!dotAnimationInterval) {
                  dotAnimationInterval = setInterval(updateStatusDots, 500);
                }
              }
            }
          });
          break;
        case "numAgents":
          element.addEventListener("change", () => {
            const numAgents = parseInt(element.value);
            if (!isNaN(numAgents) && numAgents >= 1) {
              initializeAgentParams(numAgents);
              if (elements.startBtn) elements.startBtn.disabled = false;
            } else {
              console.warn("Invalid number of agents:", element.value);
              alert("Invalid number of agents. Please enter a number greater than or equal to 1.");
              if (elements.startBtn) elements.startBtn.disabled = true;
            }
          });
          break;
        case "configureAgentsBtn":
          element.addEventListener("click", () => {
            const numAgents = parseInt(document.getElementById("numAgents").value);
            if (!isNaN(numAgents) && numAgents >= 1) {
              showAgentParamsPopup();
            } else {
              alert("Please set a valid number of agents (at least 1) before configuring.");
            }
          });
          break;
        case "algorithm":
          element.addEventListener("change", updateUIVisibility);
          break;
        case "distanceDownload":
          element.addEventListener("click", () => downloadCanvas(document.getElementById("distanceCanvas"), "distance_chart.png"));
          break;
        case "painStateDownload":
          element.addEventListener("click", () => downloadCanvas(document.getElementById("painStateCanvas"), "orientation_diff_chart.png"));
          break;
        case "rewardDownload":
          element.addEventListener("click", () => downloadCanvas(document.getElementById("rewardCanvas"), "reward_chart.png"));
          break;
        case "distanceZoom":
          element.addEventListener("click", () => {
            popupState.isOpen = true;
            popupState.canvasId = "distanceCanvas";
            popupState.yLabel = "Average Distance";
            popupState.data = graphData.distance;
            const popupCanvas = document.getElementById("graphPopupCanvas");
            popupCanvas.width = 800;
            popupCanvas.height = 600;
            drawGraph(popupCanvas, graphData.distance, "Average Distance", currentStep, parseInt(document.getElementById("steps").value) || 1000);
            document.getElementById("graphPopup").classList.remove("hidden");
            document.getElementById("overlay").style.display = "block";
            document.getElementById("graphPopupTitle").textContent = "Average Distance";
          });
          break;
        case "painStateZoom":
          element.addEventListener("click", () => {
            popupState.isOpen = true;
            popupState.canvasId = "painStateCanvas";
            popupState.yLabel = "Average Orientation Difference";
            popupState.data = graphData.avg_orientation_diff;
            const popupCanvas = document.getElementById("graphPopupCanvas");
            popupCanvas.width = 800;
            popupCanvas.height = 600;
            drawGraph(popupCanvas, graphData.avg_orientation_diff, "Average Orientation Difference", currentStep, parseInt(document.getElementById("steps").value) || 1000, 0, 180);
            document.getElementById("graphPopup").classList.remove("hidden");
            document.getElementById("overlay").style.display = "block";
            document.getElementById("graphPopupTitle").textContent = "Average Orientation Difference";
          });
          break;
        case "rewardZoom":
          element.addEventListener("click", () => {
            popupState.isOpen = true;
            popupState.canvasId = "rewardCanvas";
            popupState.yLabel = "Average Total Reward";
            popupState.data = graphData.total_reward;
            const popupCanvas = document.getElementById("graphPopupCanvas");
            popupCanvas.width = 800;
            popupCanvas.height = 600;
            drawGraph(popupCanvas, graphData.total_reward, "Average Total Reward", currentStep, parseInt(document.getElementById("steps").value) || 1000, -10, 5);
            document.getElementById("graphPopup").classList.remove("hidden");
            document.getElementById("overlay").style.display = "block";
            document.getElementById("graphPopupTitle").textContent = "Average Total Reward";
          });
          break;
        case "closeGraphPopup":
        case "closeSimulationPopup":
          element.addEventListener("click", () => {
            document.getElementById("graphPopup").classList.add("hidden");
            document.getElementById("simulationCompletePopup").classList.add("hidden");
            document.getElementById("overlay").style.display = "none";
            popupState.isOpen = false;
            popupState.canvasId = null;
            popupState.yLabel = null;
            popupState.data = null;
            // Redraw graphs to prevent blank canvases
            const totalSteps = parseInt(document.getElementById("steps").value) || 1000;
            const distanceCanvas = document.getElementById("distanceCanvas");
            const painStateCanvas = document.getElementById("painStateCanvas");
            const rewardCanvas = document.getElementById("rewardCanvas");
            drawGraph(distanceCanvas, graphData.distance, "Average Distance", currentStep, totalSteps);
            drawGraph(painStateCanvas, graphData.avg_orientation_diff, "Average Orientation Difference", currentStep, totalSteps, 0, 180);
            if (currentAlgorithm === 'q_learning') {
              drawGraph(rewardCanvas, graphData.total_reward, "Average Total Reward", currentStep, totalSteps, -10, 5);
            }
          });
          break;
        case "graphPopupDownload":
          element.addEventListener("click", () => {
            downloadCanvas(document.getElementById("graphPopupCanvas"), `${popupState.canvasId}_zoomed.png`, true);
          });
          break;
        case "downloadCSV":
          element.addEventListener("click", () => {
            const iterationSelect = document.getElementById("iterationSelect");
            const selectedIteration = iterationSelect ? iterationSelect.value : 'all';
            downloadCanvas(null, `agent_data${selectedIteration !== 'all' ? `_iteration_${selectedIteration}` : ''}.csv`, false, true, selectedIteration);
          });
          break;
        case "saveAgentParams":
          element.addEventListener("click", () => {
            const form = document.getElementById("agentParamsForm");
            parameterMode = form.querySelector('input[name="paramMode"]:checked').value; // Save selected mode
            let newParams;
            if (parameterMode === 'uniform') {
              const bodyHeat = parseFloat(document.getElementsByName("bodyHeat_uniform")[0].value) || 37;
              const coldTolerance = Math.min(Math.max(parseFloat(document.getElementsByName("coldTolerance_uniform")[0].value) || 0.5, 0), 1);
              const painTolerance = Math.min(Math.max(parseFloat(document.getElementsByName("painTolerance_uniform")[0].value) || 0.5, 0), 1);
              const numAgents = parseInt(document.getElementById("numAgents").value) || agentParams.length;
              newParams = Array(numAgents).fill().map(() => ({
                bodyHeat,
                coldTolerance,
                painTolerance
              }));
            } else {
              newParams = agentParams.map((params, index) => ({
                bodyHeat: parseFloat(document.getElementsByName(`bodyHeat_${index}`)[0].value) || params.bodyHeat,
                coldTolerance: Math.min(Math.max(parseFloat(document.getElementsByName(`coldTolerance_${index}`)[0].value) || params.coldTolerance, 0), 1),
                painTolerance: Math.min(Math.max(parseFloat(document.getElementsByName(`painTolerance_${index}`)[0].value) || params.painTolerance, 0), 1)
              }));
            }
            setAgentParams(newParams);
            updateAgentParamsTable();
            document.getElementById("agentParamsPopup").classList.add("hidden");
            document.getElementById("overlay").style.display = "none";
          });
          break;
        case "closeAgentParamsPopup":
          element.addEventListener("click", () => {
            document.getElementById("agentParamsPopup").classList.add("hidden");
            document.getElementById("overlay").style.display = "none";
          });
          break;
        case "simulationCanvas":
          element.addEventListener("click", (event) => {
            if (!latestFrame || !latestFrame.agents) return;
            const rect = element.getBoundingClientRect();
            const clickX = (event.clientX - rect.left) * (element.width / rect.width);
            const clickY = (event.clientY - rect.top) * (element.height / rect.height);
            const gridWidth = latestFrame.local_temperatures.length;
            const cellSize = element.width / gridWidth;
            let closestAgent = null;
            let minDistance = Infinity;
            latestFrame.agents.forEach(agent => {
              const agentX = agent.x * cellSize;
              const agentY = agent.y * cellSize;
              const distance = Math.sqrt((clickX - agentX) ** 2 + (clickY - agentY) ** 2);
              if (distance < minDistance && distance < cellSize) {
                minDistance = distance;
                closestAgent = agent;
              }
            });
            if (closestAgent) {
              setSelectedAgentId(closestAgent.id);
            } else {
              setSelectedAgentId(null);
            }
          });
          break;
      }
    }
  } catch (err) {
    console.error("setupEventListeners error:", err);
    alert("Failed to set up event listeners: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    const numAgentsInput = document.getElementById("numAgents");
    if (!numAgentsInput) {
      console.error("Element with ID 'numAgents' not found");
      alert("Number of agents input not found. Please check the HTML for 'numAgents' element.");
      return;
    }
    const numAgents = parseInt(numAgentsInput.value) || 20;
    initializeAgentParams(numAgents);
    setupEventListeners();
    updateUIVisibility();
  } catch (err) {
    console.error("DOMContentLoaded error:", err);
    alert("Initialization failed: " + err.message);
  }
});

export { updateAgentParamsTable, validateForm, initializeAgentParams, setupEventListeners, parameterMode };