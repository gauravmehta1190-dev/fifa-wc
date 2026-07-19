/**
 * StadiumFlow's deterministic safety layer.
 *
 * An LLM may explain a route, but it never chooses or overrides it.  This
 * module turns live venue telemetry into an auditable route first, then the
 * optional AI layer personalises the already-approved result.
 */

export const GATES = Object.freeze({
  gateA: { id: "gateA", name: "Gate A", zone: "North entry" },
  gateB: { id: "gateB", name: "Gate B", zone: "West entry" },
  gateC: { id: "gateC", name: "Gate C", zone: "South entry" }
});

export const LOCATIONS = Object.freeze({
  fanPlaza: "Fan Plaza",
  parkingNorth: "Parking North",
  transitHub: "Transit Hub",
  gateA: "Gate A",
  gateB: "Gate B",
  gateC: "Gate C",
  concourse: "Main Concourse",
  section102: "Section 102",
  section204: "Section 204",
  washroom: "Accessible washroom",
  firstAid: "First aid",
  exit: "Nearest exit"
});

export const DESTINATIONS = Object.freeze({
  seat102: { node: "section102", label: "My seat · Section 102" },
  seat204: { node: "section204", label: "My seat · Section 204" },
  washroom: { node: "washroom", label: "Accessible washroom" },
  firstAid: { node: "firstAid", label: "First aid" },
  exit: { node: "exit", label: "Nearest exit" },
  parking: { node: "parkingNorth", label: "Parking North" },
  transit: { node: "transitHub", label: "Transit hub" }
});

// Minutes are intentionally approximate. Venue integrations should replace
// this compact demo graph with approved map geometry and telemetry.
const EDGES = Object.freeze([
  ["fanPlaza", "gateA", 3, "gateA"], ["fanPlaza", "gateB", 4, "gateB"], ["fanPlaza", "gateC", 4, "gateC"],
  ["parkingNorth", "fanPlaza", 5], ["transitHub", "fanPlaza", 4],
  ["gateA", "concourse", 3, "gateA"], ["gateB", "concourse", 3, "gateB"], ["gateC", "concourse", 3, "gateC"],
  ["concourse", "section102", 4], ["concourse", "section204", 6], ["concourse", "washroom", 2],
  ["concourse", "firstAid", 3], ["concourse", "exit", 4],
  ["section102", "washroom", 3, undefined, true], ["section204", "washroom", 3, undefined, true],
  ["parkingNorth", "transitHub", 7]
]);

const ADJACENCY = Object.freeze(EDGES.reduce((graph, [from, to, minutes, gate, stairs]) => {
  for (const [start, end] of [[from, to], [to, from]]) {
    if (!graph[start]) graph[start] = [];
    graph[start].push({ to: end, minutes, gate, stairs: Boolean(stairs) });
  }
  return graph;
}, {}));

export function clampLoad(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function gateState(load) {
  const crowd = clampLoad(load);
  if (crowd >= 95) return { key: "closed", label: "Do not enter", penalty: 9999 };
  if (crowd >= 80) return { key: "critical", label: "Overcrowded", penalty: 26 + (crowd - 80) * 1.8 };
  if (crowd >= 60) return { key: "busy", label: "Busy", penalty: 5 + (crowd - 60) * 0.55 };
  return { key: "open", label: "Open", penalty: crowd * 0.045 };
}

function edgeCost(edge, loads, mobility) {
  if (edge.stairs && mobility) return 9999;
  const gatePenalty = edge.gate ? gateState(loads[edge.gate]).penalty : 0;
  return edge.minutes + gatePenalty;
}

/** A small deterministic Dijkstra implementation. It refuses closed gates. */
export function findRoute({ from, to, loads, mobility = false, avoidGate } = {}) {
  if (!ADJACENCY[from] || !ADJACENCY[to]) return null;
  const currentLoads = { gateA: 0, gateB: 0, gateC: 0, ...loads };
  const queue = [{ node: from, cost: 0, path: [from] }];
  const best = new Map([[from, 0]]);

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current.node === to) {
      const rawMinutes = current.path.slice(1).reduce((sum, node, index) => {
        const edge = ADJACENCY[current.path[index]].find((candidate) => candidate.to === node);
        return sum + (edge?.minutes ?? 0);
      }, 0);
      return { path: current.path, minutes: Math.max(1, Math.ceil(rawMinutes)), score: Math.round(current.cost) };
    }
    for (const edge of ADJACENCY[current.node]) {
      if ((avoidGate && edge.gate === avoidGate) || (edge.gate && gateState(currentLoads[edge.gate]).key === "closed")) continue;
      const nextCost = current.cost + edgeCost(edge, currentLoads, mobility);
      if (nextCost >= 9999 || nextCost >= (best.get(edge.to) ?? Infinity)) continue;
      best.set(edge.to, nextCost);
      queue.push({ node: edge.to, cost: nextCost, path: [...current.path, edge.to] });
    }
  }
  return null;
}

