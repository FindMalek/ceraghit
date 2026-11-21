import { expect, test } from "bun:test"
import { createFakeAramexFetch } from "../src/lib/shipping/aramex/fake"

test("the simulated tracking answers the same events every time, so a refresh never duplicates the timeline", async () => {
  const fake = createFakeAramexFetch()
  const ask = async () => {
    const res = await fake("https://ws.dev.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments", {
      method: "POST",
      body: JSON.stringify({ Shipments: ["FAKE12345678"] }),
    })
    return res.text()
  }
  const first = await ask()
  await new Promise((resolve) => setTimeout(resolve, 1100))
  expect(await ask()).toBe(first)
})
