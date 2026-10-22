import { Logo } from "@workspace/ui/brand/logo"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { getSettings } from "@/lib/api"
import { NAV_LINKS } from "./nav-links"

export async function SiteFooter() {
  const [t, nav, settings] = await Promise.all([getTranslations("footer"), getTranslations("nav"), getSettings()])
  return (
    <footer className="mt-24 border-border border-t bg-background/80 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3">
        <div className="space-y-3">
          <Logo name="Ceraghit" />
          <p className="text-muted-foreground">{t("tagline")}</p>
        </div>
        <nav aria-label={t("explore")} className="space-y-1">
          <h2 className="font-heading text-muted-foreground text-sm uppercase tracking-widest">{t("explore")}</h2>
          <ul>
            {NAV_LINKS.map(({ href, key }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-11 items-center hover:text-foreground">
                  {nav(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <address className="space-y-1 not-italic">
          <h2 className="font-heading text-muted-foreground text-sm uppercase tracking-widest">{t("contact")}</h2>
          <a href={`mailto:${settings.contactEmail}`} className="flex min-h-11 items-center hover:text-foreground">
            {settings.contactEmail}
          </a>
          {settings.phones.map((phone) => (
            <a
              key={phone}
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="flex min-h-11 items-center hover:text-foreground"
            >
              {phone}
            </a>
          ))}
          {settings.whatsapp && (
            <a
              href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
              className="flex min-h-11 items-center hover:text-foreground"
            >
              {t("whatsapp")}
            </a>
          )}
          {settings.instagram && (
            <a
              href={
                settings.instagram.startsWith("http")
                  ? settings.instagram
                  : `https://instagram.com/${settings.instagram.replace(/^@/, "")}`
              }
              className="flex min-h-11 items-center hover:text-foreground"
            >
              {t("instagram")}
            </a>
          )}
        </address>
      </div>
      <p className="border-border border-t py-4 text-center text-muted-foreground text-xs">
        © {new Date().getFullYear()} Ceraghit Creation. {t("rights")}
      </p>
    </footer>
  )
}
