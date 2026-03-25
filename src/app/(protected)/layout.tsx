import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthBootstrap } from "@/modules/auth/AuthBootstrap";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  return (
    <AuthBootstrap>
      <DashboardShell>{children}</DashboardShell>
    </AuthBootstrap>
  );
}

