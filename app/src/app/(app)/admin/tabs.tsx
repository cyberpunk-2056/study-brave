"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/channels", "Approved channels"],
  ["/admin/sites", "Course sites"],
  ["/admin/support", "Support"],
  ["/admin/announcements", "Announcements"],
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <div className="hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tabs.map(([href, label]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`chip ${on ? "chip-active" : ""}`}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
