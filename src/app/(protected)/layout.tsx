import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthBootstrap } from "@/modules/auth/AuthBootstrap";
import { AppLayout } from "@/components/layout/AppLayout";
import { fetchMyEvents, fetchMyProfile, fetchMyTasks } from "@/lib/supabase/queries";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/signin");

  const [initialTasks, initialEvents, initialProfile] = await Promise.all([
    fetchMyTasks(supabase),
    fetchMyEvents(supabase),
    fetchMyProfile(supabase).catch(() => null),
  ]);

  return (
    <AuthBootstrap initialTasks={initialTasks} initialEvents={initialEvents} initialProfile={initialProfile}>
      <AppLayout>{children}</AppLayout>
    </AuthBootstrap>
  );
}

