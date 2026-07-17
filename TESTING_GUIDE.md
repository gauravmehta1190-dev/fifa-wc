# Visual Unit Testing Guide & Assertion Checklist

This document details the automated unit test suite built inside the application to verify calculations, routing engines, NLP urgency detection, XSS protections, and file telemetry parsers.

---

## 🧪 Assertions Execution Table

The testing suite contains **14 visual assertions** grouped into four categories:

| # | Test Name | Target Module | Rationale / Edge Case Verified |
|---|---|---|---|
| **1** | Urgency Detection - Casual Query | `Volunteer Assistant` | Confirms normal food/scan tickets do not trigger safety flags and resolve with nominal scripts. |
| **2** | Urgency Detection - Japanese Stomach Pain | `Volunteer Assistant` | Checks context-urgency extraction on Japanese strings containing medical/distress words. |
| **3** | Urgency Detection - Spanish Lost Child | `Volunteer Assistant` | Checks context-urgency extraction on Spanish child-safety alerts. |
| **4** | Urgency Detection - Distress Codes | `Volunteer Assistant` | Confirms keywords like 'collapsed', 'breathing' trigger immediate emergency procedures. |
| **5** | XAI Decision - Nominal System Behavior | `XAI Engine` | Confirms no redirection recommendations generate if wait times are under 15 mins. |
| **6** | XAI Decision - Redirection Recommendations Trigger | `XAI Engine` | Verifies wait times over 15 mins compile redirection recommendations targeting the lowest load gate. |
| **7** | XAI Decision - Redirection Action Mitigation | `XAI Engine` | Confirms that approving redirects correctly mitigates load (shifts rates from bottlenecked gate to target gate). |
| **8** | CSV Validation - Missing Header Check | `Jury Sandbox` | Asserts that uploaded CSVs missing required headers fail validation and report errors. |
| **9** | CSV Validation - Anomaly Detections | `Jury Sandbox` | Verifies out-of-bounds metrics (negative wait times or density > 100%) flag warnings. |
| **10**| CSV Playback - Event state binding | `Jury Sandbox` | Checks that CSV playback advances the simulator clock and successfully modifies gate parameters. |
| **11**| XSS Sanitization - HTML Escaping | `Security Sanitizer` | Asserts that `escapeHTML` replaces raw script tags and tag markup with secure HTML entity representations to prevent injection. |
| **12**| Simulation Controller - Environment Reset | `Sim Controller` | Confirms that invoking `resetSimulation` clears active incidents, cleans SVG particles, and restores default telemetry metrics. |
| **13**| Map View - Toggle Layers Visibility | `Map Controller` | Verifies that shifting map views updates button active states, toggles layers visibility, and swaps `aria-selected` attributes. |
| **14**| Foreign Language Translation - German query check | `Volunteer Assistant` | Verifies German query parsing translates properly and resolves to a low urgency response. |

---

## 🏃 How to Run the Test Suite

### Option 1: Browser Launch
1. Open **[tests.html](file:///c:/Users/USER/Downloads/fifa-wc-2026/tests.html)** directly in Google Chrome or any modern browser.
2. The assertion suite runs automatically on load, showing real-time logs inside the monospaced visual terminal.
3. You can click the **"Run Assertion Suite"** button in the header at any time to re-run the assertions.

### Option 2: Local Server Deployment
If you are running the project on a local server (e.g. Nginx or Node `http-server`):
1. Navigate to `http://localhost:<port>/tests.html`.
2. The suite executes instantly and logs outputs to the browser console.
