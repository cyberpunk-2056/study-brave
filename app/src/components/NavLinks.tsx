"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export type NavItem = { href: string; label: string; icon: IconName };

const active = (path: string, href: string) => path === href || (href !== "/dashboard" && path.startsWith(href + "/")) || (href === "/admin" && path.startsWith("/admin"));

export function SidebarLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const on = active(path, it.href);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                on ? "bg-accent-soft text-accent" : "text-muted hover:bg-soft hover:text-fg"
              }`}
            >
              <Icon name={it.icon} />
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => {
          const on = active(path, it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${on ? "text-accent" : "text-muted"}`}>
                <Icon name={it.icon} className="h-6 w-6" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
