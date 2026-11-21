import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  assertBudget,
  buildPlan,
  createRunRecorder,
  creditRate,
  formatPlan,
  lockLedger,
  narrationFor,
  parseBudget,
  readLedger,
  uniqueLines,
} from "../lib/narration"
import { parseVideo } from "../lib/steps"

const video = (id: string, steps: object[]) =>
  parseVideo({ id, slug: "x", title_fr: "X", start: { app: "web", path: "/", loggedIn: false }, steps })
const step = (caption_fr: string, extra: object = {}) => ({ action: "wait", caption_fr, ...extra })
const none = () => false

test("both devices share one deduped script and a device-only step is silent unless voice is true", () => {
  const v = video("01", [
    step("Bonjour"),
    step("Bonjour"),
    step("Sur ordinateur", { only: "desktop" }),
    step("Sur mobile", { only: "mobile", voice: true }),
  ])
  expect(uniqueLines(v)).toEqual(["Bonjour", "Sur mobile"])
  expect(narrationFor(v, "desktop")).toEqual(["Bonjour", "Bonjour", null])
  expect(narrationFor(v, "mobile")).toEqual(["Bonjour", "Bonjour", "Sur mobile"])
})

test("the estimate counts only uncached lines, once across videos", () => {
  const a = video("01", [step("abcd"), step("efgh")])
  const b = video("02", [step("abcd"), step("ij")])
  const plan = buildPlan([a, b], { env: {}, ledger: { runs: [] }, isCached: (t) => t === "efgh" })
  expect(plan.videos.map((v) => v.newChars)).toEqual([4, 2])
  expect(plan.newCredits).toBe(3)
  expect(plan.cached).toBe(1)
  expect(plan.shared).toBe(1)
})

