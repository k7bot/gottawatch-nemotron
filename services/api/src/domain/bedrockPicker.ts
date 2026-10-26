// PICK_MODE=bedrock picker (spec §7.4 step 3, plan §5 step 5). One Converse call,
// 4 s timeout, no retries; any problem → undefined → caller uses the fallback.
import type { Candidate, Picker, PickerInput, PickerOutput } from "./tonight.js";

export const BEDROCK_TIMEOUT_MS = 4000;

// Prompt text from plan v2 §5 step 5.
export const SYSTEM_PROMPT =
  "You help a household choose ONE title to watch tonight. Choose only from the candidates below. " +
  "Explain why in 1-2 sentences using only the senders' notes, runtime, and genre given. " +
  "Do not invent facts, quotes, ratings, or plot details. " +
  'Reply as JSON: {"recId": "...", "reason": "..."}';

/** Minimal slice of BedrockRuntimeClient.send(ConverseCommand) we depend on (keeps tests SDK-free). */
export interface ConverseFn {
  (req: {
    modelId: string;
    system: { text: string }[];
    messages: { role: "user"; content: { text: string }[] }[];
    inferenceConfig: { maxTokens: number; temperature: number };
    signal: AbortSignal;
  }): Promise<string | undefined>; // the model's text output
}

export function candidatePayload(input: PickerInput) {
  return {
    weekday: input.weekday,
    candidates: input.candidates.map((c: Candidate) => ({
      recId: c.recId,
      title: c.title,
      mediaType: c.mediaType,
      ...(c.runtime ? { runtimeMinutes: c.runtime } : {}),
      ...(c.genres ? { genres: c.genres } : {}),
      senders: c.senders,
    })),
  };
}

/** Pulls the first {...} block out of the model text and checks field types. */
export function parseModelJson(text: string | undefined): PickerOutput | undefined {
  if (!text) return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj.recId === "string" && typeof obj.reason === "string") {
      return { recId: obj.recId, reason: obj.reason };
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

export function makeBedrockPicker(converse: ConverseFn, modelId: string, timeoutMs = BEDROCK_TIMEOUT_MS): Picker {
  return {
    source: "bedrock",
    async pick(input) {
      const signal = AbortSignal.timeout(timeoutMs);
      const text = await converse({
        modelId,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content: [{ text: JSON.stringify(candidatePayload(input)) }] }],
        inferenceConfig: { maxTokens: 200, temperature: 0.2 },
        signal,
      });
      return parseModelJson(text);
    },
  };
}
