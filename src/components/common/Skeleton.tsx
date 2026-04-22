import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export function Skeleton({ className = '', rounded = 'lg' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200/80 rounded-${rounded} ${className}`}
    />
  );
}

export function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-7 w-20 mb-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Main content row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard>
            <Skeleton className="h-4 w-32 mb-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <Skeleton className="w-8 h-8 flex-shrink-0" rounded="full" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-3/4 mb-1.5" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16 flex-shrink-0" rounded="full" />
              </div>
            ))}
          </SkeletonCard>
        </div>

        <div className="space-y-4">
          <SkeletonCard>
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-32 w-full" rounded="xl" />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-2/3" />
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

export function FlockListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-36" rounded="xl" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 flex-shrink-0" rounded="xl" />
              <div>
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
            <Skeleton className="h-7 w-20" rounded="full" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="bg-gray-50 rounded-xl p-3">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-40 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32" rounded="xl" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-28" rounded="xl" />
        </div>
        <Skeleton className="h-48 w-full" rounded="xl" />
      </div>

      {/* Two column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
            <Skeleton className="h-4 w-32 mb-4" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
