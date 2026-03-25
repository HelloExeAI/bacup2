"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/scratchpad", label: "Scratchpad" },
] as const;

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        "flex h-10 items-center rounded-md px-3 text-sm transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-background md:block">
      <div className="p-3">
        <div className="px-3 py-2 text-sm font-semibold">Bacup</div>
        <nav className="space-y-1">
          {navItems.map((i) => (
            <NavItem key={i.href} href={i.href} label={i.label} />
          ))}
        </nav>
      </div>
    </aside>
  );
}

