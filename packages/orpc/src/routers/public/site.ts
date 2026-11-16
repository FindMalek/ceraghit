import { publicSiteImagesSchema } from "@workspace/sdk"
import { getPublicSiteImages } from "../../lib/site-images"
import { publicProcedure } from "../../procedures"

export const siteRouter = {
  images: publicProcedure
    .route({
      method: "GET",
      path: "/site/images",
      summary: "Visible pictures of the site by slot, the bundled default when a slot is empty",
      tags: ["site"],
    })
    .output(publicSiteImagesSchema)
    .handler(({ context }) => getPublicSiteImages(context.db)),
}
