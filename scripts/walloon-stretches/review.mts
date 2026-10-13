// Local review page for the Walloon stretch end points (#54).
// Run with `npm run review:walloon-stretches`, then open http://localhost:3461.
// Manual only. Uses cached OSM data (run `npm run data:walloon-stretches` first).
// Every confirm or move is written straight to docs/research/data/walloon-stretches-review.json,
// and the stretches are rebuilt from the cache so the page shows the result.
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { ROOT } from "./osmCache";
import { buildDataset, readReview, writeReview } from "./pipeline";

const PORT = Number(process.env.REVIEW_PORT ?? 3461);
const PAGE = path.join(ROOT, "scripts", "walloon-stretches", "review.html");
const LEAFLET = path.join(ROOT, "node_modules", "leaflet", "dist");

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

async function state() {
  const { draft, needingReview, problems, finalPath } = await buildDataset({ offline: true });
  const review = await readReview();
  return { draft, needingReview, problems, finalWritten: Boolean(finalPath), decisions: review.decisions };
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

type Decision = { id: string; action: "confirm" | "move" | "clear"; lat?: number; lng?: number; note?: string };

const isDecision = (d: unknown): d is Decision => {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  if (typeof x.id !== "string" || !/^[0-9][A-C][0-9][a-c]?\.(from|to)$/.test(x.id)) return false;
  if (x.action === "clear") return true;
  return (x.action === "confirm" || x.action === "move") && Number.isFinite(x.lat) && Number.isFinite(x.lng);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(PAGE, "utf8"));
      return;
    }
    if (req.method === "GET" && /^\/leaflet\/(leaflet\.(js|css)|images\/[a-z0-9-]+\.png)$/.test(url.pathname)) {
      const file = path.join(LEAFLET, url.pathname.slice("/leaflet/".length));
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "image/png";
      res.writeHead(200, { "Content-Type": type });
      createReadStream(file).pipe(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, await state());
    if (req.method === "POST" && url.pathname === "/api/decision") {
      const decision = await body(req);
      if (!isDecision(decision)) return json(res, 400, { error: "invalid decision" });
      const review = await readReview();
      if (decision.action === "clear") delete review.decisions[decision.id];
      else
        review.decisions[decision.id] = {
          action: decision.action,
          lat: Math.round(decision.lat! * 1e6) / 1e6,
          lng: Math.round(decision.lng! * 1e6) / 1e6,
          ...(decision.note ? { note: decision.note } : {}),
        };
      review.reviewedAt = new Date().toISOString().slice(0, 10);
      await writeReview(review);
      return json(res, 200, await state());
    }
    res.writeHead(404).end("not found");
  } catch (error) {
    json(res, 500, { error: String(error) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Walloon stretch review page: http://localhost:${PORT}`);
  console.log("Stop with Ctrl+C.");
});
