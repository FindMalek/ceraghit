import { Amiri, Cinzel, Cormorant_Unicase, EB_Garamond, Mrs_Saint_Delafield } from "next/font/google"

const display = Cormorant_Unicase({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-display-face",
  display: "swap",
})
const serif = Cinzel({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  variable: "--font-serif-face",
  display: "swap",
})
const body = EB_Garamond({ subsets: ["latin"], variable: "--font-body-face" })
const script = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-script-face" })
const arabic = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-arabic-face" })

export const FONT_VARIABLES = [
  display.variable,
  serif.variable,
  body.variable,
  script.variable,
  arabic.variable,
] as const
