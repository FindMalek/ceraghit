import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import sharp from "sharp"
import { absoluteImage } from "./seo"

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = "image/png"

/** The brand palette from packages/ui brand.css, as hex because satori does not read CSS variables. */
const C = {
  ink: "#0b0b0b",
  raised: "#171512",
  gold: "#9a8868",
  goldBright: "#cdbf9f",
  goldTitle: "#e0d2ae",
  text: "#ece4d3",
}

const PHOTO = { width: 408, height: 520 }

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file))

async function loadFonts() {
  const [display, latin, latinBold, arabic, arabicBold, script] = await Promise.all([
    font("AlmendraDisplay-Regular.ttf"),
    font("Amiri-Regular.ttf"),
    font("Amiri-Bold.ttf"),
    font("Tajawal-Regular.ttf"),
    font("Tajawal-Bold.ttf"),
    font("MrsSaintDelafield-Regular.ttf"),
  ])
  return [
    { name: "Display", data: display, weight: 400 as const, style: "normal" as const },
    { name: "Amiri", data: latin, weight: 400 as const, style: "normal" as const },
    { name: "Amiri", data: latinBold, weight: 700 as const, style: "normal" as const },
    // Satori cannot read Amiri's Arabic shaping tables, Tajawal it can.
    { name: "Tajawal", data: arabic, weight: 400 as const, style: "normal" as const },
    { name: "Tajawal", data: arabicBold, weight: 700 as const, style: "normal" as const },
    { name: "Script", data: script, weight: 400 as const, style: "normal" as const },
  ]
}

/**
 * What goes in the card's <img>. The renderer cannot draw WebP (the whole catalogue is WebP) and refuses localhost, so the
 * photo is fetched here (from disk in development, over https in production), cropped to the frame and re-encoded as JPEG.
 */
export async function ogPhoto(image: string | undefined): Promise<string | undefined> {
  if (!image) return undefined
  try {
    let bytes: Buffer
    if (process.env.NODE_ENV !== "production") {
      if (!image.startsWith("/")) return undefined
      bytes = await readFile(join(process.cwd(), "public", image))
    } else {
      const res = await fetch(absoluteImage(image))
      if (!res.ok) return undefined
      bytes = Buffer.from(await res.arrayBuffer())
    }
    const jpeg = await sharp(bytes)
      .resize(PHOTO.width * 2, PHOTO.height * 2, { fit: "cover" })
      .jpeg({ quality: 84 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`
  } catch {
    // A photo that cannot be read must not fail the card: it just goes without one.
    return undefined
  }
}

export interface OgCard {
  locale: string
  /** Small line above the title: a reference, a section name. */
  eyebrow?: string
  title: string
  subtitle?: string
  /** Bottom line, e.g. the price. */
  footer?: string
  /** Absolute url of a photo (png, jpeg or webp). */
  image?: string
}

function titleSize(text: string, withImage: boolean): number {
  const long = withImage ? [16, 28, 44] : [24, 40, 60]
  const sizes = withImage ? [80, 66, 54, 44] : [104, 88, 72, 58]
  const n = text.length
  return sizes[n <= long[0]! ? 0 : n <= long[1]! ? 1 : n <= long[2]! ? 2 : 3]!
}

/** One 1200x630 card for every page: brand mark, text, and the piece's photo when there is one. */
export async function ogImage(card: OgCard): Promise<ImageResponse> {
  const rtl = card.locale === "ar"
  const face = rtl ? "Tajawal" : "Amiri"
  const titleFace = rtl ? "Tajawal" : "Display"
  const hasImage = Boolean(card.image)
  const align = rtl ? "flex-end" : "flex-start"
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 28,
        background: C.ink,
        backgroundImage: `radial-gradient(circle at 85% 15%, ${C.raised}, ${C.ink} 60%)`,
        color: C.text,
        fontFamily: face,
        direction: rtl ? "rtl" : "ltr",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: rtl ? "row-reverse" : "row",
          border: `2px solid ${C.gold}`,
          padding: 6,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: align,
            border: `1px solid ${C.gold}55`,
            padding: "40px 52px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 14, height: 14, background: C.gold, transform: "rotate(45deg)" }} />
            <div style={{ fontFamily: "Script", fontSize: 76, color: C.goldTitle, lineHeight: 1 }}>Ceraghit</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: align }}>
            {card.eyebrow ? (
              <div
                style={{ fontSize: 28, color: C.goldBright, letterSpacing: rtl ? 0 : 4, textTransform: "uppercase" }}
              >
                {card.eyebrow}
              </div>
            ) : null}
            <div
              style={{
                fontFamily: titleFace,
                fontSize: titleSize(card.title, hasImage),
                lineHeight: 1.08,
                color: "#f6f0e1",
                fontWeight: rtl ? 700 : 400,
                lineClamp: 3,
                textAlign: rtl ? "right" : "left",
              }}
            >
              {card.title}
            </div>
            {card.subtitle ? (
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1.35,
                  color: C.goldBright,
                  lineClamp: 2,
                  maxWidth: hasImage ? 620 : 860,
                  textAlign: rtl ? "right" : "left",
                }}
              >
                {card.subtitle}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 28, fontSize: 30, fontWeight: 700, color: C.goldBright }}>
            {card.footer ? <div style={{ color: C.goldTitle }}>{card.footer}</div> : null}
            <div style={{ color: C.gold }}>ceraghit.com</div>
          </div>
        </div>
        {hasImage ? (
          <div style={{ display: "flex", width: 420, padding: 6 }}>
            {/* biome-ignore lint/performance/noImgElement: satori renders plain img elements */}
            <img
              src={card.image}
              alt=""
              width={PHOTO.width}
              height={PHOTO.height}
              style={{ width: PHOTO.width, height: PHOTO.height, objectFit: "cover", border: `2px solid ${C.gold}` }}
            />
          </div>
        ) : null}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await loadFonts() },
  )
}
