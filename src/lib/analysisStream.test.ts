import assert from "node:assert/strict";
import test from "node:test";

import {
  createLlmProgressTracker,
  encodeSseEvent,
  extractOpenRouterDeltaContent,
} from "./analysisStream";

test("encodeSseEvent formats named server-sent events", () => {
  assert.equal(
    encodeSseEvent("progress", { progress: 72, message: "Thinking through the action plan..." }),
    'event: progress\ndata: {"progress":72,"message":"Thinking through the action plan..."}\n\n'
  );
});

test("extractOpenRouterDeltaContent collects streamed delta text and ignores done markers", () => {
  const chunk = [
    'data: {"choices":[{"delta":{"content":"{\\"free_action_plan\\":"}}]}',
    'data: {"choices":[{"delta":{"content":"[\\"Fix wait times\\""}}]}',
    "data: [DONE]",
    "",
  ].join("\n");

  assert.equal(
    extractOpenRouterDeltaContent(chunk),
    '{"free_action_plan":["Fix wait times"'
  );
});

test("createLlmProgressTracker advances only when LLM chunks arrive", () => {
  const tracker = createLlmProgressTracker({ start: 65, ceiling: 96, expectedChars: 100 });

  assert.equal(tracker.current(), 65);
  assert.equal(tracker.recordChunk("1234567890"), 68);
  assert.equal(tracker.recordChunk("x".repeat(1000)), 96);
  assert.equal(tracker.current(), 96);
});
