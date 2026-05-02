# Porcupine-Sim

**An Interactive Agent-Based Simulation of Social Behavior inspired by Schopenhauer's Porcupine's Dilemma**

## Overview

**Porcupine-Sim** is a web-based, interactive agent-based simulation that models social behavior dynamics inspired by Arthur Schopenhauer's famous philosophical parable, the "Porcupine's Dilemma." The simulation demonstrates how agents (porcupines) must balance competing needs: the desire for warmth through social proximity versus the discomfort of getting too close to others.

This project implements two distinct behavioral algorithms—**Q-Learning (Reinforcement Learning)** and **Rule-Based** systems—to explore how different decision-making strategies affect group formation, social distancing, and collective behavior patterns.

## The Porcupine's Dilemma

> *"One cold winter's day, a number of porcupines huddled together quite closely in order through their mutual warmth to prevent themselves from being frozen. But they soon felt the effect of their quills on one another, which made them again move apart. Now when the need for warmth once more brought them together, the drawback of the quills was repeated so that they were tossed between two evils, until they had discovered the proper distance from which they could best tolerate one another."*  
> — Arthur Schopenhauer, *Parerga and Paralipomena* (1851)

This simulation brings this philosophical concept to life through computational modeling, allowing researchers and students to explore:
- Social approach-avoidance conflicts
- Emergence of social structures
- Individual differences in pain tolerance and social needs
- The dynamics of group formation and dissolution

## Features

### Core Features
- **Dual Algorithm Support**: Switch between Q-Learning (RL) and Rule-Based behavioral models
- **Configurable Agents**: Customize individual agent parameters including:
  - Body heat (thermal regulation)
  - Cold tolerance (environmental adaptation)
  - Pain tolerance (social sensitivity)
- **Real-Time Visualization**: Watch agents interact in a 2D toroidal grid environment
- **Dynamic Graphs**: Monitor key metrics in real-time:
  - Average inter-agent distance
  - Pain state and orientation differences
  - Cumulative reward (for Q-Learning)
  - Cluster formation and dynamics

### Interactive Controls
- **Zoom & Download**: Interactive graph exploration with zoom and PNG download capabilities
- **Multi-Iteration Support**: Run multiple simulation iterations for statistical analysis
- **CSV Export**: Export comprehensive simulation data for offline analysis
- **Agent Configuration**: Individually or bulk-configure agent parameters
- **Pause/Resume**: Control simulation flow with start/stop functionality

### Accessibility
- **Responsive Design**: Works on various screen sizes
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: ARIA labels and semantic HTML
- **Visual Feedback**: Real-time progress indicators and status updates

## Installation

### Prerequisites
- A modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- No server required - runs entirely client-side

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/Mayank-Srivastava-21/Porcupine-Sim.git
   cd Porcupine-Sim
2. **Open in browser**
   ```text
    Simply open index.html in your web browser
    Or use a local server (recommended):
     python -m http.server 8000
    Then navigate to http://localhost:8000
   ```
## Project Structure

```text
Porcupine-Sim/
│
├── index.html                    # Main HTML file with UI structure
├── README.md                     # Project documentation
│
├── css/
│   └── common.css                # Stylesheet (329 lines)
│                                   - Layout and responsive design
│                                   - Component styling
│                                   - Accessibility features
│
└── js/
    ├── q_learning.js             # Q-Learning agent implementation (88 lines)
    │                               - QTable initialization
    │                               - State discretization
    │                               - Action selection (ε-greedy)
    │                               - Q-value updates
    │
    └── agent_based/
        ├── environment.js        # Environment and grid management
        │                           - 2D toroidal grid
        │                           - Temperature dynamics
        │                           - Heat dissipation
        │
        ├── globals.js            # Global state management (71 lines)
        │                           - Agent parameters
        │                           - Simulation state
        │                           - CSV data storage
        │                           - Graph data structures
        │
        ├── simulation.js         # Core simulation logic
        │                           - Agent movement
        │                           - Collision detection
        │                           - Pain calculation
        │                           - Cluster detection
        │
        ├── ui.js                 # User interface handling
        │                           - Form controls
        │                           - Event listeners
        │                           - Popup management
        │                           - Iteration tracking
        │
        └── visualization.js      # Graphical rendering
                                    - Canvas drawing
                                    - Real-time graphs
                                    - Pain legend
                                    - Agent visualization
```
### If you use this software, in whole or in part, for academic, research, or public projects, you agree to cite this repository as follows:
Mayank-Srivastava-21. (2026). Porcupine-Sim: An Interactive Agent-Based Simulation 
of Social Behavior. GitHub repository. https://github.com/Mayank-Srivastava-21/Porcupine-Sim
### Simulation Link: https://porcupine-simulation.netlify.app/
### For any issues or queries, contact @mayanks23@iiserb.ac.in and @pragati23@iiserb.ac.in
