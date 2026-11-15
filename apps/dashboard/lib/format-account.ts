/** Bank codes typed by hand: letters and digits only, in groups of four, e.g. "TN59 1000 6035 ...". */
export function formatAccount(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1 ")
}

export const compactAccount = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
