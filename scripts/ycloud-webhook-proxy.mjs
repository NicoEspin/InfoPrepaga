// Local-only Quick Tunnel origin. No login, CRM, health or administrative routes.
import http from "node:http";
import { pathToFileURL } from "node:url";

const limit = 128 * 1024;
export function createWebhookProxy(
  upstream = "http://127.0.0.1:3340/webhooks/ycloud",
  timeoutMs = 5000,
) {
  return http.createServer((req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ message }));
    };
    if (req.url !== "/webhooks/ycloud") return reply(404, "NOT_FOUND");
    if (req.method !== "POST") return reply(405, "METHOD_NOT_ALLOWED");
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        req.headers["content-type"] ?? "",
      ) ||
      !["", "identity"].includes(req.headers["content-encoding"] ?? "")
    )
      return reply(415, "YCLOUD_JSON_REQUIRED");
    const signature = req.headers["ycloud-signature"];
    if (typeof signature !== "string" || signature.length > 1024)
      return reply(401, "YCLOUD_SIGNATURE_INVALID");
    const chunks = [];
    let size = 0;
    let finished = false;
    const stop = (status, message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chunks.length = 0;
      reply(status, message);
    };
    const timer = setTimeout(
      () => stop(408, "YCLOUD_REQUEST_TIMEOUT"),
      timeoutMs,
    );
    req.on("data", (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) return stop(413, "YCLOUD_BODY_TOO_LARGE");
      chunks.push(chunk);
    });
    req.on("error", () => stop(400, "YCLOUD_BODY_INVALID"));
    req.on("end", async () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        const response = await fetch(upstream, {
          method: "POST",
          body: Buffer.concat(chunks),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "content-type": "application/json",
            "ycloud-signature": signature,
          },
        });
        res.writeHead(response.status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(await response.arrayBuffer().then((body) => Buffer.from(body)));
      } catch {
        if (!res.headersSent) reply(503, "YCLOUD_BACKEND_UNAVAILABLE");
        else res.end();
      }
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createWebhookProxy();
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  server.listen(3342, "127.0.0.1", () =>
    console.log(
      "YCloud webhook proxy: 127.0.0.1:3342 → 127.0.0.1:3340/webhooks/ycloud",
    ),
  );
  server.on("error", () => {
    console.error("YCloud proxy could not start. Check the local port.");
    process.exitCode = 1;
  });
}
