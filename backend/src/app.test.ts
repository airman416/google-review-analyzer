import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "./app";
import { createAnalyzeRestaurantHandler } from "./analyzeRestaurant";

test("GET /health reports service readiness", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
  } finally {
    server.close();
  }
});

test("POST /api/analyze-restaurant rejects missing restaurant name", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/analyze-restaurant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: "abc123" }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "name is required");
  } finally {
    server.close();
  }
});

test("POST /api/analyze-restaurant returns JSON unless SSE is requested", async () => {
  const handler = createAnalyzeRestaurantHandler(async () => ({ ok: true }));
  const app = createApp({ analyzeRestaurantHandler: handler });
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/analyze-restaurant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Restaurant", place_id: "abc123" }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(body, { ok: true });
  } finally {
    server.close();
  }
});

test("POST /api/analyze-restaurant streams progress when SSE is requested", async () => {
  const handler = createAnalyzeRestaurantHandler(async (_payload, emitProgress) => {
    emitProgress?.(42, "Reading review evidence...", "Testing streamed progress");
    return { ok: true };
  });
  const app = createApp({ analyzeRestaurantHandler: handler });
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/analyze-restaurant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ name: "Test Restaurant", place_id: "abc123" }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);

    const streamText = await response.text();
    assert.match(streamText, /event: progress/);
    assert.match(streamText, /"progress":42/);
    assert.match(streamText, /event: complete/);
  } finally {
    server.close();
  }
});
