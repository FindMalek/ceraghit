// Appends the e2e totals per project and the flaky tests to the GitHub job summary.
// Usage: bun test/e2e/scripts/summary.ts [results.json]
import { appendFileSync, existsSync, readFileSync } from "node:fs"

type Status = "expected" | "unexpected" | "flaky" | "skipped"
type Suite = { file?: string; specs?: Spec[]; suites?: Suite[] }
type Spec = { title: string; file: string; line: number; tests: { projectName: string; status: Status }[] }

const path = process.argv[2] ?? new URL("../artifacts/results.json", import.meta.url).pathname
const out: string[] = ["## e2e", ""]

if (!existsSync(path)) {
  out.push("No `results.json`: the suite did not finish, see the job log.")
} else {
  const report = JSON.parse(readFileSync(path, "utf8")) as { suites: Suite[] }
  const totals = new Map<string, Record<Status, number>>()
  const flaky: string[] = []
  const walk = (suite: Suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const row = totals.get(test.projectName) ?? { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
        row[test.status] += 1
        totals.set(test.projectName, row)
        if (test.status === "flaky") flaky.push(`- \`${spec.file}:${spec.line}\` ${spec.title} (${test.projectName})`)
      }
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report.suites) walk(suite)

  out.push("| project | passed | failed | flaky | skipped |", "| --- | ---: | ---: | ---: | ---: |")
  for (const [project, row] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`| ${project} | ${row.expected} | ${row.unexpected} | ${row.flaky} | ${row.skipped} |`)
  }
  out.push("", flaky.length > 0 ? `**flaky:** fix before merge\n${flaky.join("\n")}` : "**flaky:** none")
}

const text = `${out.join("\n")}\n`
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
else console.info(text)
