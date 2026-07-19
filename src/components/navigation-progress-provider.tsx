"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";

type NavigationProgressContextValue = {
  isNavigating: boolean;
  startNavigation: TransitionStartFunction;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

/**
 * Shared pending state for real page-to-page navigations. NavLink wraps
 * router.push/router.replace in `startNavigation`, which keeps `isNavigating`
 * true for the full navigation (including the async RSC fetch) because
 * router.push itself calls React.startTransition internally, and nested
 * transitions compose. TopProgressBar reads `isNavigating` to animate.
 *
 * Mounted once in the root layout (src/app/layout.tsx) so it's available on
 * every route, including ones outside the workspace layout (/login, /invite).
 */
export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const [isNavigating, startNavigation] = useTransition();

  return (
    <NavigationProgressContext.Provider value={{ isNavigating, startNavigation }}>
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  const context = useContext(NavigationProgressContext);
  if (!context) {
    throw new Error("useNavigationProgress must be used within a NavigationProgressProvider");
  }
  return context;
}
