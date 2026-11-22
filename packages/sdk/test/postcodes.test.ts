import { expect, test } from "bun:test"
import { postcodeProblem } from "../src/postcodes"

test("postcodes fit their country, and Ireland's special D6W routing key is accepted", () => {
  expect(postcodeProblem("IE", "D6W X285")).toBeNull()
  expect(postcodeProblem("IE", "D02 X285")).toBeNull()
  expect(postcodeProblem("FR", "75001")).toBeNull()
  expect(postcodeProblem("FR", "7500")).toContain("exemple : 75001")
  expect(postcodeProblem("TN", "")).toBeNull()
  expect(postcodeProblem("FR", "")).toContain("obligatoire")
})
