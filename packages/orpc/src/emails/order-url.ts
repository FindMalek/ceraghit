export function orderUrl(webUrl: string, order: { locale: string; number: string; publicToken: string }): string {
  return `${webUrl}/${order.locale}/order/${order.number}?t=${order.publicToken}`
}
