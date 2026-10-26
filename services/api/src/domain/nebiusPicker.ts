// PICK_MODE=nebius: Tonight's pick from Nemotron on Nebius Token Factory. Same grounded prompt and
// payload as the original picker; one call, JSON mode, reasoning off, hard timeout, no retries.
// Any problem → undefined → getTonight's validated fallback.
import { candidatePayload, parseModelJson, SYSTEM_PROMPT } from "./bedrockPicker.js";
import type { Picker } from "./tonight.js";
import { MODELS, type ChatFn } from "../lib/tokenFactory.js";

export const NEBIUS_PICK_TIMEOUT_MS = 5000;

export function makeNebiusPicker(chat: ChatFn, model: string = MODELS.fast, timeoutMs = NEBIUS_PICK_TIMEOUT_MS): Picker {
  return {
    source: "nebius",
    async pick(input) {
      const out = await chat({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(candidatePayload(input)) },
        ],
        json: true,
        maxTokens: 200,
        temperature: 0.2,
        timeoutMs,
      });
      return parseModelJson(out.content ?? undefined);
    },
  };
}
