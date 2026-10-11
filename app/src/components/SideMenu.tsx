"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { SidebarLinks, type NavItem } from "./NavLinks";
import { SettingsPanel } from "./SettingsPanel";

type MenuUser = {
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN";
  dailyGoalMin: number;
  strictMode: number;
  parentEmail: string | null;
};

/**
 * The site's navigation now lives behind this button instead of an always-open left column — opened from the
 * header, or (in the desktop app) from the Windows-style button on the left of the bottom taskbar.
 */
export function SideMenu({ items, user }: { items: NavItem[]; user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // Closes itself after a navigation (clicking a link), and whenever Escape is pressed.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg transition hover:bg-soft"
        aria-label="Open menu"
        title="Menu"
      >
        <Icon name="menu" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Navigation">
            <button className="backdrop-enter absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
            <div className="drawer-left-enter absolute inset-y-0 left-0 flex w-full max-w-xs flex-col gap-4 overflow-y-auto border-r border-line bg-bg p-4 shadow-2xl">
              <div className="flex items-center justify-between px-1">
                <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
                    <Icon name="target" />
                  </span>
                  Focus Study
                </Link>
                <button className="btn-ghost !px-2.5" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" className="h-4 w-4" /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SidebarLinks items={items} />
                <div className="mt-1 border-t border-line pt-1">
                  <SettingsPanel user={user} />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
