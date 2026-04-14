import { redirect } from "next/navigation";

import { canUseBusinessOsOrDeveloper } from "@/lib/billing/businessOsAccess";
import { coerceBacupTierId } from "@/lib/billing/bacupTiers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkspaceHub } from "@/modules/workspace/WorkspaceHub";

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("user_settings")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  const tier = coerceBacupTierId(data?.subscription_tier);
  if (!canUseBusinessOsOrDeveloper(tier, user.email)) redirect("/my-view");

  return <WorkspaceHub />;
}
