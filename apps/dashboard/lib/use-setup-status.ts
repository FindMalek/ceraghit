import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"

/** Shared by the sidebar, the tab bar and the overview card; refreshed every minute. */
export const useSetupStatus = () => useQuery(orpc.admin.setup.status.queryOptions({ refetchInterval: 60_000 }))
