import Link from "next/link";
import { Icon, type IconName } from "./Icon";

/** One shortcut on the desktop-style home screen: icon in a rounded tile, label underneath. */
export function DesktopIcon({ href, icon, label, badge }: { href: string; icon: IconName; label: string; badge?: string }) {
  return (
    <Link href={href} className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-white/10 focus-visible:bg-white/10 sm:w-24">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-fg shadow-sm transition group-hover:scale-105 sm:h-14 sm:w-14">
        <Icon name={icon} className="h-6 w-6" />
        {badge && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">{badge}</span>}
      </span>
      <span className="line-clamp-2 text-xs font-medium text-fg drop-shadow sm:text-sm">{label}</span>
    </Link>
  );
}
