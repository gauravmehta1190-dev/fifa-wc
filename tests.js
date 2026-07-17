/* ==========================================================================
   FIFA WC 2026 Crowd Management - Visual Unit Testing Suite
   ========================================================================== */

// Visual Mocks for Google Cloud Services (GCP)
if (typeof window.google === 'undefined') {
  window.google = {
    maps: {
      Map: function() {
        return {
          setCenter: function() {},
          setZoom: function() {}
        };
      },
      Marker: function() {
        return {
          setIcon: function() {},
          addListener: function() {}
        };
      },
      InfoWindow: function() {
        return {
          setContent: function() {},
          open: function() {}
        };
      },
      Point: function(x, y) { return { x, y }; },
      event: { trigger: function() {} }
    }
  };
}

if (typeof window.firebase === 'undefined') {
  window.firebase = {
    initializeApp: function() {},
    firestore: function() {
      return {
        collection: function() {
          return {
            add: function() { return Promise.resolve(); }
          };
        }
      };
    }
  };
}

const testSuite = {
  tests: [],

  addTest(name, description, fn) {
    this.tests.push({ name, description, fn });
  },

  async run(onTestComplete, onFinished) {
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < this.tests.length; i++) {
      const test = this.tests[i];
      let success = false;
      let errorMsg = "";
      
      try {
        await test.fn();
        success = true;
        passed++;
      } catch (err) {
        success = false;
        errorMsg = err.message || err;
        failed++;
        console.error(`Test Fail: ${test.name}`, err);
      }

      onTestComplete({
        name: test.name,
        description: test.description,
        success,
        error: errorMsg
      });
    }

    onFinished({ passed, failed, total: this.tests.length });
  }
};

// Assertion Helpers
function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Assertion Failed"}: Expected [${expected}], but got [${actual}]`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`${message || "Assertion Failed"}: Expected condition to be true`);
  }
}

/* ==========================================================================
   Test Declarations
   ========================================================================== */

// 1. Urgency Detection & Natural Translation AI Tests
testSuite.addTest(
  "Urgency Detection - Casual Query",
  "Verifies that non-safety queries (food, ticket scans) are marked low urgency.",
  () => {
    // English Casual Food query
    const res1 = analyzeUrgencyAndTranslate("Where is the nearest vegan food stall?");
    assertEquals(res1.isUrgent, false, "Casual food query should not be urgent");
    assertTrue(res1.action.includes("Food Court East"), "Should route to food court");

    // German Ticket query
    const res2 = analyzeUrgencyAndTranslate("Wo kann ich mein Ticket scannen?");
    assertEquals(res2.isUrgent, false, "Ticket query should not be urgent");
    assertTrue(res2.translation.includes("scan"), "Translation should detect scan query");
  }
);

testSuite.addTest(
  "Urgency Detection - Japanese Stomach Pain (Medical)",
  "Verifies Japanese medical emergency context is parsed and flags high urgency instructions.",
  () => {
    const query = "トイレはどこですか？お腹が痛いです";
    const res = analyzeUrgencyAndTranslate(query);
    
    assertEquals(res.isUrgent, true, "Severe stomach pain query must trigger high urgency");
    assertTrue(res.translation.includes("stomach hurts"), "Translation should capture stomach pain");
    assertTrue(res.action.includes("Medical Bay"), "Action should guide Carlos to West Medical Bay");
  }
);

testSuite.addTest(
  "Urgency Detection - Spanish Lost Child (Safety)",
  "Verifies Spanish lost-child context flags high urgency and activates standard containment protocol.",
  () => {
    const query = "¿Dónde está la salida? Mi hijo se ha perdido";
    const res = analyzeUrgencyAndTranslate(query);
    
    assertEquals(res.isUrgent, true, "Lost child scenario must trigger high urgency");
    assertTrue(res.translation.toLowerCase().includes("lost") || res.translation.toLowerCase().includes("perdido"), "Translation should detect lost/child terms");
    assertTrue(res.action.includes("Lost Child Protocol"), "Should activate Lost Child security protocol");
  }
);