test("the default model is flash and multilingual_v2 doubles the estimate", () => {
  const v = video("01", [step("a".repeat(100))])
  const flash = buildPlan([v], { env: {}, ledger: { runs: [] }, isCached: none })
  const multi = buildPlan([v], {
    env: { ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" },
    ledger: { runs: [] },
    isCached: none,
  })
  expect(flash.model).toBe("eleven_flash_v2_5")
  expect(flash.newCredits).toBe(50)
  expect(multi.newCredits).toBe(100)
  expect(formatPlan(flash)).toContain("eleven_flash_v2_5")
})

test("an unknown model assumes 1 credit per character and says so; CREDIT_PER_CHAR wins", () => {
  const v = video("01", [step("abcd")])
  const unknown = buildPlan([v], { env: { ELEVENLABS_MODEL_ID: "eleven_new" }, ledger: { runs: [] }, isCached: none })
  expect(unknown.newCredits).toBe(4)
  expect(unknown.warnings.join()).toContain("unknown model eleven_new")
  expect(buildPlan([v], { env: { CREDIT_PER_CHAR: "2" }, ledger: { runs: [] }, isCached: none }).newCredits).toBe(8)
})

test("a run that does not fit the remaining budget is refused with the numbers", () => {
  const v = video("01", [step("a".repeat(100))])
  const plan = buildPlan([v], {
    env: { ELEVENLABS_CREDIT_BUDGET: "100" },
    ledger: { runs: [{ at: "x", chars: 80, credits: 80 }] },
    isCached: none,
  })
  expect(() => assertBudget(plan)).toThrow("needs 50 new credits")
  expect(() => assertBudget(plan)).toThrow("only 20 are left of 100")
  expect(() => assertBudget(buildPlan([v], { env: {}, ledger: { runs: [] }, isCached: none }))).not.toThrow()
})

test("the ledger records counts only and feeds the remaining budget", () => {
  const file = join(mkdtempSync(join(tmpdir(), "ledger-")), "out", ".credits.json")
  expect(readLedger(file).runs).toEqual([])
  const record = createRunRecorder(file, 0.5)
  record(120)
  record(80)
  record(0)
  expect(readLedger(file).runs).toHaveLength(1)
  expect(readLedger(file).runs[0]).toMatchObject({ chars: 200, credits: 100 })
  expect(readFileSync(file, "utf8")).not.toContain("text")
  expect(existsSync(file)).toBe(true)
  const plan = buildPlan([video("01", [step("ab")])], { env: {}, ledger: readLedger(file), isCached: none })
  expect(plan.spent).toBe(100)
  expect(plan.remaining).toBe(28900)
})

test("long lines and long videos only warn", () => {
  const v = video("01", [step("a".repeat(150)), step("b".repeat(600))])
  const plan = buildPlan([v], { env: {}, ledger: { runs: [] }, isCached: none })
  expect(plan.warnings.filter((w) => w.includes("line of 150"))).toHaveLength(1)
  expect(plan.warnings.some((w) => w.includes("750 spoken characters"))).toBe(true)
  expect(() => assertBudget(plan)).not.toThrow()
})

test("the plan table totals 10 videos of 8 lines", () => {
  const vs = Array.from({ length: 10 }, (_, i) =>
    video(
      String(i + 1).padStart(2, "0"),
      Array.from({ length: 8 }, (_, j) => step(`Ligne ${i} ${j} ${"x".repeat(40)}`)),
    ),
  )
  const out = formatPlan(buildPlan(vs, { env: {}, ledger: { runs: [] }, isCached: none }))
  expect(out).toContain("total     80")
  expect(out).toContain("remaining 29000")
})

test("CREDIT_PER_CHAR must be above 0 and can never lower the model's rate", () => {
  for (const bad of ["0", "-1", "abc", "NaN"])
    expect(() => creditRate({ CREDIT_PER_CHAR: bad })).toThrow("CREDIT_PER_CHAR")
  expect(creditRate({ ELEVENLABS_MODEL_ID: "eleven_multilingual_v2", CREDIT_PER_CHAR: "0.1" }).rate).toBe(1)
  expect(creditRate({ CREDIT_PER_CHAR: "0.1" }).rate).toBe(0.5)
})

test("a bad budget throws instead of defaulting", () => {
  for (const bad of ["-5", "29,000", "abc"]) expect(() => parseBudget(bad)).toThrow("ELEVENLABS_CREDIT_BUDGET")
  expect(parseBudget("")).toBe(29000)
  expect(parseBudget("1500")).toBe(1500)
})

test("a corrupt ledger throws naming the file, a missing one is empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"))
  expect(readLedger(join(dir, "none.json")).runs).toEqual([])
  for (const [i, body] of [
    '{"runs":[{"chars":1,"credits":-3}]}',
    '{"runs":[{"chars":1,"credits":"x"}]}',
    '{"runs":{}}',
    "nope",
  ].entries()) {
    const file = join(dir, `${i}.json`)
    writeFileSync(file, body)
    expect(() => readLedger(file)).toThrow(file)
  }
})

test("the gate fails closed on NaN", () => {
  const plan = buildPlan([video("01", [step("abcd")])], { env: {}, ledger: { runs: [] }, isCached: none })
  expect(() => assertBudget({ ...plan, newCredits: Number.NaN })).toThrow("new credits")
  expect(() => assertBudget({ ...plan, remaining: Number.NaN })).toThrow("new credits")
})

test("a second final run cannot take the ledger lock, a dead holder's lock is replaced", () => {
  const file = join(mkdtempSync(join(tmpdir(), "ledger-")), "credits.json")
  const first = lockLedger(file)
  expect(() => lockLedger(file)).toThrow("holds")
  first.release()
  writeFileSync(`${file}.lock`, "999999999")
  lockLedger(file).release()
})

test("spacing variants of a line are one billed line", () => {
  const v = video("01", [step("Bonjour  à tous "), step(" Bonjour à\ttous")])
  expect(uniqueLines(v)).toEqual(["Bonjour à tous"])
})
