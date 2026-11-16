import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  // `jobs.yml` fills it from the repository variable; empty locally, where the CLI login picks the project.
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  runtime: "node-24",
  dirs: ["./src"],
  maxDuration: 300,
  // The api answers 500 when a job failed, so a failed run is worth retrying; a wrong secret or name aborts instead.
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 4,
      factor: 2,
      minTimeoutInMs: 30_000,
      maxTimeoutInMs: 600_000,
    },
  },
})
