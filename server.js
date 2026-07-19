import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 20_000;
const FILES = new Map([
  ["/", "index.html"], ["/index.html", "index.html"], ["/styles.css", "styles.css"],
  ["/app.js", "app.js"], ["/core.js", "core.js"]
]);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
  });
  response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request too large"));
        request.destroy();
      } else raw += chunk;
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Invalid JSON")); }
    });
    request.on("error", reject);
  });
}

function clean(value, max = 280) {
  return String(value ?? "").replace(/[<>\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function concierge(request, response) {
  if (!request.headers["content-type"]?.includes("application/json")) {
    return send(response, 415, { error: "Expected application/json" });
  }
  let input;
  try { input = await readJson(request); } catch (error) { return send(response, 400, { error: error.message }); }
  const route = clean(input.route, 700);
  const userQuestion = clean(input.question);
  const language = ["en", "es", "fr", "pt"].includes(input.language) ? input.language : "en";
  if (!route) return send(response, 400, { error: "An approved route is required" });

  // An optional server-side LLM adapter. The key stays on the server, and the
  // model only receives the approved operational brief—not free-form telemetry.
  if (process.env.OPENAI_API_KEY) {
    try {
      const system = "You are StadiumFlow AI, a calm FIFA 2026 stadium assistant. " +
        "Only explain the APPROVED ROUTE. Never invent gates, times, services, or emergency instructions. " +
        "Return plain text under 90 words in the requested language. If an emergency is mentioned, tell the person to contact a steward or local emergency services now.";
      const prompt = `Language: ${language}\nAPPROVED ROUTE: ${route}\nFan question: ${userQuestion || "None"}`;
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: [{ role: "system", content: system }, { role: "user", content: prompt }], max_output_tokens: 180 })
      });
      if (upstream.ok) {
        const output = await upstream.json();
        const message = clean(output.output_text, 900);
        if (message) return send(response, 200, { message, source: "ai" });
      }
    } catch {
      // The app remains available offline; no upstream error details reach users.
    }
  }
  return send(response, 200, { message: "Offline operational brief ready.", source: "local" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/concierge") return concierge(request, response);
  if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, { error: "Method not allowed" });
  const relative = FILES.get(url.pathname);
  if (!relative) return send(response, 404, { error: "Not found" });
  try {
    const content = await readFile(join(root, relative));
    return send(response, 200, request.method === "HEAD" ? "" : content, types[extname(relative)]);
  } catch { return send(response, 500, { error: "Unable to load application" }); }
});

server.listen(port, "127.0.0.1", () => console.log(`StadiumFlow AI running at http://127.0.0.1:${port}`));
