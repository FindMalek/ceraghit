import { MapPinIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr"
import { imageSrc, pick } from "@workspace/sdk"
import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"
import { SectionHeading } from "@/components/section-heading"
import { getLocations, getSettings } from "@/lib/api"
import { pageMetadata } from "@/lib/seo"
import { EDITO_KEYS, PROCESS_PHOTOS, STUDIO_PHOTOS } from "@/lib/site"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const [locale, t, seo] = await Promise.all([getLocale(), getTranslations("atelier"), getTranslations("seo")])
  return pageMetadata({
    locale,
    path: "/atelier",
    title: t("title"),
    description: seo("atelierDescription"),
    image: STUDIO_PHOTOS[0]?.src,
  })
}

export default async function AtelierPage() {
  const [t, edito, locale, locations, settings] = await Promise.all([
    getTranslations("atelier"),
    getTranslations("edito"),
    getLocale(),
    getLocations(),
    getSettings(),
  ])
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-10">
      <header className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="font-script text-4xl text-gold">{t("lead")}</p>
        <h1 className="text-6xl md:text-8xl">{t("title")}</h1>
      </header>

      <section className="mx-auto max-w-2xl space-y-5 text-lg">
        {EDITO_KEYS.map((key, i) => (
          <p key={key} className={i === 0 ? "font-heading text-2xl text-gold leading-snug" : undefined}>
            {edito(key)}
          </p>
        ))}
      </section>

      <section className="space-y-8">
        <SectionHeading title={t("process")} />
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {PROCESS_PHOTOS.map((src) => (
            <li key={src} className="frame relative aspect-square overflow-hidden bg-card">
              <Image src={src} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
            </li>
          ))}
        </ul>
        <ul className="grid gap-4 sm:grid-cols-3">
          {STUDIO_PHOTOS.map((photo) => (
            <li key={photo.src} className="frame relative aspect-[4/5] overflow-hidden bg-card">
              <Image src={photo.src} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-8">
        <SectionHeading title={t("locations")} />
        {locations.length === 0 ? (
          <p className="text-center text-muted-foreground">{t("noLocations")}</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {locations.map((place) => (
              <li key={place.id} className="frame flex flex-col gap-4 bg-card/70 p-6 sm:flex-row">
                {place.image && (
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden sm:w-32">
                    <Image src={imageSrc(place.image)} alt="" fill sizes="128px" className="object-cover" />
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-3xl">{place.name}</h3>
                  {place.description && <p className="text-muted-foreground">{pick(place.description, locale)}</p>}
                  <p className="flex gap-2">
                    <MapPinIcon className="mt-1 size-4 shrink-0 text-gold" aria-hidden />
                    <span>
                      {place.address}, {place.city}, {place.country}
                    </span>
                  </p>
                  {place.phone && (
                    <p className="flex gap-2">
                      <PhoneIcon className="mt-1 size-4 shrink-0 text-gold" aria-hidden />
                      <a
                        href={`tel:${place.phone.replace(/\s/g, "")}`}
                        className="min-h-6 underline-offset-4 hover:underline"
                      >
                        {place.phone}
                      </a>
                    </p>
                  )}
                  {place.hours && (
                    <p className="text-sm">
                      <span className="font-heading text-muted-foreground">{t("hours")} · </span>
                      {pick(place.hours, locale)}
                    </p>
                  )}
                  {place.mapUrl && (
                    <a
                      href={place.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center underline underline-offset-4"
                    >
                      {t("map")}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 text-center">
        <h2 className="text-4xl">{t("contact")}</h2>
        <a href={`mailto:${settings.contactEmail}`} className="block min-h-11 underline underline-offset-4">
          {settings.contactEmail}
        </a>
      </section>
    </div>
  )
}
