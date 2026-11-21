import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, extname, join } from "node:path"
import type { Page } from "@playwright/test"

export const FILE_CARD_ID = "__demo_file"
const MAX_ROWS = 12

/** Comma or semicolon separated, quoted cells, as the orders and sales exports write them. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "")
  const first = clean.split(/\r?\n/, 1)[0] ?? ""
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)

const sizeLabel = (bytes: number) => (bytes < 1024 ? `${bytes} o` : `${Math.round(bytes / 1024)} Ko`)

/** Pages of a PDF, counted from its page objects: enough for a caption, no parser needed. */
export function pdfPageCount(bytes: Buffer): number {
  return bytes.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 1
}

export interface FileView {
  name: string
  bytes: number
  /** Header row first, then at most 12 rows. */
  table?: string[][]
  totalRows?: number
  /** A PNG data URI of the first page, when a rasterizer was found. */
  pageImage?: string
  pages?: number
}

/** The card shown over the page for a downloaded file: a table for a CSV, the first page for a PDF. */
export function renderFileCard(view: FileView): string {
  const head = `<div style="display:flex;justify-content:space-between;gap:16px;padding:12px 16px;background:#2b2118;color:#f6efe6;font:600 15px system-ui"><span>${escapeHtml(view.name)}</span><span style="font-weight:400;opacity:.8">${sizeLabel(view.bytes)}${view.pages ? ` · ${view.pages} page${view.pages > 1 ? "s" : ""}` : ""}</span></div>`
  let body: string
  if (view.table) {
    const [header = [], ...rows] = view.table
    const cells = (cols: string[], tag: string) =>
      `<tr>${cols.map((c) => `<${tag} style="padding:6px 10px;border-bottom:1px solid #e6dccd;text-align:left;white-space:nowrap">${escapeHtml(c)}</${tag}>`).join("")}</tr>`
    body = `<div style="overflow:auto;max-height:60vh"><table style="border-collapse:collapse;font:13px system-ui;color:#2b2118">${cells(header, "th")}${rows.map((r) => cells(r, "td")).join("")}</table></div>${
      (view.totalRows ?? 0) > rows.length
        ? `<div style="padding:8px 16px;font:12px system-ui;color:#6b5b4b">${(view.totalRows ?? 0) - rows.length} autres lignes</div>`
        : ""
    }`
  } else if (view.pageImage) {
    body = `<img alt="" src="${view.pageImage}" style="display:block;max-height:70vh;max-width:100%;margin:0 auto">`
  } else {
    body = `<div style="padding:40px 16px;text-align:center;font:15px system-ui;color:#6b5b4b">Aperçu indisponible, le fichier est enregistré.</div>`
  }
  return `<div id="${FILE_CARD_ID}" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(43,33,24,.55);z-index:2147483646"><div style="width:min(92vw,980px);background:#fffaf3;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)">${head}${body}</div></div>`
}

/** First page as a PNG data URI through pdftoppm (poppler) when it is installed, otherwise nothing. */
function rasterize(file: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), "demo-pdf-"))
  try {
    const res = spawnSync("pdftoppm", ["-png", "-r", "70", "-f", "1", "-l", "1", file, join(dir, "page")])
    if (res.status !== 0) return undefined
    const png = readdirSync(dir).find((f) => f.endsWith(".png"))
    return png ? `data:image/png;base64,${readFileSync(join(dir, png)).toString("base64")}` : undefined
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function viewOfFile(file: string): FileView {
  const bytes = readFileSync(file)
  const base = { name: basename(file), bytes: bytes.length }
  const ext = extname(file).toLowerCase()
  if (ext === ".csv") {
    const rows = parseCsv(bytes.toString("utf8")).filter((r) => r.some((c) => c !== ""))
    return { ...base, table: rows.slice(0, MAX_ROWS + 1), totalRows: Math.max(0, rows.length - 1) }
  }
  if (ext === ".pdf") return { ...base, pages: pdfPageCount(bytes), pageImage: rasterize(file) }
  return base
}

/** Clicks through `trigger`, keeps the download in `dir` and returns its path. A link opening a viewer instead of a download is not handled: the app serves attachments. */
export async function captureDownload(page: Page, dir: string, trigger: () => Promise<unknown>): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), trigger()])
  const target = join(dir, download.suggestedFilename().replace(/[^\w.-]/g, "_"))
  await download.saveAs(target)
  if (statSync(target).size === 0) throw new Error(`the download ${basename(target)} is empty`)
  return target
}

export async function showFile(page: Page, file: string): Promise<void> {
  const html = renderFileCard(viewOfFile(file))
  await page.evaluate((card) => document.body.insertAdjacentHTML("beforeend", card), html)
}

export async function hideFile(page: Page): Promise<void> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), FILE_CARD_ID).catch(() => {})
}
