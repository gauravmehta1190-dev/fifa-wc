/* ==========================================================================
   FIFA WC 2026 Smart Crowd Management - Core Application Logic
   ========================================================================== */

// Simulation Configuration
const DEFAULT_GATES = {
  A: { id: 'Gate A', name: 'GATE A (North)', flowRate: 95, queueTime: 3.2, density: 40, status: 'normal', maxCapacity: 150 },
  B: { id: 'Gate B', name: 'GATE B (West)', flowRate: 110, queueTime: 4.5, density: 50, status: 'normal', maxCapacity: 140 },
  C: { id: 'Gate C', name: 'GATE C (South)', flowRate: 85, queueTime: 2.8, density: 35, status: 'normal', maxCapacity: 160 },
  D: { id: 'Gate D', name: 'GATE D (East)', flowRate: 70, queueTime: 2.1, density: 30, status: 'normal', maxCapacity: 150 }
};

const DEFAULT_CORRIDORS = {
  north: { id: 'corridor-north', density: 42, status: 'normal' },
  south: { id: 'corridor-south', density: 38, status: 'normal' },
  west: { id: 'corridor-west', density: 48, status: 'normal' },
  east: { id: 'corridor-east', density: 32, status: 'normal' }
};

const DEFAULT_ZONES = {
  1: { id: 'zone-1', occupancy: 65 },
  2: { id: 'zone-2', occupancy: 70 },
  3: { id: 'zone-3', occupancy: 62 },
  4: { id: 'zone-4', occupancy: 74 }
};

// Global App State
let appState = {
  gates: JSON.parse(JSON.stringify(DEFAULT_GATES)),
  corridors: JSON.parse(JSON.stringify(DEFAULT_CORRIDORS)),
  zones: JSON.parse(JSON.stringify(DEFAULT_ZONES)),
  incidents: [],
  simTime: new Date(2026, 6, 16, 16, 50, 50), // 2026-07-16 16:50:50
  simSpeed: 1,
  simIntervalId: null,
  activeRecommendations: [],
  selectedRecommendation: null,
  activeLang: 'en',
  csvPlaybackActive: false,
  csvRows: [],
  csvCurrentIndex: 0,
  csvIntervalId: null,
  csvAnomalies: 0
};

// Particle Simulation Variables
let particles = [];
const PARTICLE_LIMIT = 60;

// Initialize on Load
document.addEventListener("DOMContentLoaded", () => {
  initSimulation();
  setupDragAndDrop();
  setupUIEventListeners();
  renderInitialLogs();
  initFirebaseFirestore();
});

// Setup Simulation Ticks
function initSimulation() {
  if (appState.simIntervalId) clearInterval(appState.simIntervalId);
  
  appState.simIntervalId = setInterval(() => {
    tickSimulation();
  }, 1000 / appState.simSpeed);

  // Separate faster loop for smooth particle movement animations
  animateParticles();
}

// Adjust simulation tick rates based on user selection
function setSimulationSpeed(newSpeed) {
  appState.simSpeed = newSpeed;
  document.getElementById("speed-display").innerText = `${newSpeed}x`;
  
  if (!appState.csvPlaybackActive) {
    initSimulation();
  } else {
    // If playing CSV, adjust that interval
    initCSVPlaybackInterval();
  }
  addLogEntry('SYSTEM', `Simulation speed set to ${newSpeed}x`, 'info');
}

// Global reset
function resetSimulation() {
  clearCSVPlayback();
  appState.gates = JSON.parse(JSON.stringify(DEFAULT_GATES));
  appState.corridors = JSON.parse(JSON.stringify(DEFAULT_CORRIDORS));
  appState.zones = JSON.parse(JSON.stringify(DEFAULT_ZONES));
  appState.incidents = [];
  appState.simTime = new Date(2026, 6, 16, 16, 50, 50);
  appState.activeRecommendations = [];
  appState.selectedRecommendation = null;
  
  updateMapVisuals();
  updateKPIs();
  renderXAIRecommendations();
  resetBroadcastController();
  
  // Reset Volunteer mobile inputs/states
  document.getElementById("phone-broadcast-toast").classList.add("hidden");
  document.getElementById("volunteer-chat-history").innerHTML = `
    <div class="chat-bubble ai">
      <p>Hola Carlos! If a foreign fan approaches you, select a sample query below or type/paste their spoken words to analyze context and evaluate urgency.</p>
    </div>
  `;
  document.getElementById("volunteer-chat-input").value = "";

  const logBox = document.getElementById("live-incident-log");
  logBox.innerHTML = "";
  addLogEntry('SYSTEM', 'Control room environment recalibrated to default values.', 'success');
  initSimulation();
}

// Simulation Tick Core
function tickSimulation() {
  // Advance simulation clock
  appState.simTime.setSeconds(appState.simTime.getSeconds() + 1);
  const clockEl = document.getElementById("sim-clock");
  if (clockEl) clockEl.innerText = formatTime(appState.simTime);

  // Dynamic Telemetry variations when CSV playback is NOT active
  if (!appState.csvPlaybackActive) {
    simulateNormalTelemetryNoise();
  }

  // Evaluate gates and update alerts/queues
  evaluateSystemHealth();
  
  // Update UI Elements
  updateKPIs();
  updateMapVisuals();
  spawnCrowdParticles();

  // GCP Services: Update Google Maps markers & sync data to Firestore
  updateMapMarkers();
  syncTelemetryToFirestore();
}

