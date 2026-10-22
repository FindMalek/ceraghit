import app from "../src/index"

/** Vercel function entry: every path is rewritten here by vercel.json. */
export default { fetch: app.fetch }
