import { expect, test } from "bun:test"
import { looksDelivered, mapAramexStatus } from "../src/lib/shipping/aramex/status"

const ev = (code: string, description: string, problemCode: string | null = null) => ({
  code,
  description,
  at: "2096-05-10T09:00:00Z",
  location: "Tunis",
  comment: "",
  problemCode,
})

test("the newest event decides the status, by code first then by keywords", () => {
  expect(mapAramexStatus([ev("SH012", "x")], null)).toBe("picked_up")
  expect(mapAramexStatus([ev("ZZ", "Out for delivery")], null)).toBe("out_for_delivery")
  expect(mapAramexStatus([ev("ZZ", "Departed hub")], null)).toBe("in_transit")
  expect(mapAramexStatus([ev("ZZ", "Returned to shipper")], null)).toBe("returned")
  expect(mapAramexStatus([ev("ZZ", "Delivered")], null)).toBe("delivered")
  expect(mapAramexStatus([ev("ZZ", "Not delivered, refused")], null)).toBe("exception")
  expect(mapAramexStatus([ev("ZZ", "Departed hub", "P10")], null)).toBe("exception")
  expect(mapAramexStatus([ev("ZZ", "whatever")], true)).toBe("delivered")
})

test("a parcel never goes backwards, an exception clears when the flow resumes", () => {
  expect(mapAramexStatus([ev("SH012", "picked up")], null, "in_transit")).toBe("in_transit")
  expect(mapAramexStatus([ev("ZZ", "Departed hub")], null, "out_for_delivery")).toBe("out_for_delivery")
  expect(mapAramexStatus([ev("ZZ", "Departed hub")], null, "exception")).toBe("in_transit")
  expect(mapAramexStatus([ev("ZZ", "refused")], null, "in_transit")).toBe("exception")
  expect(mapAramexStatus([ev("ZZ", "Departed hub")], null, "delivered")).toBe("delivered")
})

test("only the end of the journey is worth a delivered question", () => {
  expect(looksDelivered([ev("ZZ", "Departed hub")])).toBe(false)
  expect(looksDelivered([ev("SH003", "x")])).toBe(true)
})