// Simulates minor fluctuations in crowd sizes to make dashboard look "alive"
function simulateNormalTelemetryNoise() {
  // Small noise in gate flows
  Object.keys(appState.gates).forEach(gateKey => {
    const gate = appState.gates[gateKey];
    
    // If gate scanner has a malfunction, do not execute normal noise logic
    const hasFail = appState.incidents.some(i => i.type === 'gate_malfunction' && i.target === gate.id);
    if (hasFail) {
      gate.flowRate = Math.max(10, Math.floor(gate.flowRate * 0.95)); // Scanner failed
      gate.queueTime += 0.8; // queue grows fast
      gate.density = Math.min(100, Math.floor(gate.density + 3));
    } else {
      // Normal minor ups and downs
      const flowChange = Math.floor(Math.random() * 9) - 4; // -4 to +4
      gate.flowRate = Math.min(gate.maxCapacity, Math.max(40, gate.flowRate + flowChange));
      
      // Calculate queue based on flow vs capacity ratio
      const ratio = gate.flowRate / gate.maxCapacity;
      if (ratio > 0.8) {
        gate.queueTime = Math.min(25, gate.queueTime + 0.1);
        gate.density = Math.min(95, gate.density + 1);
      } else {
        gate.queueTime = Math.max(1.5, gate.queueTime - 0.05);
        gate.density = Math.max(15, gate.density - 0.5);
      }
    }
  });

  // Calculate Corridor densities based on connected gates
  appState.corridors.north.density = Math.round(appState.gates.A.density * 1.1);
  appState.corridors.west.density = Math.round(appState.gates.B.density * 0.95);
  appState.corridors.south.density = Math.round(appState.gates.C.density * 1.05);
  appState.corridors.east.density = Math.round(appState.gates.D.density * 1.15);

  // Periodically fire minor info log entries
  if (Math.random() < 0.1) {
    const randomGate = ['Gate A', 'Gate B', 'Gate C', 'Gate D'][Math.floor(Math.random() * 4)];
    addLogEntry('CCTV', `Density scanner reports normal crowd flow at ${randomGate}.`, 'info');
  }
}

// Review current metrics and trigger AI routing recommendations if thresholds crossed
function evaluateSystemHealth() {
  const recommendations = [];

  // Check Gates for Bottlenecks
  Object.keys(appState.gates).forEach(gateKey => {
    const gate = appState.gates[gateKey];
    
    // Critical Queue warning (exceeds 15 mins)
    if (gate.queueTime >= 15) {
      gate.status = 'critical';
      
      // Find suitable redirect target (gate with lowest queue and similar maxCapacity)
      let bestRedirectTarget = null;
      let lowestQueue = 999;
      
      Object.keys(appState.gates).forEach(targetKey => {
        if (targetKey !== gateKey) {
          const targetGate = appState.gates[targetKey];
          // Target gate must not be bottlenecked itself
          if (targetGate.queueTime < lowestQueue && targetGate.queueTime < 10) {
            lowestQueue = targetGate.queueTime;
            bestRedirectTarget = targetGate;
          }
        }
      });

      if (bestRedirectTarget) {
        recommendations.push({
          id: `rec-redirect-${gateKey}`,
          title: `CROWD ROUTING REDIRECT: ${gate.id.toUpperCase()}`,
          severity: 'critical',
          sourceGate: gate,
          targetGate: bestRedirectTarget,
          reasonCode: gate.status === 'critical' ? 'MALFUNCTION_SURGE' : 'VOLUMETRIC_OVERLOAD',
          reasoningSteps: [
            `Telemetry: ${gate.id} wait time is currently ${gate.queueTime.toFixed(1)} mins (Limit: 15m). Current flow rate ${gate.flowRate} p/min.`,
            `Risk: Safety density index is at ${(gate.density).toFixed(0)}%. Bottle-necking in corridor will occur within 6 mins, creating structural crush risks near ticket turnstiles.`,
            `Alternative: ${bestRedirectTarget.id} is operating nominally at ${bestRedirectTarget.queueTime.toFixed(1)}m queue (inflow capacity remaining: ${bestRedirectTarget.maxCapacity - bestRedirectTarget.flowRate} p/min).`,
            `XAI Tradeoff Reason: Redirecting 50% of incoming fans via digital updates increases their walk path by 140 meters (+2 mins) but reduces average gate queue wait by ${(gate.queueTime - bestRedirectTarget.queueTime).toFixed(1)} mins, yielding a net savings of ${(gate.queueTime - bestRedirectTarget.queueTime - 2).toFixed(1)} mins per fan and dispersing turnstile pressure.`
          ],
          alertTemplates: {
            en: `⚠️ CROWD REDIRECTION: Gate B queue times have increased. For your comfort and faster stadium entry, please proceed to Gate D. Additional walk time: 2 mins. Current wait: 1 min. Thank you!`,
            es: `⚠️ REDIRECCIÓN DE PÚBLICO: Los tiempos de espera en la Puerta B han aumentado. Para su comodidad y un acceso más rápido, diríjase a la Puerta D. Caminata adicional: 2 min. Espera actual: 1 min. ¡Gracias!`,
            fr: `⚠️ REDIRECTION DE FOULE: L'attente à la Porte B a augmenté. Pour votre confort et un accès rapide, veuillez vous diriger vers la Porte D. Marche supplémentaire: 2 min. Attente actuelle: 1 min. Merci!`
          }
        });
      }
    } else if (gate.queueTime >= 8) {
      gate.status = 'warn';
    } else {
      gate.status = 'normal';
    }
  });

  // Check Corridors
  Object.keys(appState.corridors).forEach(corKey => {
    const corridor = appState.corridors[corKey];
    if (corridor.density >= 80) {
      corridor.status = 'critical';
    } else if (corridor.density >= 55) {
      corridor.status = 'warn';
    } else {
      corridor.status = 'normal';
    }
  });

  // Sync recommendations list to state
  appState.activeRecommendations = recommendations;
  renderXAIRecommendations();
}

