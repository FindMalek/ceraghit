const KEY = "ceraghit-order-tokens"

type Tokens = Record<string, string>

function read(): Tokens {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Tokens
  } catch {
    return {}
  }
}

/** The payment gateway only knows the order number; the page link needs the token, so we keep it on this device. */
export function rememberOrderToken(number: string, token: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [number]: token }))
  } catch {}
}

export function recallOrderToken(number: string): string | null {
  return read()[number] ?? null
}
