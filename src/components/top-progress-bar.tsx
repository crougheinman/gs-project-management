"use client";

import { useNavigationProgress } from "@/components/navigation-progress-provider";

/**
 * Thin top-of-page progress bar for real page navigations (see NavLink).
 * Purely CSS-driven off the shared `isNavigating` flag - no local state or
 * effects here, so there's nothing for react-hooks/set-state-in-effect to
 * flag and nothing to clean up on unmount.
 */
export function TopProgressBar() {
  const { isNavigating } = useNavigationProgress();

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className={
          isNavigating
            ? "h-full w-full origin-left animate-nav-progress-grow bg-primary opacity-100"
            : "h-full w-full origin-left scale-x-100 bg-primary opacity-0 transition-[transform,opacity] duration-200 ease-out"
        }
      />
    </div>
  );
}