// Render dynamic AI cards on the right panel
function renderXAIRecommendations() {
  const container = document.getElementById("xai-recommendations-container");
  
  if (appState.activeRecommendations.length === 0) {
    container.innerHTML = `
      <div class="xai-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-cyan"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <p>Telemetry nominal. AI is scanning for queue patterns, heat surges, and blockages.</p>
      </div>
    `;
    resetBroadcastController();
    return;
  }

  let html = "";
  appState.activeRecommendations.forEach(rec => {
    const isActive = appState.selectedRecommendation && appState.selectedRecommendation.id === rec.id;
    const activeClass = isActive ? "active" : "";
    const severityClass = rec.severity === 'critical' ? 'critical' : '';
    
    html += `
      <div class="xai-recommendation-card ${severityClass} ${activeClass}" onclick="selectRecommendation('${rec.id}')">
        <div class="xai-rec-header">
          <span class="xai-rec-title">${rec.title}</span>
          <span class="xai-rec-level ${rec.severity}">${rec.severity.toUpperCase()}</span>
        </div>
        <div class="xai-rec-summary">
          Target redirected flows to <strong>${rec.targetGate.id}</strong>. Prevents congestion at ${rec.sourceGate.id}.
        </div>
        <div class="xai-reasoning-tree">
          <div class="xai-reasoning-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            AI Reasoning Path (Explainable AI)
          </div>
          ${rec.reasoningSteps.map((step, idx) => `
            <div class="xai-reasoning-step ${idx === 3 ? 'highlight' : ''}">${step}</div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// User selects an AI recommendation to handle it
function selectRecommendation(recId) {
  const rec = appState.activeRecommendations.find(r => r.id === recId);
  if (!rec) return;

  appState.selectedRecommendation = rec;
  renderXAIRecommendations(); // redraw to show selection border

  // Enable action buttons
  document.getElementById("decline-alert-btn").removeAttribute("disabled");
  document.getElementById("broadcast-alert-btn").removeAttribute("disabled");

  // Load language templates into broadcast box
  updateBroadcastText();
}

function updateBroadcastText() {
  if (!appState.selectedRecommendation) return;
  const textarea = document.getElementById("broadcast-textarea");
  textarea.value = appState.selectedRecommendation.alertTemplates[appState.activeLang];
}

function switchBroadcastLang(lang) {
  appState.activeLang = lang;
  
  // Update class active tags
  document.querySelectorAll(".broadcast-languages .language-tab").forEach(tab => {
    tab.classList.remove("active");
  });
  document.getElementById(`lang-tab-${lang}`).classList.add("active");
  
  updateBroadcastText();
}

// Command Room approves recommendation -> broadcasts text to smartphone mockups
function sendBroadcast() {
  if (!appState.selectedRecommendation) return;

  const rec = appState.selectedRecommendation;
  const alertText = rec.alertTemplates.en; // use English for base notify

  addLogEntry('AI OPS', `Crowd redirect approved: Routing flow from ${rec.sourceGate.id} to ${rec.targetGate.id}.`, 'success');
  
  // Show Toast to the simulated Fan Apps
  showGlobalToast('📢 STADIUM ALERT SYSTEM', rec.alertTemplates[appState.activeLang], 'cyan');

  // Trigger alert inside volunteer mobile app simulator
  const phoneToast = document.getElementById("phone-broadcast-toast");
  const phoneToastMsg = document.getElementById("phone-toast-msg");
  if (phoneToast && phoneToastMsg) {
    phoneToastMsg.innerText = rec.alertTemplates[appState.activeLang];
    phoneToast.classList.remove("hidden");
  }

  // Mitigate congestion instantly in simulator state!
  const source = appState.gates[rec.sourceGate.id.split(' ')[1]];
  const target = appState.gates[rec.targetGate.id.split(' ')[1]];
  
  // Shift inflow
  source.flowRate = Math.max(30, Math.floor(source.flowRate * 0.4));
  source.queueTime = Math.max(3, source.queueTime * 0.45);
  source.density = Math.max(25, source.density * 0.5);

  target.flowRate = Math.min(target.maxCapacity, target.flowRate + 40);
  target.queueTime = Math.min(10, target.queueTime + 2.5);
  target.density = Math.min(80, target.density * 1.3);

  // Clear recommended item
  appState.activeRecommendations = appState.activeRecommendations.filter(r => r.id !== rec.id);
  appState.selectedRecommendation = null;

  renderXAIRecommendations();
  resetBroadcastController();
}

function declineAlert() {
  if (!appState.selectedRecommendation) return;
  addLogEntry('AI OPS', `Crowd redirect declined by organizer for ${appState.selectedRecommendation.sourceGate.id}.`, 'warn');
  appState.selectedRecommendation = null;
  renderXAIRecommendations();
  resetBroadcastController();
}

function resetBroadcastController() {
  const declineBtn = document.getElementById("decline-alert-btn");
  if (declineBtn) declineBtn.setAttribute("disabled", "true");
  
  const broadcastBtn = document.getElementById("broadcast-alert-btn");
  if (broadcastBtn) broadcastBtn.setAttribute("disabled", "true");
  
  const textarea = document.getElementById("broadcast-textarea");
  if (textarea) textarea.value = "Select an active AI recommendation to edit and broadcast the crowd notification.";
}

// User-triggered custom incidents (failures)
function triggerSimIncident(type, desc) {
  // Check if already active
  if (appState.incidents.some(i => i.type === type)) {
    addLogEntry('SYSTEM', `Incident "${desc}" is already active.`, 'warn');
    return;
  }

  appState.incidents.push({ type, description: desc });
  
  const incidentsEl = document.getElementById("kpi-incidents");
  if (incidentsEl) {
    incidentsEl.innerText = appState.incidents.length;
    incidentsEl.classList.add("text-red");
  }
  
  const trendEl = document.getElementById("kpi-incidents-trend");
  if (trendEl) {
    trendEl.innerText = "Immediate Action Required";
    trendEl.classList.add("text-red");
  }

  // Adjust parameters depending on incident type
  if (type === 'gate_malfunction') {
    // Gate B malfunctions
    appState.gates.B.queueTime = 22.0; // instant spike
    appState.gates.B.density = 85;
    appState.gates.B.flowRate = 22; // bottlenecked scan capacity
    addLogEntry('TELEMETRY', 'Gate B ticketing readers reporting communications loss (Code: ERR_509). Wait time escalated to 22 mins.', 'error');
  } 
  else if (type === 'corridor_block') {
    appState.corridors.east.density = 88;
    appState.gates.D.density = 82;
    appState.gates.D.queueTime = 16.5;
    addLogEntry('CCTV', 'East Corridor crowd bottleneck detected (CCTV Node 12B). Density at 88%. Flow impedance high.', 'error');
  } 
  else if (type === 'medical_emergency') {
    appState.zones[2].occupancy = 94; // crowd packs near emergency response
    addLogEntry('SAFETY', 'Medical Incident: Heat exhaustion reported in Seating Zone 2, Row 14. First response squad dispatched.', 'error');
    
    // Switch to volunteer app chat and inject a preset warning to Carlos (the volunteer)
    switchRightPanel('volunteer');
    setVolunteerInput('Someone has collapsed in Row 14! Help! They are not breathing well!');
  } 
  else if (type === 'rain_surge') {
    appState.gates.A.queueTime = 18.0;
    appState.gates.A.density = 90;
    addLogEntry('METEO', 'Heavy localized precipitation at Gate A. Fan queuing patterns slowed due to poncho distribution.', 'warn');
  }

  evaluateSystemHealth();
  updateKPIs();
  updateMapVisuals();
}

// Volunteer App panel controls
function switchRightPanel(tabName) {
  document.getElementById("tab-xai").classList.remove("active");
  document.getElementById("tab-volunteer").classList.remove("active");
  document.getElementById("content-xai").classList.add("hidden");
  document.getElementById("content-volunteer").classList.add("hidden");

  if (tabName === 'xai') {
    document.getElementById("tab-xai").classList.add("active");
    document.getElementById("content-xai").classList.remove("hidden");
  } else {
    document.getElementById("tab-volunteer").classList.add("active");
    document.getElementById("content-volunteer").classList.remove("hidden");
  }
}

function setVolunteerInput(text) {
  document.getElementById("volunteer-chat-input").value = text;
}

function closePhoneToast() {
  document.getElementById("phone-broadcast-toast").classList.add("hidden");
}

// Process volunteer chatbot entry with AI context/urgency detection
function sendVolunteerChat() {
  const inputEl = document.getElementById("volunteer-chat-input");
  const text = inputEl.value.trim();
  if (!text) return;

  // Add user bubble
  appendChatBubble('user', text);
  inputEl.value = "";

  // Simulate AI Response with context/urgency extraction
  setTimeout(() => {
    const analysis = analyzeUrgencyAndTranslate(text);
    
    // Create AI bubble
    let bubbleHtml = `
      <p><strong>Translation Assist Co-Pilot:</strong></p>
      <div class="chat-bubble-translation">"${analysis.translation}"</div>
      <div class="chat-bubble-action">🚨 ACTION: ${analysis.action}</div>
      <p class="mt-3">Suggested response script (Carlos):</p>
      <p style="color:var(--neon-cyan)">"${analysis.script}"</p>
    `;
    
    appendChatBubble('ai', bubbleHtml, analysis.isUrgent);
  }, 600);
}

function appendChatBubble(sender, content, isUrgent = false) {
  const history = document.getElementById("volunteer-chat-history");
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender} ${isUrgent ? 'urgent' : ''}`;
  bubble.innerHTML = sender === 'user' ? `<p>${content}</p>` : content;
  history.appendChild(bubble);
  history.scrollTop = history.scrollHeight;
}

// Natural text context analyzer for Volunteer translation Co-Pilot
function analyzeUrgencyAndTranslate(text) {
  const lower = text.toLowerCase();
  
  // Japanese preset check: トイレはどこですか？お腹が痛いです (Where is the restroom? My stomach hurts)
  if (text.includes("お腹が痛いです") || text.includes("トイレ") && text.includes("痛い")) {
    return {
      translation: "Where is the toilet? My stomach hurts a lot.",
      isUrgent: true,
      action: "CRITICAL: Urgent Medical Concern. Escort the fan to the West Medical Bay (Med-West is 40 meters to their left). Do not just point to toilets.",
      script: "大丈夫ですか？こちらについてきてください。救護室にご案内します。(Are you okay? Please follow me. I will guide you to the medical room.)",
    };
  }

  // Spanish lost kid check: ¿Dónde está la salida? Mi hijo se ha perdido (Where is the exit? My son is lost)
  if (lower.includes("perdido") || lower.includes("hijo") || lower.includes("niño")) {
    return {
      translation: "Where is the exit? My son is lost.",
      isUrgent: true,
      action: "CRITICAL: Lost Child Protocol. Keep the parent calm. Alert Safety Operations immediately. Keep the parent at the Gate B info counter.",
      script: "Mantenga la calma, por favor. Nos quedaremos aquí y avisaré al equipo de seguridad de inmediato. (Stay calm, please. We will stay here and I will alert security right away.)",
    };
  }

  // Medical collapses trigger
  if (lower.includes("collapsed") || lower.includes("breathing") || lower.includes("heart") || lower.includes("hurt") || lower.includes("emergency") || lower.includes("médico")) {
    return {
      translation: text,
      isUrgent: true,
      action: "CRITICAL: Medical Dispatch. Direct medical personnel to Seating Zone 2, Row 14. Keep bystanders clear.",
      script: "I have alerted the emergency response squad. Please stay where you are, help is on the way.",
    };
  }

  // Casual presets
  if (lower.includes("vegan") || lower.includes("vegetarian") || lower.includes("food") || lower.includes("vegetariano")) {
    return {
      translation: text,
      isUrgent: false,
      action: "Nominal info. Direct fan to Food Court East (Sector 3). They have certified vegan options.",
      script: "Sure, for vegan food options, head straight down this corridor to Food-East near Sector 3.",
    };
  }

  if (lower.includes("scan") || lower.includes("ticket") || lower.includes("entrada") || lower.includes("scannen")) {
    return {
      translation: text.includes("scannen") ? "Where can I scan my ticket?" : text,
      isUrgent: false,
      action: "Nominal ticketing. Direct fan to turnstile readers. Assist if reader flashes amber.",
      script: "Hold your digital barcode 5 cm above the glass reader on turnstile 4.",
    };
  }

  // Fallback translation
  return {
    translation: text,
    isUrgent: false,
    action: "Information query. Direct them to the nearest Information Kiosk located at Gate B.",
    script: "Let me check that for you. The information kiosk is located right behind Gate B.",
  };
}

// KPI Dashboard update displays
function updateKPIs() {
  // calculate averages
  let totalQueue = 0;
  let totalInflow = 0;
  Object.keys(appState.gates).forEach(key => {
    totalQueue += appState.gates[key].queueTime;
    totalInflow += appState.gates[key].flowRate;
  });
  
  const avgQueue = totalQueue / 4;
  document.getElementById("kpi-queue-time").innerText = `${avgQueue.toFixed(1)} min`;
  
  // Warning colors
  if (avgQueue > 10) {
    document.getElementById("kpi-queue-time").className = "kpi-value text-red";
  } else if (avgQueue > 6) {
    document.getElementById("kpi-queue-time").className = "kpi-value text-orange";
  } else {
    document.getElementById("kpi-queue-time").className = "kpi-value text-cyan";
  }

  document.getElementById("kpi-inflow-rate").innerText = `${totalInflow} p/m`;
  
  // Calculate relative occupancy
  const totalOccupied = 65000 + (totalInflow * 10);
  const occupancyPercentage = Math.min(99.8, (totalOccupied / 100000) * 100);
  document.getElementById("kpi-occupancy").innerText = `${occupancyPercentage.toFixed(1)}%`;
  
  // Phone volunteer syncs
  document.getElementById("phone-val-queue").innerText = `${appState.gates.B.queueTime.toFixed(0)} min`;
  document.getElementById("phone-val-flow").innerText = `${appState.gates.B.flowRate} p/m`;
  
  if (appState.gates.B.queueTime > 15) {
    document.getElementById("phone-val-queue").className = "value text-red";
  } else if (appState.gates.B.queueTime > 8) {
    document.getElementById("phone-val-queue").className = "value text-orange";
  } else {
    document.getElementById("phone-val-queue").className = "value text-cyan";
  }
}

// Update SVG components colors, glowing filters, paths, based on health
function updateMapVisuals() {
  // Update Gates
  Object.keys(appState.gates).forEach(key => {
    const gate = appState.gates[key];
    const groupEl = document.getElementById(`gate-group-${key}`);
    const outerEl = document.getElementById(`gate-outer-${key}`);
    
    // Clear classes
    groupEl.classList.remove('gate-normal', 'gate-warn', 'gate-critical');
    outerEl.removeAttribute('filter');

    if (gate.status === 'critical') {
      groupEl.classList.add('gate-critical');
      outerEl.setAttribute('filter', 'url(#glow-red)');
    } else if (gate.status === 'warn') {
      groupEl.classList.add('gate-warn');
      outerEl.setAttribute('filter', 'url(#glow-yellow)');
    } else {
      groupEl.classList.add('gate-normal');
      outerEl.setAttribute('filter', 'url(#glow-cyan)');
    }
  });

  // Update Corridors paths
  Object.keys(appState.corridors).forEach(key => {
    const corridor = appState.corridors[key];
    const pathEl = document.getElementById(`corridor-${key}`);
    
    pathEl.classList.remove('flow-normal', 'flow-warning', 'flow-critical');
    
    if (corridor.status === 'critical') {
      pathEl.classList.add('flow-critical');
    } else if (corridor.status === 'warn') {
      pathEl.classList.add('flow-warning');
    } else {
      pathEl.classList.add('flow-normal');
    }
  });

  // Update Seating Zones colors based on occupancy
  Object.keys(appState.zones).forEach(key => {
    const zone = appState.zones[key];
    const zoneEl = document.getElementById(`zone-${key}`);
    
    if (zone.occupancy >= 90) {
      zoneEl.style.fill = 'rgba(255, 46, 147, 0.4)';
    } else if (zone.occupancy >= 75) {
      zoneEl.style.fill = 'rgba(255, 159, 0, 0.3)';
    } else {
      zoneEl.style.fill = 'rgba(11, 17, 32, 0.7)';
    }
  });
}

// Particle flow simulation loop inside SVG Map
function spawnCrowdParticles() {
  const gatesList = [
    { key: 'A', cx: 400, cy: 70, targetX: 400, targetY: 130 },
    { key: 'B', cx: 80, cy: 300, targetX: 180, targetY: 300 },
    { key: 'C', cx: 400, cy: 530, targetX: 400, targetY: 470 },
    { key: 'D', cx: 720, cy: 300, targetX: 620, targetY: 300 }
  ];

  // Spawn new particles based on inflow rates
  gatesList.forEach(gateDef => {
    const gate = appState.gates[gateDef.key];
    // Spawn rate is proportional to flow rate
    const spawnChance = gate.flowRate / 150;
    if (Math.random() < spawnChance && particles.length < PARTICLE_LIMIT) {
      particles.push({
        x: gateDef.cx,
        y: gateDef.cy,
        targetX: gateDef.targetX,
        targetY: gateDef.targetY,
        progress: 0,
        speed: 0.02 + (Math.random() * 0.015),
        color: gate.status === 'critical' ? 'var(--neon-crimson)' : (gate.status === 'warn' ? 'var(--neon-orange)' : 'var(--neon-cyan)'),
        radius: 2.5 + (Math.random() * 2)
      });
    }
  });
}

function animateParticles() {
  const layer = document.getElementById("particle-layer");
  if (!layer) return;

  // Clear previous rendering
  layer.innerHTML = "";

  particles.forEach((p, idx) => {
    // Linear interpolation
    p.progress += p.speed;
    
    // calculate current pos
    const currX = p.x + (p.targetX - p.x) * p.progress;
    const currY = p.y + (p.targetY - p.y) * p.progress;

    // Create SVG element
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", currX);
    circle.setAttribute("cy", currY);
    circle.setAttribute("r", p.radius);
    circle.setAttribute("fill", p.color);
    circle.setAttribute("opacity", 1 - p.progress);
    layer.appendChild(circle);
  });

  // Remove finished particles
  particles = particles.filter(p => p.progress < 1.0);

  // Call next animation frame
  requestAnimationFrame(animateParticles);
}

// Select details by clicking map items
function selectMapElement(name) {
  addLogEntry('CCTV', `Focus locked on: ${name}. Detail telemetry reports normal structural loading.`, 'info');
  showGlobalToast('🔍 CCTV TARGET LOCK', `Focusing control room screens on ${name}. Status: NOMINAL.`, 'cyan');
}

// Log Terminal Utility
function addLogEntry(source, text, type = 'info') {
  const logBox = document.getElementById("live-incident-log");
  if (!logBox) return;

  const timeStr = formatTime(new Date());
  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  line.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-text"><strong>${source}:</strong> ${text}</span>
  `;
  
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

// Toast Alerts display (organizer notification system)
function showGlobalToast(title, body, colorClass = 'cyan') {
  const container = document.getElementById("global-toast-container");
  const toast = document.createElement("div");
  toast.className = `desktop-toast`;
  toast.style.borderColor = `var(--neon-${colorClass})`;
  
  toast.innerHTML = `
    <div class="toast-header-row">
      <span class="toast-system-label" style="color:var(--neon-${colorClass})">${title}</span>
    </div>
    <div class="toast-body-text">${body}</div>
  `;
  
  container.appendChild(toast);
  
  // Fadeout and delete after 5s
  setTimeout(() => {
    toast.classList.add("fadeOut");
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4500);
}

// UI Setup: drag and drop CSV files
function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("csv-file-input");

  if (!dropZone) return;

  // Click zone triggers file selection
  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleUploadedFile(e.target.files[0]);
    }
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleUploadedFile(e.dataTransfer.files[0]);
    }
  });
}