export function routeGate(route) {
  return route?.path.find((node) => Object.hasOwn(GATES, node)) ?? null;
}

export function routeSteps(route) {
  if (!route) return [];
  return route.path.slice(1).map((node, index) => {
    const previous = route.path[index];
    if (Object.hasOwn(GATES, node)) return `Head to ${LOCATIONS[node]} via the signed pedestrian lane.`;
    if (previous && Object.hasOwn(GATES, previous) && node === "concourse") return `Enter through ${LOCATIONS[previous]} and follow the steward markers.`;
    if (node === "washroom") return "Use the accessible washroom on the main concourse.";
    if (node === "firstAid") return "Go to first aid and tell the steward you need support.";
    if (node === "exit") return "Follow the illuminated nearest-exit signs.";
    if (node.startsWith("section")) return `Follow section signs to ${LOCATIONS[node]}.`;
    return `Continue to ${LOCATIONS[node]}.`;
  });
}

export function safeQuestion(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export const COPY = Object.freeze({
  en: {
    heading: "Your live stadium guide",
    reroute: "Crowding detected. I’ve moved you to the safest open entry.",
    normal: "Your route is clear right now.",
    firstAid: "For urgent danger, contact emergency services or the nearest steward immediately.",
    action: "Start step-by-step guidance"
  },
  es: {
    heading: "Tu guía del estadio en vivo",
    reroute: "Detectamos aglomeración. Te dirigimos a la entrada abierta más segura.",
    normal: "Tu ruta está despejada ahora mismo.",
    firstAid: "Si existe peligro urgente, avisa de inmediato a emergencias o al auxiliar más cercano.",
    action: "Iniciar indicaciones paso a paso"
  },
  fr: {
    heading: "Votre guide du stade en direct",
    reroute: "Forte affluence détectée. Nous vous orientons vers l’entrée ouverte la plus sûre.",
    normal: "Votre itinéraire est dégagé pour le moment.",
    firstAid: "En cas de danger urgent, prévenez immédiatement les secours ou le steward le plus proche.",
    action: "Démarrer le guidage étape par étape"
  },
  pt: {
    heading: "Seu guia do estádio ao vivo",
    reroute: "Lotação detectada. Direcionamos você para a entrada aberta mais segura.",
    normal: "Sua rota está livre no momento.",
    firstAid: "Em caso de perigo urgente, avise os serviços de emergência ou o funcionário mais próximo.",
    action: "Iniciar orientação passo a passo"
  }
});

export function buildFallbackBrief({ route, destination, language = "en", loads, question = "" } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const gate = routeGate(route);
  const overcrowded = Object.values(loads ?? {}).some((load) => {
    const state = gateState(load).key;
    return state === "critical" || state === "closed";
  });
  const context = destination === "firstAid" ? copy.firstAid : (overcrowded ? copy.reroute : copy.normal);
  const destinationLabel = DESTINATIONS[destination]?.label ?? "your destination";
  const questionLine = question ? ` I noted: “${safeQuestion(question)}”.` : "";
  return `${copy.heading}: ${context} Continue to ${destinationLabel}${gate ? ` via ${GATES[gate].name}` : ""}. Estimated walking time: ${route?.minutes ?? "—"} minutes.${questionLine}`;
}

export function operationalDecision({ from, destination, loads, mobility = false } = {}) {
  const target = DESTINATIONS[destination]?.node;
  const primary = findRoute({ from, to: target, loads, mobility });
  const gate = routeGate(primary);
  const alternate = primary && gate ? findRoute({ from, to: target, loads, mobility, avoidGate: gate }) : null;
  return { primary, alternate, selectedGate: gate, destination: target };
}
