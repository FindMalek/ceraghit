"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"
import { errorMessage, isUnauthorized } from "@workspace/orpc/errors"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useEffect } from "react"

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={`row-${i}`} className="h-16 w-full" />
      ))}
    </div>
  )
}

/** A failed call: an expired session goes back to the login page, anything else gets a retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const expired = isUnauthorized(error)
  useEffect(() => {
    if (expired) window.location.assign("/login")
  }, [expired])
  return (
    <Empty className="frame">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningCircleIcon />
        </EmptyMedia>
        <EmptyTitle>Impossible de charger</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            Réessayer
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Empty className="frame">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
