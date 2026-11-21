import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { chromium } from "@playwright/test"
import { ASSETS, generateAssets, makePng } from "../lib/assets"
import { parseCsv, pdfPageCount, renderFileCard, viewOfFile } from "../lib/files"
import { createPacer } from "../lib/pacing"

test("a generated PNG is a valid image of the asked size", () => {
  const png = makePng(4, 2, (x, y) => [x * 10, y * 20, 7])
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  expect(png.readUInt32BE(16)).toBe(4)
  expect(png.readUInt32BE(20)).toBe(2)
  const idatAt = png.indexOf("IDAT")
  const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + png.readUInt32BE(idatAt - 4)))
  expect(raw.length).toBe((4 * 3 + 1) * 2)
  expect([...raw.subarray(1, 4)]).toEqual([0, 0, 7])
})

test("the assets land in the given folder and a missing webp encoder only skips the webp files", () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-assets-"))
  try {
    const report = generateAssets(dir, "ffmpeg-that-does-not-exist")
    expect(report.skipped.sort()).toEqual(
      ASSETS.filter((a) => a.kind === "webp")
        .map((a) => a.name)
        .sort(),
    )
    expect(readdirSync(dir).sort()).toEqual(report.written.sort())
    expect(report.written).toContain("photo-1.png")
    expect(readFileSync(join(dir, "photo-1.png")).length).toBeLessThan(1_000_000)
    expect(existsSync(join(dir, "photo-1.webp"))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a CSV with quotes, semicolons and a BOM becomes a table card", () => {
  const rows = parseCsv('﻿Numéro;Client;Total\r\nCER-1;"Dupont; Marc";"12,50"\r\nCER-2;"Dit ""Zé""";9\r\n')
  expect(rows).toEqual([
    ["Numéro", "Client", "Total"],
    ["CER-1", "Dupont; Marc", "12,50"],
    ["CER-2", 'Dit "Zé"', "9"],
  ])
  const html = renderFileCard({ name: "commandes.csv", bytes: 2048, table: rows, totalRows: 40 })
  expect(html).toContain("commandes.csv")
  expect(html).toContain("2 Ko")
  expect(html).toContain("Dupont; Marc")
  expect(html).toContain("38 autres lignes")
})

test("a PDF is counted by its pages and a hostile file name is escaped", () => {
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Pages>>endobj\n2 0 obj<</Type /Page>>endobj\n3 0 obj<</Type/Page>>endobj",
  )
  expect(pdfPageCount(pdf)).toBe(2)
  expect(renderFileCard({ name: "<img src=x>.pdf", bytes: 10, pages: 2 })).not.toContain("<img src=x>")
})

test("an upload step fills a file input that is hidden behind its button", async () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-up-"))
  const browser = await chromium.launch()
  try {
    generateAssets(dir, "ffmpeg-that-does-not-exist")
    const page = await browser.newPage()
    await page.setContent(
      '<label>Choisir<input type="file" aria-label="Choisir des photos" style="display:none" onchange="document.title=this.files[0].name"></label>',
    )
    const pacer = createPacer({
      page,
      device: "desktop",
      app: "dashboard",
      baseUrl: () => "",
      assetsDir: dir,
      zoom: false,
    })
    await pacer.run({ action: "upload", target: { label: "Choisir des photos" }, caption_fr: "Photo." }, "photo-1.png")
    expect(await page.title()).toBe("photo-1.png")
  } finally {
    await browser.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a download step keeps the file and shows it over the page, the next step clears it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-dl-"))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route("http://t.test/**", (route) =>
      new URL(route.request().url()).pathname === "/export.csv"
        ? route.fulfill({
            contentType: "text/csv",
            headers: { "content-disposition": 'attachment; filename="commandes.csv"' },
            body: "Numéro,Total\nCER-1,10\nCER-2,20\n",
          })
        : route.fulfill({ contentType: "text/html", body: '<a href="/export.csv">Exporter</a>' }),
    )
    await page.goto("http://t.test/")
    const pacer = createPacer({
      page,
      device: "desktop",
      app: "dashboard",
      baseUrl: () => "http://t.test",
      assetsDir: "",
      downloadsDir: dir,
      zoom: false,
    })
    await pacer.run(
      { action: "download", target: { role: "link", name: "Exporter" }, caption_fr: "Exportez." },
      undefined,
    )
    expect(readFileSync(join(dir, "commandes.csv"), "utf8")).toContain("CER-2,20")
    await page.getByRole("cell", { name: "CER-2" }).waitFor()
    await pacer.run({ action: "wait", caption_fr: "Suite." }, undefined)
    expect(await page.locator("#__demo_file").count()).toBe(0)
    const view = viewOfFile(join(dir, "commandes.csv"))
    expect(view.table).toHaveLength(3)
  } finally {
    await browser.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
