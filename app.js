import { COPY, DESTINATIONS, GATES, LOCATIONS, buildFallbackBrief, gateState, operationalDecision, routeSteps, safeQuestion } from "./core.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const now = () => new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());

const state = {
  from: "fanPlaza",
  destination: "seat204",
  language: "en",
  mobility: false,
  question: "",
  loads: { gateA: 42, gateB: 35, gateC: 48 },
  step: -1,
  log: ["Venue telemetry connected. Fan guidance is using approved route rules."]
};

let latestRequest = 0;
let toastTimer;

function decision() { return operationalDecision(state); }
function activeRoute() { return decision().primary; }
function text(node, value) { node.textContent = value; }

function renderGateList(route) {
  const selected = decision().selectedGate;
  const container = $("#gate-list");
  container.replaceChildren(...Object.values(GATES).map((gate) => {
    const load = state.loads[gate.id];
    const condition = gateState(load);
    const card = document.createElement("article");
    card.className = `gate-card ${condition.key}${selected === gate.id ? " selected" : ""}`;
    card.innerHTML = `<div class="gate-card-top"><strong>${gate.name}</strong><span class="capacity">${load}% capacity</span></div><div class="load-bar" aria-hidden="true"><i style="width:${load}%"></i></div><small>${condition.label} · ${gate.zone}${selected === gate.id ? " · Recommended" : ""}</small>`;
    return card;
  }));
  $$(".map-node").forEach((node) => {
    const id = node.dataset.node;
    node.classList.toggle("is-active", Boolean(route?.path.includes(id)));
    if (Object.hasOwn(GATES, id)) {
      node.classList.remove("state-open", "state-busy", "state-critical", "state-closed");
      node.classList.add(`state-${gateState(state.loads[id]).key}`);
    }
  });
  $$(".map-route").forEach((line) => line.classList.remove("is-active"));
  if (selected) $(".route-" + selected)?.classList.add("is-active");
}

function routeSummary(route) {
  const gate = decision().selectedGate;
  const destination = DESTINATIONS[state.destination]?.label ?? "Destination";
  const values = [
    ["Destination", destination],
    ["Walk", `${route?.minutes ?? "—"} min`],
    ["Entry", gate ? GATES[gate].name : "Inside venue"],
    ["Access", state.mobility ? "Step-free" : "Standard"],
  ];
  const box = $("#route-summary");
  box.replaceChildren(...values.map(([label, value]) => {
    const metric = document.createElement("span");
    metric.className = "route-metric";
    metric.innerHTML = `${label}: <strong>${value}</strong>`;
    return metric;
  }));
}

function setMessage(message, source = "Local safety brief") {
  text($("#assistant-message"), message);
  text($("#ai-source"), source);
}

function updateMessage(route, useQuestion = false) {
  const fallback = buildFallbackBrief({ route, destination: state.destination, language: state.language, loads: state.loads, question: useQuestion ? state.question : "" });
  setMessage(fallback);
  const copy = COPY[state.language] ?? COPY.en;
  text($("#start-guidance"), copy.action);
  const busiest = Object.entries(state.loads).filter(([, load]) => gateState(load).key === "critical" || gateState(load).key === "closed");
  const gate = decision().selectedGate;
  const banner = $("#diversion-banner");
  if (busiest.length && gate) {
    banner.textContent = `${GATES[gate].name} recommended · diversion active`;
    banner.className = "diversion-banner diversion-active";
  } else {
    banner.textContent = "Monitoring gate capacity";
    banner.className = "diversion-banner";
  }
  text($("#venue-status"), busiest.length ? "Crowd diversion active" : "All systems monitored");
  text($("#updated-time"), `Updated ${now()} · live demo`);
}

function renderDirections(route) {
  const list = $("#directions");
  const steps = routeSteps(route);
  list.replaceChildren(...steps.map((line, index) => {
    const item = document.createElement("li");
    item.textContent = line;
    item.classList.toggle("is-current", index === state.step);
    return item;
  }));
}

function appendLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 5);
  const list = $("#activity-log");
  list.replaceChildren(...state.log.map((item) => {
    const line = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = now();
    line.append(time, document.createTextNode(item));
    return line;
  }));
}

function renderControls() {
  const area = $("#capacity-controls");
  area.replaceChildren(...Object.values(GATES).map((gate) => {
    const line = document.createElement("label");
    line.className = "capacity-control";
    line.innerHTML = `<span>${gate.name}</span><input aria-label="${gate.name} capacity" data-gate="${gate.id}" type="range" min="0" max="100" value="${state.loads[gate.id]}"><output>${state.loads[gate.id]}%</output>`;
    return line;
  }));
  $$(".capacity-control input").forEach((input) => input.addEventListener("input", () => {
    state.loads[input.dataset.gate] = Number(input.value);
    input.nextElementSibling.value = `${input.value}%`;
    input.nextElementSibling.textContent = `${input.value}%`;
  }));
}

function render({ askAI = false, logMessage } = {}) {
  const route = activeRoute();
  if (!route) {
    setMessage("No approved step-free route is available from this location. Please contact a steward.");
    $("#directions").replaceChildren();
    return;
  }
  state.step = -1;
  updateMessage(route, askAI);
  routeSummary(route);
  renderDirections(route);
  renderGateList(route);
  renderControls();
  if (logMessage) appendLog(logMessage);
  if (askAI) requestConcierge(route);
}

