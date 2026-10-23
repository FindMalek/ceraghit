"use client"

import { useMutation } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { customRequestInputSchema, localeSchema } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { useLocale, useTranslations } from "next-intl"
import { type FormEvent, useCallback, useState } from "react"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import { FormField } from "./form-field"
import { RequestPhotos } from "./request-photos"

const FIELDS = ["name", "email", "phone", "country", "description", "dimensions", "budget", "references"] as const
type Field = (typeof FIELDS)[number]

export function CustomForm({ initialDescription }: { initialDescription?: string }) {
  const t = useTranslations("custom")
  const locale = useLocale()
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [sent, setSent] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const onPhotos = useCallback((next: string[], busy: boolean) => {
    setImages(next)
    setUploading(busy)
  }, [])

  const create = useMutation(
    orpc.public.requests.create.mutationOptions({
      onSuccess: () => setSent(true),
      onError: (error) => toast.error(errorMessage(error) || t("failed")),
    }),
  )

  if (sent) {
    return (
      <div className="frame space-y-4 bg-card/70 p-8 text-center" role="status">
        <h2 className="text-4xl">{t("successTitle")}</h2>
        <p className="text-muted-foreground">{t("successText")}</p>
        <Button variant="outline" size="lg" className="h-11" onClick={() => setSent(false)}>
          {t("another")}
        </Button>
      </div>
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (key: Field): string | undefined => String(data.get(key) ?? "").trim() || undefined
    const parsed = customRequestInputSchema.safeParse({
      name: value("name") ?? "",
      email: value("email") ?? "",
      phone: value("phone"),
      country: value("country"),
      description: value("description") ?? "",
      dimensions: value("dimensions"),
      budget: value("budget"),
      references: value("references"),
      images,
      locale: localeSchema.catch("fr").parse(locale),
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as Field
        next[key] ??= t.has(`errors.${key}`) ? t(`errors.${key}`) : t("failed")
      }
      setErrors(next)
      document.getElementById(Object.keys(next)[0] ?? "")?.focus()
      return
    }
    setErrors({})
    create.mutate(parsed.data)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormField id="name" label={t("name")} autoComplete="name" error={errors.name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="email"
          label={t("email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email}
        />
        <FormField id="phone" label={t("phone")} type="tel" autoComplete="tel" inputMode="tel" />
      </div>
      <FormField id="country" label={t("country")} autoComplete="country-name" />
      <FormField
        id="description"
        label={t("description")}
        multiline
        defaultValue={initialDescription}
        placeholder={t("descriptionPlaceholder")}
        error={errors.description}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="dimensions" label={t("dimensions")} />
        <FormField id="budget" label={t("budget")} />
      </div>
      <FormField id="references" label={t("references")} hint={t("referencesHint")} multiline />
      <RequestPhotos onChange={onPhotos} />
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={create.isPending || uploading}>
        {create.isPending ? (
          <>
            <Spinner /> {t("sending")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
      <p className="text-center text-muted-foreground text-xs">
        {t.rich("privacy", {
          link: (chunks) => (
            <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  )
}
