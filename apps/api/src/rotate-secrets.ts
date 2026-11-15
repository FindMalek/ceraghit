import { createDb } from "@workspace/db"
import { rotateSecrets } from "@workspace/orpc/rotate"
import { parseKeyring } from "@workspace/orpc/secrets"
import { loadEnv } from "./env"

const env = loadEnv()
const keyring = parseKeyring(env.SECRETS_KEY, env.SECRETS_KEY_PREVIOUS)
if (!keyring) throw new Error("SECRETS_KEY is not set")
const db = createDb(env.DATABASE_URL, 1)
console.info(JSON.stringify(await rotateSecrets(db, keyring)))
process.exit(0)