function setupUIEventListeners() {
  // Sim speed range slider
  const speedRange = document.getElementById("speed-range");
  if (speedRange) {
    speedRange.addEventListener("input", (e) => {
      setSimulationSpeed(parseInt(e.target.value));
    });
  }
}

// Default initial logs inside control room
function renderInitialLogs() {
  addLogEntry('SYSTEM', 'FIFA Crowd Operations Center initialized (azteca_sys_v2).', 'success');
  addLogEntry('CCTV', 'All 184 digital feed zones linked. CCTV telemetry online.', 'info');
  addLogEntry('VOLUNTEER', '1,200 active zone support personnel checked in.', 'info');
  addLogEntry('XAI ENGINE', 'Predictive queue neural modules loaded. Normal rate predictions active.', 'ai');
}

// Formats date into HH:MM:SS
function formatTime(date) {
  return date.toTimeString().split(' ')[0];
}

/* ==========================================================================
   Jury Sandbox: CSV Parser & Validation Playback Engine
   ========================================================================== */

function handleUploadedFile(file) {
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseAndValidateCSV(text, file.name);
  };
  reader.readAsText(file);
}

// Parses string CSV, validates headers & values, lists anomalies
function parseAndValidateCSV(csvText, fileName) {
  // Reset previous playbacks
  clearCSVPlayback();
  
  addLogEntry('SANDBOX', `Loading CSV file: "${fileName}"`, 'info');

  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length <= 1) {
    addLogEntry('SANDBOX', 'Validation Failed: CSV contains no data rows or is empty.', 'error');
    showGlobalToast('❌ CSV PARSER ERROR', 'Empty CSV file or missing row fields.', 'crimson');
    return;
  }

  // Parse Headers (flexible mapping to support minor spelling variations)
  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase());
  const headerMap = {
    timestamp: rawHeaders.findIndex(h => h.includes('time')),
    elementtype: rawHeaders.findIndex(h => h.includes('type')),
    elementid: rawHeaders.findIndex(h => h.includes('id')),
    parameter: rawHeaders.findIndex(h => h.includes('param')),
    value: rawHeaders.findIndex(h => h.includes('val')),
    description: rawHeaders.findIndex(h => h.includes('desc'))
  };

  // Validate headers structure
  const missingHeaders = [];
  if (headerMap.timestamp === -1) missingHeaders.push('Timestamp');
  if (headerMap.elementtype === -1) missingHeaders.push('ElementType');
  if (headerMap.elementid === -1) missingHeaders.push('ElementID');
  if (headerMap.parameter === -1) missingHeaders.push('Parameter');
  if (headerMap.value === -1) missingHeaders.push('Value');

  if (missingHeaders.length > 0) {
    addLogEntry('SANDBOX', `Validation Failed. Missing critical headers: ${missingHeaders.join(', ')}`, 'error');
    showGlobalToast('❌ HEADER ERROR', `Missing headers: ${missingHeaders.join(', ')}`, 'crimson');
    return;
  }

  // Process Rows
  const parsedRows = [];
  let errorCount = 0;
  appState.csvAnomalies = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    
    // Handle split values containing quotes if needed
    if (cells.length < 5) {
      addLogEntry('SANDBOX', `Row ${i + 1}: Malformed row columns count. Skipped.`, 'warn');
      errorCount++;
      continue;
    }

    const row = {
      timestamp: cells[headerMap.timestamp],
      elementType: cells[headerMap.elementtype].toLowerCase(),
      elementId: cells[headerMap.elementid].toUpperCase(),
      parameter: cells[headerMap.parameter].toLowerCase(),
      value: cells[headerMap.value],
      description: headerMap.description !== -1 ? cells[headerMap.description] : ""
    };

    // Row Data Validation
    let rowValid = true;

    // Validate Element Type
    if (!['gate', 'corridor', 'zone', 'incident'].includes(row.elementType)) {
      addLogEntry('SANDBOX', `Row ${i + 1} validation error: Invalid ElementType "${row.elementType}"`, 'warn');
      rowValid = false;
    }

    // Validate Numeric values
    if (['flowrate', 'queuetime', 'density', 'occupancy'].includes(row.parameter)) {
      const num = parseFloat(row.value);
      if (isNaN(num)) {
        addLogEntry('SANDBOX', `Row ${i + 1} validation error: Non-numeric value for "${row.parameter}"`, 'warn');
        rowValid = false;
      }
      
      // Anomaly detection metrics (out of bounds)
      if (row.parameter === 'density' && (num < 0 || num > 100)) {
        appState.csvAnomalies++;
        addLogEntry('SANDBOX', `Anomaly check: density is out of bounds (value: ${num}%) on row ${i + 1}`, 'warn');
      }
      if (row.parameter === 'queuetime' && num < 0) {
        appState.csvAnomalies++;
        addLogEntry('SANDBOX', `Anomaly check: queueTime is negative (value: ${num} mins) on row ${i + 1}`, 'warn');
      }
    }

    if (rowValid) {
      parsedRows.push(row);
    } else {
      errorCount++;
    }
  }

  addLogEntry('SANDBOX', `Validation completed. ${parsedRows.length} rows loaded. ${errorCount} formatting errors. ${appState.csvAnomalies} anomalies tracked.`, 'success');
  showGlobalToast('✔️ CSV DATA VALIDATED', `Loaded ${parsedRows.length} rows. Anomalies: ${appState.csvAnomalies}`, 'emerald');

  // Trigger Playback Sandbox UI
  appState.csvPlaybackActive = true;
  appState.csvRows = parsedRows;
  appState.csvCurrentIndex = 0;

  // Draw UI console
  document.getElementById("csv-file-name").innerText = fileName;
  document.getElementById("playback-line-count").innerText = `0/${parsedRows.length}`;
  document.getElementById("playback-anomaly-count").innerText = appState.csvAnomalies;
  document.getElementById("csv-playback-console").classList.remove("hidden");
  document.getElementById("csv-log-box").innerHTML = "Ready for playback...";
  
  // Suspend normal tick updates during playback
  clearInterval(appState.simIntervalId);
  document.getElementById("sim-status-badge").innerText = "CSV PLAYBACK";
  document.getElementById("sim-status-badge").style.backgroundColor = "rgba(255, 159, 0, 0.1)";
  document.getElementById("sim-status-badge").style.borderColor = "var(--neon-orange)";
  document.getElementById("sim-status-badge").style.color = "var(--neon-orange)";

  // Start Playback interval
  initCSVPlaybackInterval();
}

