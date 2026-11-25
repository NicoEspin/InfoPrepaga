import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createWebhookProxy } from "./ycloud-webhook-proxy.mjs";

test("Quick Tunnel origin exposes only the webhook and preserves authentication bytes", async () => {
  const raw = '{ "message": "Hola á 👋" }\n';
  const sign = (body) =>
    createHmac("sha256", "synthetic").update(body).digest("hex");
  let calls = 0;
  const upstream = http.createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/webhooks/ycloud");
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers.authorization, undefined);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    res.writeHead(req.headers["ycloud-signature"] === sign(body) ? 200 : 401);
    res.end("{}");
  });
  const listen = (server) =>
    new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = (server) =>
    new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  await listen(upstream);
  const target = `http://127.0.0.1:${upstream.address().port}/webhooks/ycloud`;
  const proxy = createWebhookProxy(target, 200);
  await listen(proxy);
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const headers = {
    "content-type": "application/json",
    "ycloud-signature": sign(raw),
    cookie: "private=test",
    authorization: "Bearer private",
  };
  const post = (body, extra = {}) =>
    fetch(base + "/webhooks/ycloud", {
      method: "POST",
      headers: { ...headers, ...extra },
      body,
    });
  try {
    for (const path of [
      "/",
      "/login",
      "/api/auth/login",
      "/api/crm/leads",
      "/docs",
      "/ready",
      "/webhooks/ycloud/../login",
      "/webhooks/ycloud?url=http://example.com",
    ])
      assert.equal((await fetch(base + path, { method: "POST" })).status, 404);
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])
      assert.equal(
        (await fetch(base + "/webhooks/ycloud", { method })).status,
        405,
      );
    assert.equal(calls, 0);
    assert.equal((await post(raw)).status, 200);
    assert.equal((await post(raw + " ")).status, 401);
    assert.equal((await post(raw, { "content-encoding": "gzip" })).status, 415);
    assert.equal(
      (await post(raw, { "content-type": "text/plain" })).status,
      415,
    );
    assert.equal((await post("x".repeat(128 * 1024 + 1))).status, 413);
    const chunked = await new Promise((resolve, reject) => {
      const req = http.request(
        base + "/webhooks/ycloud",
        { method: "POST", headers },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.write("x".repeat(100 * 1024));
      req.end("x".repeat(30 * 1024));
    });
    assert.equal(chunked, 413);
    const slow = await new Promise((resolve, reject) => {
      const req = http.request(
        base + "/webhooks/ycloud",
        { method: "POST", headers },
        (res) => {
          res.resume();
          req.end();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.write("{");
    });
    assert.equal(slow, 408);
    assert.equal(calls, 2);
    await close(upstream);
    assert.equal((await post(raw)).status, 503);
  } finally {
    await close(proxy);
    if (upstream.listening) await close(upstream);
  }
});
