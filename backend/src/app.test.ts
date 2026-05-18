import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "./app";

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
