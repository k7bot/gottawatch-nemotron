// Nebius Token Factory client (OpenAI-compatible chat completions), plain fetch, no SDK.
// Every call has a hard timeout and no retries; callers treat any failure as "fall back".
// The API key is read once from the environment and never logged.

export const TOKEN_FACTORY_BASE_URL = "https://api.tokenfactory.nebius.com/v1";

/** Models chosen by tools/model-eval (see tools/model-eval/RESULTS.md). */
export const MODELS = {
  /** Ask Gottawatch agent: tool calling + JSON final answer. */
  agent: "nvidia/nemotron-3-super-120b-a12b",
  /** Tonight's pick and the Ask fallback reranker. */
  fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
} as const;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Ask for a JSON object (response_format json_object). Measured: removes most non-JSON finals. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Nemotron reasoning; off by default (faster, and JSON reliability was equal or better when off). */
  thinking?: boolean;
  timeoutMs: number;
}
export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  ms: number;
}

/** The transport the domain code depends on (tests inject a fake). */
export type ChatFn = (req: ChatRequest) => Promise<ChatResult>;

export class TokenFactoryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "TokenFactoryError";
  }
}

export function tokenFactoryChat(opts: { apiKey: string; baseUrl?: string; fetchFn?: typeof fetch }): ChatFn {
  const base = (opts.baseUrl ?? TOKEN_FACTORY_BASE_URL).replace(/\/+$/, "");
  const f = opts.fetchFn ?? fetch;
  if (!opts.apiKey) throw new Error("Token Factory API key is empty");
  return async (req) => {
    const t0 = Date.now();
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 400,
      temperature: req.temperature ?? 0.2,
    };
    if (req.tools?.length) body.tools = req.tools;
    if (req.json) body.response_format = { type: "json_object" };
    if (!req.thinking) body.chat_template_kwargs = { enable_thinking: false };
    let res: Response;
    try {
      res = await f(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
    } catch (e) {
      throw new TokenFactoryError(`Token Factory request failed: ${(e as Error).name}`);
    }
    if (!res.ok) throw new TokenFactoryError(`Token Factory HTTP ${res.status}`, res.status);
    const j = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      usage?: ChatResult["usage"];
    };
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new TokenFactoryError("Token Factory returned no choices");
    return { content: msg.content ?? null, toolCalls: msg.tool_calls ?? [], usage: j.usage, ms: Date.now() - t0 };
  };
}

/** Pulls the first {...} block out of model text. */
export function firstJsonObject(text: string | null | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
