export interface AiModelInfo {
  label: string
  /** USD per 1M input tokens. */
  inPerM: number
  /** USD per 1M output tokens, reasoning tokens included. */
  outPerM: number
}

export type ReasoningEffort = "low" | "medium"

export const AI_MODELS = {
  "openai/gpt-oss-120b": { label: "GPT-OSS 120B", inPerM: 0.15, outPerM: 0.6 },
  "openai/gpt-oss-20b": { label: "GPT-OSS 20B", inPerM: 0.075, outPerM: 0.3 },
} as const satisfies Record<string, AiModelInfo>

/** Groq preview models: may be discontinued at short notice, so eval comparison only, never selectable. */
export const EVAL_ONLY_MODELS = {
  "qwen/qwen3.8-27b": { label: "Qwen3.8 27B (preview)", inPerM: 0.8, outPerM: 4 },
} as const satisfies Record<string, AiModelInfo>

export type AiModelId = keyof typeof AI_MODELS
export type EvalModelId = AiModelId | keyof typeof EVAL_ONLY_MODELS

export const DEFAULT_AI_MODEL: AiModelId = "openai/gpt-oss-120b"
/** Used automatically when the default answers 429 or 5xx. */
export const FALLBACK_AI_MODEL: AiModelId = "openai/gpt-oss-20b"
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low"

export function modelInfo(id: EvalModelId): AiModelInfo {
  return id in AI_MODELS ? AI_MODELS[id as AiModelId] : EVAL_ONLY_MODELS[id as keyof typeof EVAL_ONLY_MODELS]
}

export function costUsd(id: EvalModelId, inputTokens: number, outputTokens: number): number {
  const info = modelInfo(id)
  return (inputTokens * info.inPerM + outputTokens * info.outPerM) / 1_000_000
}
