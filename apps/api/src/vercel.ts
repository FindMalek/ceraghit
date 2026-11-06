import app from "./index"

/** Vercel function entry, bundled into api/index.js by `pnpm build:vercel`: every path is rewritten here by vercel.json. */
export default { fetch: app.fetch }
