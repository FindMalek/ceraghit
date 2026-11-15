import { test as setup } from "@playwright/test"
import { E2E } from "../env"
import { loginAsOwner } from "../helpers/login"

setup("sign in as owner", async ({ page }) => {
  await loginAsOwner(page)
  await page.context().storageState({ path: E2E.ownerState })
})
