/**
 * Mail styles are inline, so the brand colours from `packages/ui/src/styles/brand.css` are mirrored here. Templates
 * read colours only through `mailColors`; `test/email-brand.test.ts` fails when this and the css drift.
 */
export const mailColors = {
  ink: "#0b0b0b",
  inkRaised: "#131210",
  inkSoft: "#1c1a17",
  gold: "#87775e",
  goldBright: "#a89878",
  goldTitle: "#b8a886",
} as const

/** Web fonts do not load in most mail clients. */
export const MAIL_SERIF = "'Cormorant Garamond', Garamond, 'Times New Roman', Georgia, serif"
