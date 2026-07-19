import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackBrief, clampLoad, findRoute, gateState, operationalDecision, safeQuestion } from "./core.js";

const balanced = { gateA: 42, gateB: 35, gateC: 48 };

test("clampLoad keeps malformed telemetry within safe bounds", () => {
  assert.equal(clampLoad(-9), 0);
  assert.equal(clampLoad(101.8), 100);
  assert.equal(clampLoad("not-a-number"), 0);
});

test("overcrowded gate is avoided in favour of an open entry", () => {
  const result = operationalDecision({ from: "fanPlaza", destination: "seat204", loads: { gateA: 92, gateB: 31, gateC: 48 } });
  assert.ok(result.primary);
  assert.equal(result.selectedGate, "gateB");
  assert.ok(!result.primary.path.includes("gateA"));
});

test("closed gates are never selected", () => {
  const route = findRoute({ from: "fanPlaza", to: "section204", loads: { gateA: 100, gateB: 100, gateC: 20 } });
  assert.ok(route.path.includes("gateC"));
  assert.ok(!route.path.includes("gateA"));
  assert.equal(gateState(100).key, "closed");
});

test("mobility route excludes the stairs-only washroom shortcuts", () => {
  const standard = findRoute({ from: "section204", to: "washroom", loads: balanced, mobility: false });
  const accessible = findRoute({ from: "section204", to: "washroom", loads: balanced, mobility: true });
  assert.ok(standard.minutes < accessible.minutes);
  assert.ok(accessible.path.includes("concourse"));
});

test("fallback briefing sanitises question text and retains approved route data", () => {
  const message = buildFallbackBrief({ route: { path: ["fanPlaza", "gateB", "concourse", "section204"], minutes: 13 }, destination: "seat204", language: "en", loads: balanced, question: "<script>alert(1)</script>" });
  assert.match(message, /Gate B/);
  assert.doesNotMatch(message, /<script>/);
  assert.equal(safeQuestion("  hello\u0000 <world> "), "hello world");
});

test("fallback briefing tells fans when a separate gate is being diverted", () => {
  const message = buildFallbackBrief({
    route: { path: ["fanPlaza", "gateB", "concourse", "section204"], minutes: 12 },
    destination: "seat204",
    language: "en",
    loads: { gateA: 92, gateB: 31, gateC: 48 }
  });
  assert.match(message, /Crowding detected/);
  assert.match(message, /Gate B/);
});
