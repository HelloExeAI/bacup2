import { redirect } from "next/navigation";

/** Legacy `/login` → `/signin` (preserve OAuth error query). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ oauth_error?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const q = new URLSearchParams();
  if (typeof sp.oauth_error === "string") q.set("oauth_error", sp.oauth_error);
  const suffix = q.toString() ? `?${q}` : "";
  redirect(`/signin${suffix}`);
}
