# brand

Taken from `Catalogue Ceraghit, Collection 2027`. The only file to edit when the final brand style arrives is
`packages/ui/src/styles/brand.css`.

| token | value | where it comes from |
| :-- | :-- | :-- |
| `--brand-ink` | `#0b0b0b` | page background (PDF is near-black with a smoke texture) |
| `--brand-gold` | `#87775e` | every text and rule colour in the PDF |
| `--brand-gold-bright` | `#a89878` | body copy, so small text passes AA (7:1) |
| `--brand-jade`, `--brand-terracotta`, `--brand-ochre` | glaze colours | charts and status accents |
| `--brand-radius` | `2px` | the PDF has square frames |
| `--brand-texture` | `/texture.webp` | the PDF background, fixed behind the page |

Fonts in the PDF and the web stand-ins (the PDF's are demo or paid fonts, not licensed for web):

| PDF | web |
| :-- | :-- |
| BlackGothics Demo (titles) | Almendra Display |
| Baskerville Old Face (product names, prices) | Baskervville |
| Minion Pro (body) | EB Garamond |
| Brittany Signature ("Collection 2027") | Mrs Saint Delafield |
| Lucida Sans Typewriter (section numbers) | tabular figures of the display font |

If the studio owns licences for the original fonts, add the files to `apps/*/app/fonts` and point the four
`--font-*-face` variables at them; nothing else changes. The medallion is `apps/*/public/logo.webp` (from page 1).

Layout patterns from the PDF to keep: "Référence: 0010" above the title, an ornament divider, Matière / Technique /
Dimensions rows separated by thin rules, a gold-bordered price box, a large hero photo with two detail photos beneath,
numbered sections 01 to 04.
