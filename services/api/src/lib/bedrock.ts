import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ConverseFn } from "../domain/bedrockPicker.js";

export function sdkConverse(client = new BedrockRuntimeClient({ maxAttempts: 1 })): ConverseFn {
  return async ({ signal, ...req }) => {
    const out = await client.send(new ConverseCommand(req), { abortSignal: signal });
    return out.output?.message?.content?.map((c) => c.text ?? "").join("") || undefined;
  };
}
