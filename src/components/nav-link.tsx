"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useNavigationProgress } from "@/components/navigation-progress-provider";

type LinkProps = ComponentProps<typeof Link>;

type NavLinkProps = Omit<LinkProps, "href"> & {
  /**
   * Every real page-to-page Link in this app already uses a plain path
   * string. Restricting to `string` (instead of next/link's `Url` union)
   * means we can hand it straight to router.push/router.replace below
   * without reimplementing next/link's UrlObject formatting.
   */
  href: string;
};

/**
 * Drop-in replacement for next/link's `<Link>` for real page-to-page
 * navigation. Renders a normal `<Link>` - so prefetching, keyboard
 * activation, and native "open in new tab" / "copy link address" (via the
 * real rendered <a href>) all work exactly as before - but takes over the
 * actual navigation via `onNavigate`, running it inside the shared
 * navigation transition so <TopProgressBar> knows when to show and hide.
 *
 * next/link's `onNavigate` only fires for a plain, same-tab, in-app click:
 * it runs after next/link's own checks for modifier-click (cmd/ctrl/shift/
 * alt), middle-click, target="_blank", download links, and external/
 * non-local URLs - none of that needs to be reimplemented here. For any of
 * those cases, onNavigate is never called and the browser's/next/link's
 * default behavior (e.g. opening a new tab) proceeds untouched.
 */
export function NavLink({ href, onNavigate, replace, scroll, ...props }: NavLinkProps) {
  const router = useRouter();
  const { startNavigation } = useNavigationProgress();

  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={(event) => {
        onNavigate?.(event);
        // Next's onNavigate event is `{ preventDefault: () => void }` only -
        // no `defaultPrevented` to read back, so there's no way for a caller
        // to signal "don't intercept" via this minimal event shape.
        event.preventDefault();
        startNavigation(() => {
          if (replace) {
            router.replace(href, { scroll });
          } else {
            router.push(href, { scroll });
          }
        });
      }}
    />
  );
}
