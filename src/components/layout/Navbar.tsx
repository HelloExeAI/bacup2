"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUserStore } from "@/store/userStore";

export function Navbar() {
  const profile = useUserStore((s) => s.profile);

  return (
    <header className="h-14 border-b border-border bg-background">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-sm font-semibold">
          Bacup-2
        </Link>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {profile?.name ?? profile?.role ?? "—"}
          </div>
          <ThemeToggle />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const supabase = createSupabaseBrowserClient();
              await supabase.auth.signOut();
            }}
            type="button"
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

