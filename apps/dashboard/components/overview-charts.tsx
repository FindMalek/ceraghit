"use client"

import { type Currency, formatMoney, fromMinor } from "@workspace/sdk"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

export interface DayPoint {
  day: string
  TND: number
  EUR: number
  orders: number
}

const COLOR: Record<Currency, string> = { TND: "var(--chart-1)", EUR: "var(--chart-2)" }
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })

/** One currency per chart: dinars and euros are never drawn on the same axis or added up. */
export function RevenueChart({ data, currency }: { data: DayPoint[]; currency: Currency }) {
  const config = {
    value: { label: currency === "TND" ? "Dinars" : "Euros", color: COLOR[currency] },
  } satisfies ChartConfig
  const rows = data.map((point) => ({ day: point.day, value: fromMinor(point[currency], currency) }))
  const fillId = `fill-${currency}`
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <AreaChart data={rows} margin={{ left: 0, right: 8 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={shortDay}
        />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(value) => shortDay(String(value))}
              formatter={(value) =>
                formatMoney(Math.round(Number(value) * (currency === "TND" ? 1000 : 100)), currency)
              }
            />
          }
        />
        <Area dataKey="value" type="monotone" fill={`url(#${fillId})`} stroke="var(--color-value)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  )
}