function initCSVPlaybackInterval() {
  if (appState.csvIntervalId) clearInterval(appState.csvIntervalId);

  // Playback ticks run according to speed slider (e.g. 1 row per 1.5s scaled down)
  const ms = Math.max(100, 1500 / appState.simSpeed);
  appState.csvIntervalId = setInterval(() => {
    playNextCSVRow();
  }, ms);
}

function playNextCSVRow() {
  if (!appState.csvPlaybackActive || appState.csvCurrentIndex >= appState.csvRows.length) {
    // Reached end
    addLogEntry('SANDBOX', 'CSV Simulation sequence playback complete.', 'success');
    showGlobalToast('🏁 SEQUENCE COMPLETED', 'CSV simulation playback reached end.', 'emerald');
    clearInterval(appState.csvIntervalId);
    appState.csvIntervalId = null;
    return;
  }

  const row = appState.csvRows[appState.csvCurrentIndex];
  appState.csvCurrentIndex++;

  // Update progress bar
  const progressPercent = (appState.csvCurrentIndex / appState.csvRows.length) * 100;
  document.getElementById("playback-progress-fill").style.width = `${progressPercent}%`;
  document.getElementById("playback-line-count").innerText = `${appState.csvCurrentIndex}/${appState.csvRows.length}`;

  // Log inside sandbox console
  const logConsole = document.getElementById("csv-log-box");
  const msg = `[Row ${appState.csvCurrentIndex}] Set ${row.elementType}.${row.elementId} -> ${row.parameter}=${row.value}`;
  logConsole.innerHTML += `<div>${msg}</div>`;
  logConsole.scrollTop = logConsole.scrollHeight;

  // Apply row instruction to simulation state
  applyCSVRowToState(row);

  // Re-run evaluation loop
  evaluateSystemHealth();
  updateKPIs();
  updateMapVisuals();
  spawnCrowdParticles();
}

