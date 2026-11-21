import { expect, test } from "bun:test"
import { chromium } from "@playwright/test"
import { createPacer, locate } from "../lib/pacing"

test("a target skips a hidden twin, like the table row hidden on mobile", async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<button style="display:none" id="a">Voir</button><button id="b">Voir</button><button id="c">Voir</button>',
    )
    expect(await locate(page, { role: "button", name: "Voir" }).first().getAttribute("id")).toBe("b")
    expect(await locate(page, { text: "Voir" }).first().getAttribute("id")).toBe("b")
    expect(await locate(page, { role: "button", name: "Voir", nth: -1 }).first().getAttribute("id")).toBe("c")
  } finally {
    await browser.close()
  }
})

test("a link meant for a new tab opens in the recorded page", async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route("http://t.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: '<a href="/invoice" target="_blank">Facture</a>' }),
    )
    await page.goto("http://t.test/")
    const pacer = createPacer({
      page,
      device: "desktop",
      app: "dashboard",
      baseUrl: () => "",
      assetsDir: "",
      zoom: false,
    })
    await pacer.run({ action: "click", target: { role: "link", name: "Facture" }, caption_fr: "Ouvrez." }, undefined)
    await page.waitForURL("http://t.test/invoice")
    expect(page.context().pages()).toHaveLength(1)
  } finally {
    await browser.close()
  }
})

test("a click lands on a control that sits under a sticky header", async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } })
    await page.setContent(
      '<a href="data:text/html,left" style="position:fixed;top:0;left:0;right:0;height:80px;background:red">Retour</a><div style="height:340px"></div><button onclick="document.title=\'ok\'">Go</button><div style="height:2000px"></div>',
    )
    await page.evaluate(() => window.scrollTo(0, 300))
    const pacer = createPacer({
      page,
      device: "desktop",
      app: "dashboard",
      baseUrl: () => "",
      assetsDir: "",
      zoom: false,
    })
    await pacer.run({ action: "click", target: { role: "button", name: "Go" }, caption_fr: "Cliquez." }, undefined)
    expect(await page.title()).toBe("ok")
  } finally {
    await browser.close()
  }
})
