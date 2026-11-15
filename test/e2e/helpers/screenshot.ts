import { basename } from "node:path"
import { type Page, type TestInfo, test } from "@playwright/test"
import { E2E } from "../env"

const counters = new Map<string, number>()

export function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "step"
  )
}

/** `artifacts/screenshots/<project>/<spec>/<test>/<NN>-<name>.png`, numbered per test attempt. */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  const id = `${testInfo.testId}:${testInfo.retry}`
  const n = (counters.get(id) ?? 0) + 1
  counters.set(id, n)
  const spec = basename(testInfo.file).replace(/\.e2e\.ts$|\.ts$/, "")
  const file = `${E2E.artifacts}screenshots/${testInfo.project.name}/${spec}/${slug(testInfo.title)}/${String(n).padStart(2, "0")}-${slug(name)}.png`
  await page.screenshot({ path: file, fullPage: true })
  await testInfo.attach(name, { path: file, contentType: "image/png" })
  return file
}

/** One user-visible step: runs it, then leaves a screenshot, so passing tests still document the flow. */
export async function step(page: Page, testInfo: TestInfo, title: string, fn: () => Promise<void>): Promise<void> {
  await test.step(title, async () => {
    await fn()
    await shot(page, testInfo, title)
  })
}
