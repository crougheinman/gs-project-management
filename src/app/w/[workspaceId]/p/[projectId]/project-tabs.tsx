"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "list", label: "List" },
  { slug: "board", label: "Board" },
  { slug: "calendar", label: "Calendar" },
  { slug: "settings", label: "Settings" },
];

export function ProjectTabs({ base }: { base: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Project views" className="mt-3 border-b border-border">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const href = `${base}/${tab.slug}`;
          const active = pathname.startsWith(href);
          return (
            <li key={tab.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-sm transition-colors duration-150",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
