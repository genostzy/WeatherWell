import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

/**
 * A few grey rows where a list or card is still loading, announced once to
 * screen readers by `label` ("Loading alerts…") instead of a blank space.
 */
function SkeletonRows({ label, rows = 3, className }: { label: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("space-y-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-10 w-full", i === rows - 1 && rows > 1 && "w-2/3")} />
      ))}
    </div>
  )
}

/**
 * The rough shape of a screen (a map, a status card, a few rows) while its
 * data loads. The label is also shown as text for anyone on a slow phone
 * wondering whether anything is happening.
 */
function PageSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("mx-auto w-full max-w-2xl space-y-4 p-4 lg:max-w-5xl", className)}>
      <Skeleton className="h-[280px] w-full rounded-xl sm:h-[400px]" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
      <p className="text-center text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export { Skeleton, SkeletonRows, PageSkeleton }
