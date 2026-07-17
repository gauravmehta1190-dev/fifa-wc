# Implementation Design: Smart Crowd Operations Center

## 1. Selected Persona & Vertical Focus

This system targets the **Stadium Organizer (Primary)** and **Volunteer (Secondary)** personas to solve critical matchday safety bottlenecks, route congestions, and language-context urgencies.

```
                  +----------------------------------+
                  |  CCTV telemetry & Gate swipes    |
                  +-----------------+----------------+
                                    |
                                    v
                  +-----------------+----------------+
                  |    Explainable AI (XAI) Engine   |
                  +-----------------+----------------+
                                    |
            +-----------------------+-----------------------+
            | (If queue wait > 15m)                         | (If incident reports)
            v                                               v
+-----------+-----------+                       +-----------+-----------+
| Propose redirect route |                       | Urgency context check |
+-----------+-----------+                       +-----------+-----------+
            |                                               |
            v (Approve & Broadcast)                         v (Suggested action)
+-----------+-----------+                       +-----------+-----------+
| Dynamic SMS Alerts    |                       | Volunteer Handset App |
+-----------------------+                       +-----------------------+
```

---

## 2. Explainable AI (XAI) Logic Model

Traditional crowd dashboards display static density values. This dashboard integrates an **Explainable AI (XAI)** reasoning feed. When a gate's queue exceeds 15 minutes, the AI triggers a redirection recommendation under a clear, math-supported justification:

$$\text{Net Walk Time Savings} = \text{Source Gate wait time} - \text{Target Gate wait time} - \text{Additional Walk duration}$$

### XAI Reasoning Step Compilation:
1.  **Ingestion:** "Gate B wait time is 25.0 mins (Limit: 15m). Current flow rate 120 p/min."
2.  **Risk Analysis:** "Safety density is at 90%. Bottleneck in West Corridor will occur within 6 mins, creating structural crush risks near ticket turnstiles."
3.  **Alternative Mapping:** "Gate D is operating nominally at 2.0m queue (flow capacity remaining: 110 p/m)."
4.  **Tradeoff Reasoning:** "Redirecting 50% of incoming transit flows via mobile alerts increases walk distance by 140m (+2 mins) but reduces average queue wait by 23.0 mins, yielding a net savings of 21.0 mins per fan and dispersing turnstile pressure."

---

## 3. Volunteer App Urgency Natural Language Processor (NLP)

When foreign fans approach volunteers, language barriers slow down resolution. The **Volunteer Co-Pilot** chatbot automatically detects high-stress context markers (medical, child safety, physical danger) across multiple dialects:
-   **Japanese Distress:** "トイレはどこですか？お腹が痛いです" (Where is the restroom? My stomach hurts) -> Translated, labeled **CRITICAL (Medical)**. Instructions Carlos to escort to Medical Tent B instead of just pointing to toilets.
-   **Spanish Distress:** "¿Dónde está la salida? Mi hijo se ha perdido" (Where is the exit? My son is lost) -> Translated, labeled **CRITICAL (Lost Child)**. Activates safety alert and instructs Carlos to keep the parent at Gate B info desk.
-   **Low Urgency Query:** "Where is the nearest vegan food stall?" -> Labeled **NOMINAL (Info)**. Simply directs fan to Food Court East.

---

## 4. Google Cloud Platform Integrations Schema

```
[Web Application (Client App)]
      |
      +---> (Google Maps API) ------> Custom Dark Stylized Geo Sat Map (Estadio Azteca)
      |
      +---> (Firebase SDK) ---------> Firestore Real-time telemetry collections
      |
      +---> (Dockerfile/Build) -----> Containerized package deployed to Cloud Run
      |
      +---> (Google Adsense) -------> Mock monetized banner layout on smartphone
```

### Firestore Database Payload Shape:
```json
{
  "timestamp": "16:51:24",
  "activeIncidentsCount": 1,
  "gates": {
    "A": { "queueTime": 3.2, "flowRate": 95, "density": 40 },
    "B": { "queueTime": 24.8, "flowRate": 20, "density": 92 }
  }
}
```
*Telemetries write to the Firestore collection `stadium_telemetry` on every simulation tick.*
