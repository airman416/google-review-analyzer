export interface LlmProgressTrackerOptions {
  start: number;
  ceiling: number;
  expectedChars: number;
}

export function encodeSseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function extractOpenRouterDeltaContent(chunk: string): string {
  return chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length).trim())
    .filter((data) => data && data !== "[DONE]")
    .map((data) => {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };

        return parsed.choices?.[0]?.delta?.content ?? "";
      } catch {
        return "";
      }
    })
    .join("");
}

export function createLlmProgressTracker(options: LlmProgressTrackerOptions) {
  let receivedChars = 0;
  let progress = options.start;
  const range = Math.max(0, options.ceiling - options.start);
  const expectedChars = Math.max(1, options.expectedChars);

  return {
    current() {
      return progress;
    },
    recordChunk(chunk: string) {
      receivedChars += chunk.length;
      const ratio = Math.min(1, receivedChars / expectedChars);
      progress = Math.min(options.ceiling, Math.round(options.start + range * ratio));
      return progress;
    },
  };
}
