import assert from "node:assert/strict";
import test from "node:test";

import { buildApiUrl } from "./apiBaseUrl";

test("buildApiUrl keeps relative API paths when no backend URL is configured", () => {
  assert.equal(buildApiUrl("/api/analyze-restaurant"), "/api/analyze-restaurant");
});

test("buildApiUrl joins configured backend URL and API path", () => {
  assert.equal(
    buildApiUrl("/api/analyze-restaurant", "https://owner-api.fly.dev/"),
    "https://owner-api.fly.dev/api/analyze-restaurant"
  );
});
