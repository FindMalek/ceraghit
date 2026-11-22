import { describe, expect, test } from "bun:test"
import { MockLanguageModelV4 } from "ai/test"
import { translateWith } from "../src/lib/translate/eval"
import { buildTranslatePrompt, KEEP } from "../src/lib/translate/prompt"
import { lengthRatio, scoreArabicScript, scoreKeep } from "../src/lib/translate/score"

const request = {
  field: "description",
  maxLength: 3000,
  source: { lang: "fr" as const, text: "Pièce signée par Sabri Ghit." },
  targets: ["en" as const, "ar" as const],
}

function modelAnswering(text: string) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 40, text: 30, reasoning: 10 },
      },
      warnings: [],
    },
  })
}

describe("buildTranslatePrompt", () => {
  test("states the names to keep, the targets, the max length and the length rule", () => {
    const { system, prompt } = buildTranslatePrompt(request)
    for (const name of ["Ceraghit", "Ceraghit Creation", "Sabri Ghit", ...KEEP]) expect(system).toContain(name)
    expect(system).toContain("en (English), ar (Arabic)")
    expect(system).toContain("never longer than 3000 characters")
    expect(system).toContain("within 25% of the source length")
    expect(prompt).toContain("Pièce signée par Sabri Ghit.")
  })
})

describe("scorers", () => {
  test("lengthRatio compares characters and skips empty sources", () => {
    expect(lengthRatio("abcd", "abcde")).toBe(1.25)
    expect(lengthRatio("  ", "x")).toBeNull()
  })

  test("scoreKeep counts brand names and refs kept verbatim", () => {
    const source = "Pièce signée par Sabri Ghit, réf. CG-112."
    expect(scoreKeep(source, "Piece signed by Sabri Ghit, ref. CG-112.")).toBe(1)
    expect(scoreKeep(source, "قطعة موقعة من صبري غيث، CG-112.")).toBe(0.5)
    expect(scoreKeep("Un bol bleu.", "A blue bowl.")).toBeNull()
  })

  test("scoreArabicScript accepts kept names and units, flags Latin words and Eastern digits", () => {
    expect(scoreArabicScript("قطعة من Ceraghit Creation بقطر 27 cm").valid).toBe(true)
    const bad = scoreArabicScript("وعاء glazed بقطر ٢٧ سم")
    expect(bad.latinWords).toEqual(["glazed"])
    expect(bad.easternDigits).toBe(2)
    expect(bad.valid).toBe(false)
  })
})

describe("translateWith", () => {
  test("sends the reasoning effort with a strict schema and returns output and usage", async () => {
    const model = modelAnswering(JSON.stringify({ en: "Piece signed by Sabri Ghit.", ar: "قطعة موقعة من Sabri Ghit." }))
    const result = await translateWith(model, "low", request)
    expect(result.output).toEqual({ en: "Piece signed by Sabri Ghit.", ar: "قطعة موقعة من Sabri Ghit." })
    expect(result.inputTokens).toBe(120)
    expect(result.outputTokens).toBe(40)
    const call = model.doGenerateCalls[0]
    expect(call?.providerOptions?.groq).toMatchObject({ reasoningEffort: "low", strictJsonSchema: true })
    expect(call?.responseFormat).toMatchObject({
      type: "json",
      schema: { required: ["en", "ar"], additionalProperties: false },
    })
  })

  test("reports a parse failure instead of throwing", async () => {
    const result = await translateWith(modelAnswering("not json"), "low", request)
    expect(result.output).toBeNull()
    expect(result.error).not.toBeNull()
  })
})

test("translateWith gives up on a model that never answers, as a failed call the fallback can take over", async () => {
  const hung = new MockLanguageModelV4({
    doGenerate: (options) =>
      new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")))
      }),
  })
  const started = performance.now()
  const result = await translateWith(hung, "low", request, 50)
  expect(result.output).toBeNull()
  expect(result.error).not.toBeNull()
  expect(performance.now() - started).toBeLessThan(2000)
})
