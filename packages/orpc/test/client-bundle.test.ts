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
