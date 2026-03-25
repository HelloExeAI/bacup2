import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthBootstrap } from "@/modules/auth/AuthBootstrap";
import { AppLayout } from "@/components/layout/AppLayout";
import { fetchMyEvents, fetchMyTasks } from "@/lib/supabase/queries";

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

  const [initialTasks, initialEvents] = await Promise.all([
    fetchMyTasks(supabase),
    fetchMyEvents(supabase),
  ]);

  return (
    <AuthBootstrap initialTasks={initialTasks} initialEvents={initialEvents}>
      <AppLayout>{children}</AppLayout>
    </AuthBootstrap>
  );
}

