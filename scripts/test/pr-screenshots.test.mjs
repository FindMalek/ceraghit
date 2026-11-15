import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { collect } from "../pr-screenshots.mjs"

test("collect skips node_modules, dot folders and non-images", () => {
  const dir = mkdtempSync(join(tmpdir(), "shots-"))
  for (const sub of ["Desktop", "report/node_modules/pkg", ".cache"]) mkdirSync(join(dir, sub), { recursive: true })
  for (const f of ["Desktop/Home FR.png", "report/node_modules/pkg/appicon.png", ".cache/x.png", "notes.txt"])
    writeFileSync(join(dir, f), "x")

  assert.deepEqual(
    collect(dir).map((f) => f.dest),
    ["desktop/home-fr.png"],
  )
})
