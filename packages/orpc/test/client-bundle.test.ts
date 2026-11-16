import { expect, test } from "bun:test"
import { join } from "node:path"

test("the vault never reaches a browser bundle", async () => {
  const src = join(import.meta.dir, "../src")
  const result = await Bun.build({
    entrypoints: [join(src, "client.ts"), join(src, "react.tsx")],
    target: "browser",
    packages: "external",
  })
  expect(result.success).toBe(true)
  const code = (await Promise.all(result.outputs.map((o) => o.text()))).join("\n")
  for (const needle of ["aes-256-gcm", "secrets_enc", "SECRETS_KEY"]) expect(code).not.toContain(needle)
})

test("web and dashboard never import the vault entries", async () => {
  const root = join(import.meta.dir, "../../../apps")
  const hits: string[] = []
  for (const app of ["web", "dashboard"]) {
    for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: join(root, app), absolute: true })) {
      if (file.includes("node_modules") || file.includes("/.next/")) continue
      if (/@workspace\/orpc\/(secrets|rotate)/.test(await Bun.file(file).text())) hits.push(file)
    }
  }
  expect(hits.filter((f) => !f.endsWith(".test.ts"))).toEqual([])
})
