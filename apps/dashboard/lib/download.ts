/** Saves text as a file from the browser, no server route: Excel needs the BOM already inside `content`. */
export function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const studioDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" })

/** `YYYY-MM-DD` in studio time, `daysAgo` days back from now. */
export function studioDayKey(daysAgo = 0): string {
  return studioDay.format(new Date(Date.now() - daysAgo * 864e5))
}
