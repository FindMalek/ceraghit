import { Logo } from "@workspace/ui/brand/logo"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { CartButton } from "./cart-button"
import { CurrencyToggle } from "./currency-toggle"
import { LanguageSwitcher } from "./language-switcher"
import { MobileNav } from "./mobile-nav"
import { NAV_LINKS } from "./nav-links"

export async function SiteHeader() {
  const t = await getTranslations("nav")
  return (
    <header className="sticky top-0 z-30 border-border border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:gap-6">
        <MobileNav />
        <Link href="/" className="me-auto lg:me-0">
          <Logo name="Ceraghit" />
        </Link>
        <nav className="me-auto hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map(({ href, key }) => (
            <Link
              key={href}
              href={href}
              className="font-heading text-sm uppercase tracking-widest underline-offset-8 hover:text-foreground hover:underline"
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <LanguageSwitcher className="hidden lg:flex" />
        <CurrencyToggle />
        <CartButton />
      </div>
    </header>
  )
}
