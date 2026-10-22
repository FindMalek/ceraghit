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
}: {
  value: T | ""
  onChange: (value: T) => void
  options: Option<T>[]
  placeholder?: string
  className?: string
  id?: string
  size?: "sm" | "default"
}) {
  return (
    <Select<string> value={value} onValueChange={(next) => next && onChange(next as T)} items={options}>
      <SelectTrigger id={id} size={size} className={className ?? "h-11 w-full"}>
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
