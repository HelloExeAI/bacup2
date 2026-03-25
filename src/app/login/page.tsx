import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthForm } from "@/modules/auth/AuthForm";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) redirect("/dashboard");

  return <AuthForm />;
}