testSuite.addTest(
  "Urgency Detection - Extreme English Distress Codes",
  "Verifies trigger keywords like 'collapsed', 'breathing', and 'emergency' instantly flag critical level.",
  () => {
    const res = analyzeUrgencyAndTranslate("Help! Someone has collapsed and is not breathing well!");
    assertEquals(res.isUrgent, true, "Breathing/collapse must trigger critical flag");
    assertTrue(res.action.includes("Medical Dispatch"), "Should route medical squad");
  }
);

// 2. XAI Congestion & Redirection Tests
testSuite.addTest(
  "XAI Decision - Nominal System Behavior",
  "Verifies that when queues are low (<15 mins), no routing alerts are generated.",
  () => {
    // Inject normal states
    appState.gates.A.queueTime = 2.5;
    appState.gates.B.queueTime = 3.0;
    appState.gates.C.queueTime = 1.8;
    appState.gates.D.queueTime = 2.1;
    
    evaluateSystemHealth();
    assertEquals(appState.activeRecommendations.length, 0, "No recommendations should exist for nominal queues");
  }
);

testSuite.addTest(
  "XAI Decision - Redirection Recommendations Trigger",
  "Verifies that when a gate queue exceeds 15m, XAI recommendation is compiled pointing to the lowest congestion alternative.",
  () => {
    // Inject warning state on Gate B
    appState.gates.A.queueTime = 4.0;
    appState.gates.B.queueTime = 24.5; // Critical bottleneck
    appState.gates.C.queueTime = 3.5;
    appState.gates.D.queueTime = 1.2; // Lowest queue target
    
    evaluateSystemHealth();
    
    assertEquals(appState.activeRecommendations.length, 1, "Should compile exactly 1 redirection warning");
    
    const rec = appState.activeRecommendations[0];
    assertEquals(rec.sourceGate.id, "Gate B", "Source should be Gate B");
    assertEquals(rec.targetGate.id, "Gate D", "Target should be lowest queue gate (Gate D)");
    assertTrue(rec.reasoningSteps.length >= 4, "Should provide step-by-step explainable reasoning metrics");
  }
);

testSuite.addTest(
  "XAI Decision - Redirection Action Mitigation",
  "Verifies that approving a redirection adjusts simulation inputs (limits source inflow, shifts load).",
  () => {
    // Setup bottleneck
    appState.gates.B.queueTime = 25.0;
    appState.gates.B.flowRate = 120;
    appState.gates.D.queueTime = 2.0;
    appState.gates.D.flowRate = 40;
    
    evaluateSystemHealth();
    
    const rec = appState.activeRecommendations[0];
    appState.selectedRecommendation = rec;
    appState.activeLang = 'en';
    
    // Trigger approval
    sendBroadcast();
    
    // Check that queues/flows shifted
    assertTrue(appState.gates.B.flowRate < 60, "Source gate B inflow should be throttled");
    assertTrue(appState.gates.B.queueTime < 15, "Source gate B queue should fall");
    assertTrue(appState.gates.D.flowRate > 60, "Target gate D inflow should receive redirected crowd load");
  }
);

// 3. CSV Parser & Out-Of-Bounds Telemetry Checks
testSuite.addTest(
  "CSV Validation - Missing Header File Check",
  "Verifies parser rejects CSVs with misaligned headers.",
  () => {
    const badCSV = "Header1,Header2,Header3,Header4\nval1,val2,val3,val4";
    let outputLog = [];
    
    // Mock logging
    const originalLog = addLogEntry;
    addLogEntry = (src, txt, typ) => { outputLog.push({src, txt, typ}); };
    
    parseAndValidateCSV(badCSV, "bad.csv");
    
    // Restore
    addLogEntry = originalLog;
    
    const failedLog = outputLog.find(l => l.txt.includes("Missing critical headers"));
    assertTrue(!!failedLog, "Missing header check must fail validation");
  }
);

