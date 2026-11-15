import assert from "node:assert/strict"
import { test } from "node:test"
import { checkBody } from "../check-pr-body.mjs"

const IMG = "![home desktop](https://github.com/FindMalek/ceraghit/blob/pr-assets/42/home-desktop.png?raw=true)"
const pushed = (path) => path === "42/home-desktop.png"
const body = (screenshots, closes = "Closes #42") =>
  `## What\n\nstuff\n\n${closes}\n\n## Screenshots\n${screenshots}\n\n## Migration\nnone\n`

test("valid body passes", () => {
  assert.deepEqual(checkBody(body(IMG), pushed), [])
})

test("missing Closes fails", () => {
  assert.match(checkBody(body(IMG, "Closes #"), pushed).join(), /Closes/)
})

test("body without an image fails", () => {
  assert.match(checkBody(body("ran the tests, all green"), pushed).join(), /no inline screenshot/)
})

test("template comment alone in Screenshots fails", () => {
  const errors = checkBody(`${body("<!-- pnpm pr:screenshots prints this -->")}\n${IMG}`, pushed)
  assert.match(errors.join(), /template comment/)
})

test("pr-assets image that was not pushed fails", () => {
  assert.match(checkBody(body(IMG.replace("home-desktop", "home-mobile")), pushed).join(), /42\/home-mobile\.png/)
})

test("Refs #n counts as an issue link for partial work", () => {
  assert.deepEqual(checkBody(body(IMG, "Refs #42"), pushed), [])
})
