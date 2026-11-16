/** WCF JSON dates: `/Date(<ms>)/`, with an optional `+hhmm` suffix that does not move the instant. */
export const toWcfDate = (d: Date): string => `/Date(${d.getTime()})/`

const WCF = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/

export function fromWcfDate(value: string): Date {
  const match = WCF.exec(value)
  const date = match ? new Date(Number(match[1])) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid Aramex date")
  return date
}
