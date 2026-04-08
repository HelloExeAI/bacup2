import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { MarketingAuthForm } from "@/components/marketing/MarketingAuthForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ oauth_error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) redirect("/start");

  const sp = searchParams ? await searchParams : {};
  return <MarketingAuthForm mode="signin" oauthError={typeof sp.oauth_error === "string" ? sp.oauth_error : undefined} />;
}
