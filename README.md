# StadiumFlow AI · FIFA World Cup 2026

StadiumFlow AI is a small, offline-first stadium companion for the FIFA World Cup 2026. It guides fans to the correct entry, seats, washrooms, first aid, parking and transit while giving venue teams a live crowd-diversion console.

The demo is deliberately dependency-free, runs in a browser, and is under 100 KB of source so it is easy to inspect during a hackathon.

## What problem it solves

| Moment | Fan experience | Operations outcome |
| --- | --- | --- |
| Arrival and parking | Finds the least-risk entry from parking, transit or the Fan Plaza | Spreads arrivals across available gates |
| Gate becomes overcrowded | Re-routes away from the affected gate, explains the change in plain language | Publishes one live decision to every fan journey |
| Seat / washroom / first aid | Provides short, step-by-step route guidance | Keeps the safety-critical routing rules deterministic |
| Language or mobility need | Four-language concierge response and optional step-free routing | Reduces dependence on a single volunteer language or route memory |

## Quick start

This project has no package installation step. Use the bundled Node runtime if `node` is not on your PATH:

```powershell
& "C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Then open `http://127.0.0.1:4173`. Select **Venue operations**, choose **Gate A overcrowded**, and the app will switch to the fan view with Gate B selected as the safer entry. Use the **First-aid request** playbook to test a step-free medical route.

## Tests

```powershell
& "C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test core.test.js
```

The tests cover malformed telemetry, closed gates, diversion from an overcrowded gate, accessible routing, and prompt/XSS sanitisation.

## GenAI design that stays safe during an event

The fan message is generated only **after** `core.js` has calculated a route from approved venue data. This prevents an LLM from making up a gate, ETA, or emergency procedure. It works completely offline with concise local language templates.

For optional live LLM personalisation, copy `.env.example` values into your environment before starting the server. The server-side adapter calls the Responses API only with the already-approved route summary; the API key never reaches the browser. If the model or network is unavailable, the local safety brief remains visible without interrupting navigation.

## Design notes for judging

- **Code quality:** UI, routing rules, server boundary, and tests are separated into small dependency-free files.
- **Security:** no client secrets; allow-listed static files; a small JSON request limit; strict input cleaning; safe `textContent` rendering for AI/user text; security headers; LLM constrained to an approved route.
- **Efficiency:** deterministic Dijkstra routing over a compact graph, no framework or image payloads, resilient local fallback.
- **Testing:** run the included node tests; manual scenario buttons are present for live demo testing.
- **Accessibility:** semantic landmarks, labels, keyboard controls, visible focus, skip link, status regions, high-contrast toggle, reduced-motion support, non-colour capacity labels, and step-free route option.
- **Problem alignment:** navigation, parking/transit, washrooms, first aid, multilingual assistance, crowd diversion, real-time operational decision support, and volunteer route sharing are all functional in the prototype.

## Production hand-off

Replace the demo map graph and slider data with venue-approved GIS paths, ticket-zone data, crowd density sensors, and a staffed incident workflow. Keep the deterministic policy layer as the final authority; an LLM should explain decisions, not create them.
