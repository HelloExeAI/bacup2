import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { MarketingAuthForm } from "@/components/marketing/MarketingAuthForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) redirect("/start");

  return <MarketingAuthForm mode="signup" />;
}