// Translates CSV instruction directly into simulation parameters
function applyCSVRowToState(row) {
  // Update Sim clock to match CSV row timestamp
  document.getElementById("sim-clock").innerText = row.timestamp;

  const elementKey = row.elementId;
  const numValue = parseFloat(row.value);

  if (row.elementType === 'gate') {
    // Get Gate reference letter
    const letter = elementKey.replace('GATE ', '').trim();
    if (appState.gates[letter]) {
      const paramMap = {
        flowrate: 'flowRate',
        queuetime: 'queueTime',
        density: 'density'
      };
      const key = paramMap[row.parameter];
      if (key) {
        appState.gates[letter][key] = numValue;
        
        // Log action in main telemetry window
        if (row.parameter === 'queuetime' && numValue > 15) {
          addLogEntry('CSV ALARM', `Gate ${letter} wait time spiked to ${numValue}m. Custom rule triggered.`, 'error');
        }
      }
    }
  } 
  else if (row.elementType === 'corridor') {
    const name = elementKey.replace('CORRIDOR ', '').toLowerCase().trim();
    if (appState.corridors[name]) {
      if (row.parameter === 'density') {
        appState.corridors[name].density = numValue;
      }
    }
  } 
  else if (row.elementType === 'zone') {
    const num = parseInt(elementKey.replace('ZONE ', '').trim());
    if (appState.zones[num]) {
      if (row.parameter === 'occupancy') {
        appState.zones[num].occupancy = numValue;
      }
    }
  }
  else if (row.elementType === 'incident') {
    // Trigger custom incident from CSV
    triggerSimIncident(row.parameter, row.description || `CSV Telemetry Incident: ${row.value}`);
  }
}