async function requestConcierge(route) {
  // A local file opened directly in a browser has no HTTP API endpoint. The
  // deterministic local safety brief is already displayed, so avoid a noisy
  // failed request and keep the prototype fully usable in that mode.
  if (window.location.protocol === "file:") return;
  const requestId = ++latestRequest;
  const gate = decision().selectedGate;
  const approved = `From ${LOCATIONS[state.from]} to ${DESTINATIONS[state.destination].label}. ${route.minutes} minutes. ` +
    `${gate ? `Approved entry: ${GATES[gate].name}; current load ${state.loads[gate]}%.` : "Already inside the venue."} ` +
    `Directions: ${routeSteps(route).join(" ")}`;
  try {
    const response = await fetch("/api/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: approved, question: safeQuestion(state.question), language: state.language })
    });
    const payload = await response.json();
    if (requestId === latestRequest && response.ok && payload.source === "ai" && payload.message) {
      setMessage(payload.message, "AI personalised · route verified");
    }
  } catch {
    // Fallback was rendered first; network loss does not interrupt guidance.
  }
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function switchMode(mode) {
  const fan = mode === "fan";
  $("#fan-panel").hidden = !fan;
  $("#ops-panel").hidden = fan;
  $("#fan-tab").classList.toggle("is-active", fan);
  $("#ops-tab").classList.toggle("is-active", !fan);
  $("#fan-tab").setAttribute("aria-selected", String(fan));
  $("#ops-tab").setAttribute("aria-selected", String(!fan));
}

function setScenario(name) {
  if (name === "overcrowded") {
    Object.assign(state, { from: "fanPlaza", destination: "seat204", mobility: false, question: "My ticket says Gate A. Where should I go?" });
    Object.assign(state.loads, { gateA: 92, gateB: 31, gateC: 48 });
    render({ askAI: true, logMessage: "Gate A reached 92% capacity. Fan routing diverted to the lower-risk entry." });
    switchMode("fan");
    notify("Gate A diversion published. Fan guidance updated.");
  } else if (name === "medical") {
    Object.assign(state, { from: "section204", destination: "firstAid", mobility: true, question: "I need first-aid support." });
    render({ askAI: true, logMessage: "First-aid route created from Section 204 using accessible paths." });
    switchMode("fan");
    notify("First-aid route ready. Contact a steward for urgent support.");
  } else {
    Object.assign(state, { from: "fanPlaza", destination: "seat204", mobility: false, question: "" });
    Object.assign(state.loads, { gateA: 42, gateB: 35, gateC: 48 });
    render({ logMessage: "Balanced arrival pattern restored across all gates." });
    switchMode("fan");
    notify("Normal venue conditions restored.");
  }
  $("#from").value = state.from;
  $("#destination").value = state.destination;
  $("#mobility").checked = state.mobility;
  $("#question").value = state.question;
}

$("#route-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.from = $("#from").value;
  state.destination = $("#destination").value;
  state.language = $("#language").value;
  state.mobility = $("#mobility").checked;
  state.question = safeQuestion($("#question").value);
  $("#question").value = state.question;
  render({ askAI: true, logMessage: `Route guidance requested: ${LOCATIONS[state.from]} to ${DESTINATIONS[state.destination].label}.` });
});

$$(".quick").forEach((button) => button.addEventListener("click", () => {
  $("#destination").value = button.dataset.destination;
  $("#route-form").requestSubmit();
}));

$("#start-guidance").addEventListener("click", () => {
  const steps = routeSteps(activeRoute());
  state.step = Math.min(state.step + 1, steps.length - 1);
  renderDirections(activeRoute());
  notify(state.step >= 0 ? `Step ${state.step + 1} of ${steps.length}: ${steps[state.step]}` : "Guidance ready.");
});

$("#share-route").addEventListener("click", async () => {
  const route = activeRoute();
  const line = `${DESTINATIONS[state.destination].label}: ${routeSteps(route).join(" ")}`;
  try { await navigator.clipboard.writeText(line); notify("Route copied. Show it to a volunteer if you need help."); }
  catch { notify("Copy is unavailable here. Ask a nearby volunteer for route support."); }
});

$("#fan-tab").addEventListener("click", () => switchMode("fan"));
$("#ops-tab").addEventListener("click", () => switchMode("ops"));
$("#apply-conditions").addEventListener("click", () => {
  render({ logMessage: "Live gate conditions published to fan route planner." });
  notify("Live conditions published to all route calculations.");
});
$("#reset-conditions").addEventListener("click", () => setScenario("normal"));
$$(".scenario").forEach((button) => button.addEventListener("click", () => setScenario(button.dataset.scenario)));
$("#accessibility-toggle").addEventListener("click", (event) => {
  document.body.classList.toggle("high-contrast");
  event.currentTarget.setAttribute("aria-pressed", String(document.body.classList.contains("high-contrast")));
});

render({ logMessage: "Demo ready: routes are recalculated using current gate capacity." });
