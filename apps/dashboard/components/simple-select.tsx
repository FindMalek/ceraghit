"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"

export interface Option<T extends string> {
  value: T
  label: string
}

export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  id,
  size,
  label,
}: {
  value: T | ""
  onChange: (value: T) => void
  options: Option<T>[]
  placeholder?: string
  className?: string
  id?: string
  size?: "sm" | "default"
  /** Accessible name when there is no visible <label> pointing at `id`. */
  label?: string
}) {
  return (
    <Select<string> value={value} onValueChange={(next) => next && onChange(next as T)} items={options}>
      <SelectTrigger id={id} size={size} aria-label={label} className={className ?? "h-11 w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
