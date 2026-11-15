import { ORPCError } from "@orpc/server"
import { admins } from "@workspace/db"
import { SETUP_OPTIONAL_STEPS, setupStatusSchema, shopProfileInputSchema, shopProfileSchema } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { loadSetup } from "../../lib/setup"
import { getShopProfile, toShopProfile, updateShopProfile } from "../../lib/shop-profile"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const ok = z.object({ ok: z.literal(true) })
const stepInput = z.object({ step: z.enum(SETUP_OPTIONAL_STEPS) })

export const profileRouter = {
  get: adminProcedure
    .route({ method: "GET", path: "/admin/profile", summary: "Owner and shop profile, bank included", tags: TAG })
    .output(
      z.object({
        owner: z.object({ name: z.string(), email: z.string(), nameConfirmed: z.boolean() }),
        shop: shopProfileSchema,
      }),
    )
    .handler(async ({ context }) => {
      const [[owner], shop] = await Promise.all([
        context.db
          .select({ name: admins.name, email: admins.email, nameConfirmedAt: admins.nameConfirmedAt })
          .from(admins)
          .where(eq(admins.id, context.admin.id))
          .limit(1),
        getShopProfile(context.db),
      ])
      if (!owner) throw new ORPCError("UNAUTHORIZED", { message: "Please sign in." })
      return {
        owner: { name: owner.name, email: owner.email, nameConfirmed: !!owner.nameConfirmedAt },
        shop: toShopProfile(shop),
      }
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/profile", summary: "Save the shop profile", tags: TAG })
    .input(shopProfileInputSchema)
    .output(ok)
    .handler(async ({ context, input }) => {
      await updateShopProfile(context.db, input)
      return { ok: true as const }
    }),

  updateOwner: adminProcedure
    .route({ method: "PUT", path: "/admin/profile/owner", summary: "Set the owner's name", tags: TAG })
    .input(z.object({ name: z.string().trim().min(2).max(80) }))
    .output(ok)
    .handler(async ({ context, input }) => {
      await context.db
        .update(admins)
        .set({ name: input.name, nameConfirmedAt: context.now() })
        .where(eq(admins.id, context.admin.id))
      return { ok: true as const }
    }),
}

export const setupRouter = {
  status: adminProcedure
    .route({ method: "GET", path: "/admin/setup", summary: "What is still missing from the setup", tags: TAG })
    .output(setupStatusSchema)
    .handler(({ context }) => loadSetup(context, context.admin.id)),

  skip: adminProcedure
    .route({ method: "POST", path: "/admin/setup/skip", summary: "Skip an optional setup step", tags: TAG })
    .input(stepInput)
    .output(ok)
    .handler(async ({ context, input }) => {
      const { skippedSteps } = await getShopProfile(context.db)
      await updateShopProfile(context.db, { skippedSteps: [...new Set([...skippedSteps, input.step])] })
      return { ok: true as const }
    }),

  unskip: adminProcedure
    .route({ method: "POST", path: "/admin/setup/unskip", summary: "Bring a skipped setup step back", tags: TAG })
    .input(stepInput)
    .output(ok)
    .handler(async ({ context, input }) => {
      const { skippedSteps } = await getShopProfile(context.db)
      await updateShopProfile(context.db, { skippedSteps: skippedSteps.filter((s) => s !== input.step) })
      return { ok: true as const }
    }),

  confirmShipping: adminProcedure
    .route({ method: "POST", path: "/admin/setup/shipping", summary: "Confirm the delivery fees", tags: TAG })
    .output(ok)
    .handler(async ({ context }) => {
      await updateShopProfile(context.db, { shippingConfirmedAt: context.now() })
      return { ok: true as const }
    }),

  finish: adminProcedure
    .route({ method: "POST", path: "/admin/setup/finish", summary: "Finish the onboarding", tags: TAG })
    .output(ok)
    .handler(async ({ context }) => {
      const status = await loadSetup(context, context.admin.id)
      if (!status.requiredDone) {
        throw new ORPCError("PRECONDITION_FAILED", { message: "Some required steps are not complete." })
      }
      const { onboardedAt } = await getShopProfile(context.db)
      await updateShopProfile(context.db, { onboardedAt: onboardedAt ?? context.now() })
      return { ok: true as const }
    }),
}
