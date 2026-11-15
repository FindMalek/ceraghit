import { jobStatusSchema } from "@workspace/sdk"
import { z } from "zod"
import { jobStatuses } from "../../lib/jobs"
import { adminProcedure } from "../../procedures"

export const jobsRouter = {
  status: adminProcedure
    .route({ method: "GET", path: "/admin/jobs/status", summary: "Last run of each scheduled job", tags: ["admin"] })
    .input(z.object({}))
    .output(z.object({ items: z.array(jobStatusSchema) }))
    .handler(async ({ context }) => ({
      items: await jobStatuses(context, new Set(context.config.cronJobs ?? [])),
    })),
}
