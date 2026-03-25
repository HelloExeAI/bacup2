"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

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
        <nav className="space-y-1">
          <NavItem href="/dashboard" label="Dashboard" />
        </nav>
      </div>
    </aside>
  );
}