function clearCSVPlayback() {
  if (appState.csvIntervalId) clearInterval(appState.csvIntervalId);
  appState.csvPlaybackActive = false;
  appState.csvRows = [];
  appState.csvCurrentIndex = 0;
  
  document.getElementById("csv-playback-console").classList.add("hidden");
  document.getElementById("sim-status-badge").innerText = "RUNNING";
  document.getElementById("sim-status-badge").removeAttribute("style");

  // Re-run standard simulator ticks
  initSimulation();
}

// Download Sample CSV generator for Hackathon Jury
function downloadSampleCSV() {
  const csvContent = `Timestamp,ElementType,ElementID,Parameter,Value,Description
16:51:00,gate,Gate B,flowrate,110,Gate B entering crowd flow
16:51:02,gate,Gate B,queuetime,4.5,Initial queue average
16:51:04,gate,Gate B,density,50,Initial Gate B density
16:51:06,incident,Incident,gate_malfunction,true,Gate B Scanner System Failure
16:51:08,gate,Gate B,flowrate,20,Flow rate drops due to scan lock
16:51:10,gate,Gate B,queuetime,28,Queue wait time spikes drastically to 28 mins
16:51:12,gate,Gate B,density,90,Overcrowding at Gate B area
16:51:14,corridor,Corridor West,density,95,Corridor West bottlenecked
16:51:16,incident,Incident,medical_emergency,true,Medical heat alert Row 14 Zone 2
16:51:18,gate,Gate B,queuetime,-5,Negative anomaly check test row`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "fifa_crowd_telemetry_jury.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   Google Cloud Platform (GCP) Services Integration
   ========================================================================== */

// 1. Firebase Firestore SDK Sync Integration
let firestoreDb = null;
function initFirebaseFirestore() {
  if (typeof firebase !== 'undefined') {
    try {
      const firebaseConfig = {
        apiKey: "mock-api-key-fifa-wc-2026",
        authDomain: "fifa-wc-2026-ops.firebaseapp.com",
        projectId: "fifa-wc-2026-ops",
        storageBucket: "fifa-wc-2026-ops.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef123456"
      };
      
      firebase.initializeApp(firebaseConfig);
      firestoreDb = firebase.firestore();
      addLogEntry('FIREBASE', 'GCP Firebase App initialized. Connected to Firestore database.', 'success');
    } catch (e) {
      addLogEntry('FIREBASE', `Firebase Init Warning: ${e.message}. Running in local sandbox.`, 'warn');
    }
  } else {
    addLogEntry('FIREBASE', 'Firebase SDK library not loaded. Running in local sandbox mode.', 'info');
  }
}

function syncTelemetryToFirestore() {
  const payload = {
    timestamp: formatTime(appState.simTime),
    gates: {
      A: { queueTime: appState.gates.A.queueTime, flowRate: appState.gates.A.flowRate, density: appState.gates.A.density },
      B: { queueTime: appState.gates.B.queueTime, flowRate: appState.gates.B.flowRate, density: appState.gates.B.density },
      C: { queueTime: appState.gates.C.queueTime, flowRate: appState.gates.C.flowRate, density: appState.gates.C.density },
      D: { queueTime: appState.gates.D.queueTime, flowRate: appState.gates.D.flowRate, density: appState.gates.D.density }
    },
    activeIncidentsCount: appState.incidents.length
  };

  if (firestoreDb) {
    try {
      firestoreDb.collection("stadium_telemetry").add(payload)
        .then(() => {
          if (Math.random() < 0.05) {
            addLogEntry('FIREBASE', 'Pushed live crowd data payload successfully to Firestore collection [stadium_telemetry].', 'success');
          }
        })
        .catch(err => {
          console.warn("Firestore sync error:", err);
        });
    } catch (e) {
      // Sandbox fallback
    }
  } else {
    if (Math.random() < 0.05) {
      addLogEntry('FIREBASE', 'Sandbox Log: db.collection("stadium_telemetry").add({ timestamp, gates, activeIncidentsCount })', 'ai');
    }
  }
}

// 2. Google Maps JS API Integration
let googleMap = null;
let mapMarkers = {};
const AZTECA_COORDS = { lat: 19.3029, lng: -99.1505 };

const MARKER_LOCATIONS = {
  'Gate A': { lat: 19.3048, lng: -99.1505, desc: "North Gate Entrance - Access to Zone 1 & 2" },
  'Gate B': { lat: 19.3029, lng: -99.1532, desc: "West Gate Entrance - Access to Zone 1 & 4" },
  'Gate C': { lat: 19.3010, lng: -99.1505, desc: "South Gate Entrance - Access to Zone 3 & 4" },
  'Gate D': { lat: 19.3029, lng: -99.1478, desc: "East Gate Entrance - Access to Zone 2 & 3" },
  'Medical Center': { lat: 19.3032, lng: -99.1518, desc: "West Emergency Care & First-Aid Station" },
  'Food Court East': { lat: 19.3025, lng: -99.1492, desc: "East Halftime Food Court and Plaza" }
};

function switchMapView(viewType) {
  const tabSvg = document.getElementById("map-tab-svg");
  const tabGoogle = document.getElementById("map-tab-google");
  const wrapperSvg = document.getElementById("stadium-svg");
  const containerMap = document.getElementById("google-map-container");

  if (!tabSvg || !tabGoogle || !wrapperSvg || !containerMap) return;

  tabSvg.classList.remove("active");
  tabGoogle.classList.remove("active");
  wrapperSvg.classList.add("hidden");
  containerMap.classList.add("hidden");

  if (viewType === 'svg') {
    tabSvg.classList.add("active");
    wrapperSvg.classList.remove("hidden");
    addLogEntry('SYSTEM', 'Switched display to stadium interior SVG schematic.', 'info');
  } else {
    tabGoogle.classList.add("active");
    containerMap.classList.remove("hidden");
    addLogEntry('SYSTEM', 'Switched display to geographic exterior map (Google Maps JS API).', 'info');
    
    if (googleMap && typeof google !== 'undefined') {
      google.maps.event.trigger(googleMap, 'resize');
      googleMap.setCenter(AZTECA_COORDS);
    }
  }
}

function initGoogleMap() {
  const mapContainer = document.getElementById("google-map-container");
  if (!mapContainer || typeof google === 'undefined') return;

  const darkMapStyles = [
    { elementType: "geometry", stylers: [{ color: "#0b1120" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#060913" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#00f0ff" }]
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#94a3b8" }]
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#0c192c" }]
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#1e293b" }]
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#0f172a" }]
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#64748b" }]
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#111b2d" }]
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#00f0ff" }, { weight: 0.5 }]
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#1e293b" }]
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#070c16" }]
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#475569" }]
    }
  ];

  const mapOptions = {
    zoom: 16,
    center: AZTECA_COORDS,
    styles: darkMapStyles,
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeId: 'roadmap'
  };

  googleMap = new google.maps.Map(mapContainer, mapOptions);
  addLogEntry('GOOGLE MAPS', 'Azteca Stadium Map initialized via Google Maps JS SDK.', 'success');

  Object.keys(MARKER_LOCATIONS).forEach(name => {
    const loc = MARKER_LOCATIONS[name];
    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: googleMap,
      title: name,
      icon: getCustomMarkerIcon('normal')
    });

    const infoWindow = new google.maps.InfoWindow({
      content: `<div class="map-iw-title">${name}</div><div class="map-iw-desc">${loc.desc}</div>`
    });

    marker.addListener('click', () => {
      infoWindow.open(googleMap, marker);
      selectMapElement(name);
    });

    mapMarkers[name] = { marker, infoWindow };
  });
}

function getCustomMarkerIcon(status) {
  if (typeof google === 'undefined') return null;
  
  let color = '#00F0FF';
  if (status === 'critical') color = '#FF2E93';
  if (status === 'warn') color = '#FF9F00';
  if (status === 'green') color = '#00FFA3';

  return {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 1.5,
    scale: 1.5,
    anchor: new google.maps.Point(12, 22)
  };
}

function updateMapMarkers() {
  if (!googleMap || typeof google === 'undefined') return;

  const statusMap = {
    'Gate A': appState.gates.A.status,
    'Gate B': appState.gates.B.status,
    'Gate C': appState.gates.C.status,
    'Gate D': appState.gates.D.status,
    'Medical Center': appState.incidents.some(i => i.type === 'medical_emergency') ? 'critical' : 'green',
    'Food Court East': 'green'
  };

  Object.keys(mapMarkers).forEach(name => {
    const status = statusMap[name];
    const item = mapMarkers[name];
    if (item && item.marker) {
      item.marker.setIcon(getCustomMarkerIcon(status));
      
      let queueText = "";
      if (name.startsWith("Gate")) {
        const letter = name.split(" ")[1];
        const gate = appState.gates[letter];
        queueText = `<br/><strong style="color:var(--neon-cyan)">Live Wait: ${gate.queueTime.toFixed(1)} mins</strong><br/>Flow Rate: ${gate.flowRate} p/m`;
      }
      
      const loc = MARKER_LOCATIONS[name];
      item.infoWindow.setContent(`<div class="map-iw-title">${name}</div><div class="map-iw-desc">${loc.desc}${queueText}</div>`);
    }
  });
}
