import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-6 py-6 space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-4 w-32" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {Array.from({ length: 40 }).map((_, i) => (
          <Skeleton key={i} className="rounded-xl aspect-[63/88] w-full" />
        ))}
      </div>
    </div>
  );
}
