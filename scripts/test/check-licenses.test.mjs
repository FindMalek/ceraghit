import assert from "node:assert/strict"
import { test } from "node:test"
import { findViolations, licenseAllowed } from "../check-licenses.mjs"

const allowlist = { packages: [{ name: "@img/sharp-libvips-*", license: "LGPL-3.0-or-later", reason: "dynamic" }] }

const groups = {
  MIT: [{ name: "react", versions: ["19.3.0"] }],
  "GPL-3.0-only": [{ name: "copyleft-lib", versions: ["1.0.0"] }],
  "LGPL-3.0-or-later": [{ name: "@img/sharp-libvips-linux-x64", versions: ["1.3.4"] }],
}

test("only the GPL package fails, MIT and the allowlisted LGPL pass", () => {
  assert.deepEqual(
    findViolations(groups, allowlist).map((v) => v.name),
    ["copyleft-lib"],
  )
})

test("an OR expression passes when one side is permissive", () => {
  assert.equal(licenseAllowed("(MIT OR GPL-3.0-only)"), true)
  assert.equal(licenseAllowed("MIT AND GPL-3.0-only"), false)
  assert.equal(licenseAllowed("UNKNOWN"), false)
  assert.equal(licenseAllowed("SEE LICENSE IN LICENSE.md"), false)
  assert.equal(licenseAllowed("Custom: https://example.com/license"), false)
})
