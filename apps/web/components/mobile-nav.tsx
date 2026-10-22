"use client"

import { ListIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { LanguageSwitcher } from "./language-switcher"
import { NAV_LINKS } from "./nav-links"

export function MobileNav() {
  const t = useTranslations("nav")
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:hidden"
        aria-label={t("menu")}
        onClick={() => setOpen(true)}
      >
        <ListIcon className="size-6" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle className="font-display text-3xl text-gold">{t("menu")}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col px-4">
            {NAV_LINKS.map(({ href, key }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-14 items-center border-border border-b font-heading text-lg"
              >
                {t(key)}
              </Link>
            ))}
          </nav>
          <LanguageSwitcher className="px-4" />
        </SheetContent>
      </Sheet>
    </>
  )
}
