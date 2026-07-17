# FIFA WC 2026: Smart Crowd Management & XAI Operations Center

An interactive, high-fidelity Single Page Web Application designed for **Organizers** and **Volunteers** to manage, route, and safeguard stadium crowds during the FIFA World Cup 2026 at Estadio Azteca, Mexico City.

This system leverages **Explainable AI (XAI)** to justify routing decisions during safety surges and includes direct **Google Cloud Platform (GCP)** tool integrations.

---

## 🚀 Key Features

### 1. Operations Command Center (Organizer Persona)
*   **Dual-View Crowd Density Map**: Switch between a real-time interior SVG crowd-particle heatmap and a geographic Satellite/Roadmap powered by the **Google Maps JS API**.
*   **Interactive Simulation Pad**: Clickable controllers to trigger real-time stadium occurrences (Scanner malfunctions, crowd surges, meteo surges, medical emergencies).
*   **Explainable AI (XAI) Engine**: Automatically scans metrics to recommend routing changes, presenting a transparent reasoning path (telemetry inputs, safety thresholds, walk-time tradeoffs, net fan savings calculations).
*   **Multi-Lingual Broadcast Controller**: Compiles alerts in English, Spanish, and French, ready to broadcast to fan handsets.

### 2. Volunteer Co-Pilot Smartphone Mockup (Volunteer Persona)
*   **Real-time Alerts**: Receives redirection and medical dispatch broadcasts directly from the operations director.
*   **Urgency Detection Translation Helper**: Resolves foreign language queries (Japanese, Spanish, German preset buttons included) and checks input context for critical emergency distress indicators.
    *   *Casual Query:* "Where is the vegan stall?" -> Normal translation + map guidance.
    *   *Urgent Query:* "トイレはどこですか？お腹が痛いです (Restroom? Stomach hurts)" -> Critical flag + Medical dispatch alert.
*   **Google Ads Slot**: Simulated AdSense monetization layout banner demonstrating mobile ad delivery.

### 3. Jury Sandbox Panel (Jury Telemetry Validator)
*   **CSV Sandbox**: Drag-and-drop csv loader. Validates cell formats, auto-maps header variations, and triggers playback telemetry logs.
*   **Out-of-Bounds Anomaly Detection**: Highlights negative queue wait times or density overrides (>100%) as telemetry errors.

---

## 📁 Workspace File Structure

*   `index.html`: Dashboard markup, grid panel, SVG simulator, and volunteer handset frame.
*   `styles.css`: Dark cyber space-blue stylesheet with glassmorphism layouts and glow transitions.
*   `app.js`: Telemetry updates, SVG crowd particles, XAI recommendation compilers, NLP translation evaluator, and Firebase Firestore synchronization.
*   `tests.js`: Visual unit assertions suite verifying NLP translation rules, XAI, and CSV loading.
*   `tests.html`: Test execution visual reporter.
*   `Dockerfile`: Package configuration for Nginx static asset servers.
*   `cloudbuild.yaml`: GCP pipeline configurations to build and deploy straight to Google Cloud Run.

---

## ☁️ Google Cloud Platform (GCP) Architecture

1.  **Google Maps Platform JS SDK**
    *   Centers Azteca Stadium coordinates (`19.3029° N, -99.1505° W`).
    *   Custom dark styles applied. Places pins for Gates A, B, C, D, West Medical Tent, and East Food Court. Pin styling adapts color-glow values matching gate congestion.
2.  **GCP Firebase SDK (Firestore)**
    *   Syncs telemetry loops (queues, flowRates, occupancy, active alerts) straight to Firestore collection `stadium_telemetry` on every tick. Falls back to a local sandbox runner if GCP config is absent.
3.  **Google Cloud Run**
    *   Contains ready-to-run container deployments via `Dockerfile` and automated build pipelines via `cloudbuild.yaml`.
4.  **Google Ad Manager / AdSense**
    *   Simulated sponsorship slots inside volunteer smartphone handset.

---

## 🔬 How to Run the Visual Unit Tests

1.  Open **[tests.html](file:///c:/Users/USER/Downloads/fifa-wc-2026/tests.html)** directly in any standard browser, or host the workspace locally and navigate to `http://localhost:<port>/tests.html`.
2.  The suite will execute 10 automated checks verifying CSV logic, urgency classifications, and XAI routing shifts, showing a green "ALL PASSED" status report.