testSuite.addTest(
  "CSV Validation - Out-of-bounds Anomaly Detections",
  "Checks that values like negative queues or densities > 100% are flagged as anomalies.",
  () => {
    const csvContent = `Timestamp,ElementType,ElementID,Parameter,Value,Description
16:51:00,gate,Gate B,queuetime,-12,Negative wait time anomaly
16:51:02,gate,Gate B,density,140,Exceeded percentage limits`;

    let outputLog = [];
    const originalLog = addLogEntry;
    addLogEntry = (src, txt, typ) => { outputLog.push({src, txt, typ}); };
    
    parseAndValidateCSV(csvContent, "outofbound.csv");
    
    addLogEntry = originalLog;

    const anomalies = outputLog.filter(l => l.txt.includes("Anomaly check"));
    assertEquals(anomalies.length, 2, "Should identify both negative and excess-density rows as anomalies");
    assertEquals(appState.csvAnomalies, 2, "State anomalies count should increment to 2");
  }
);

testSuite.addTest(
  "CSV Playback - Event state binding",
  "Verifies CSV rows correctly adjust simulator clock and gate variables during run playback.",
  () => {
    const row = {
      timestamp: "18:40:12",
      elementType: "gate",
      elementId: "GATE A",
      parameter: "queuetime",
      value: "35.5"
    };
    
    applyCSVRowToState(row);
    
    // Verify changes
    assertEquals(document.getElementById("sim-clock").innerText, "18:40:12", "Clock should update to row timestamp");
    assertEquals(appState.gates.A.queueTime, 35.5, "Gate A queue time must match CSV value");
  }
);

testSuite.addTest(
  "XSS Sanitization - HTML Escaping",
  "Verifies that escapeHTML utility strips tags to prevent Cross-Site Scripting (XSS).",
  () => {
    const maliciousInput = "<script>alert('xss')</script><img src=x onerror=critical()>";
    const sanitized = escapeHTML(maliciousInput);
    
    assertTrue(!sanitized.includes("<script>"), "Sanitized text should contain no raw script tags");
    assertTrue(sanitized.includes("&lt;script&gt;"), "Tags must be escaped to &lt; and &gt; entities");
  }
);

testSuite.addTest(
  "Simulation Controller - Environment Reset",
  "Verifies resetting simulation clears active incidents and restores default telemetry metrics.",
  () => {
    // Pollute state
    appState.gates.A.queueTime = 45.0;
    appState.incidents.push({ type: 'gate_malfunction', description: 'Test Incident' });
    
    resetSimulation();
    
    assertEquals(appState.incidents.length, 0, "Incidents should be cleared after reset");
    assertEquals(appState.gates.A.queueTime, 3.2, "Gate A queue time should restore to default (3.2m)");
  }
);

testSuite.addTest(
  "Map View - Toggle Layers Visibility",
  "Verifies switchMapView correctly updates active class selections and sets aria-selected properties.",
  () => {
    switchMapView('google');
    
    const svgTab = document.getElementById("map-tab-svg");
    const googleTab = document.getElementById("map-tab-google");
    const googleContainer = document.getElementById("google-map-container");
    
    assertEquals(googleTab.classList.contains("active"), true, "Google map tab should be active");
    assertEquals(svgTab.classList.contains("active"), false, "SVG map tab should not be active");
    assertEquals(googleTab.getAttribute("aria-selected"), "true", "Google tab aria-selected must be true");
    assertEquals(googleContainer.classList.contains("hidden"), false, "Google map container should be visible");
    
    // Restore default
    switchMapView('svg');
  }
);

testSuite.addTest(
  "Foreign Language Translation - German query check",
  "Verifies German input maps to correct English query representation.",
  () => {
    const res = analyzeUrgencyAndTranslate("Wo kann ich mein Ticket scannen?");
    assertEquals(res.translation, "Where can I scan my ticket?", "Should map German scan query to English translation preset");
    assertEquals(res.isUrgent, false, "Scan ticket should be low urgency");
  }
);

// Global Exposure for browser testing console
window.testSuite = testSuite;
window.runTestSuite = function(onTestComplete, onFinished) {
  testSuite.run(onTestComplete, onFinished);
};
