import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"

export default async function NotFound() {
  const t = await getTranslations("notFound")
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-24 text-center">
      <p className="font-display text-8xl text-gold">404</p>
      <h1 className="text-4xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("text")}</p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
        {t("home")}
      </Link>
    </section>
  )
}
