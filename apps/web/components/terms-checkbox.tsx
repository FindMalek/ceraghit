"use client"

import { Checkbox } from "@workspace/ui/components/checkbox"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
}

export function TermsCheckbox({ checked, onChange, error }: Props) {
  const t = useTranslations("checkout")
  return (
    <div className="space-y-1">
      <label htmlFor="terms" className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <Checkbox
          id="terms"
          name="terms"
          checked={checked}
          onCheckedChange={(next) => onChange(next === true)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "terms-error" : undefined}
          className="size-5"
        />
        <span>
          {t.rich("termsLabel", {
            link: (chunks) => (
              <Link href="/legal/terms" target="_blank" className="underline underline-offset-4 hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      {error && (
        <p id="terms-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
