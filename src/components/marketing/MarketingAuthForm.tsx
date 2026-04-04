"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { syncPosthogPerson } from "@/lib/posthog-person";
import { FREE_TRIAL_DAYS } from "@/lib/marketing/trial";
import { getAppOrigin, getAuthSiteOrigin } from "@/lib/marketing/urls";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMyProfile } from "@/lib/supabase/queries";
import { useUserStore } from "@/store/userStore";

type Mode = "signup" | "signin";

function redirectAfterAuth(path: string, router: { replace: (href: string) => void }) {
  const app = getAppOrigin();
  if (app) {
    window.location.assign(`${app.replace(/\/$/, "")}${path}`);
    return;
  }
  router.replace(path);
}

export function MarketingAuthForm({
  mode,
  oauthError,
}: {
  mode: Mode;
  oauthError?: string;
}) {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(oauthError ?? null);
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState(false);

  React.useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  const oauthNextPath = mode === "signup" ? "/onboarding" : "/dashboard";

  async function signInWithGoogle() {
    setError(null);
    setOauthLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const origin = getAuthSiteOrigin() || window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(oauthNextPath)}`;
      const { data, error: oErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (oErr) throw oErr;
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("OAuth did not return a redirect URL. Enable Google in Supabase → Authentication.");
    } catch (err) {
      posthog.captureException(err);
      const message =
        err instanceof Error ? err.message : "Could not start Google sign-in. Check Supabase Auth settings.";
      setError(message);
    } finally {
      setOauthLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() || null },
          },
        });
        if (signUpError) throw signUpError;

        setUser(data.user ?? null);

        if (!data.session) {
          setError("Check your email to confirm your account, then sign in.");
          return;
        }

        const profile = await fetchMyProfile(supabase);
        setProfile(profile);
        if (data.user) {
          syncPosthogPerson(data.user, profile);
          posthog.capture("user_signed_up", { email: data.user.email });
        }
        redirectAfterAuth("/onboarding", router);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      setUser(data.user);
      const profile = await fetchMyProfile(supabase);
      setProfile(profile);
      syncPosthogPerson(data.user, profile);
      posthog.capture("user_logged_in", { email: data.user.email });
      redirectAfterAuth("/dashboard", router);
    } catch (err) {
      posthog.captureException(err);
      if (err instanceof TypeError && /fetch/i.test(err.message)) {
        setError(
          "Network error: couldn't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and your connection.",
        );
      } else {
        const anyErr = err as unknown as { message?: string; error_description?: string };
        const message =
          err instanceof Error
            ? err.message
            : anyErr?.message || anyErr?.error_description || "Something went wrong. Try again.";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-20">
      <Card className="border-[#e8e4dc] bg-white/90 shadow-md dark:border-[hsl(35_10%_22%)] dark:bg-[hsl(28_14%_12%)]">
        <CardHeader className="space-y-1">
          <div className="text-lg font-semibold text-[#1a1814] dark:text-white">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </div>
          <div className="text-sm text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
            {mode === "signin"
              ? "Sign in to open your workspace."
              : `Start your ${FREE_TRIAL_DAYS}-day free trial in minutes.`}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" ? (
              <div className="space-y-1">
                <div className="text-sm font-medium text-[#1a1814] dark:text-white">Name</div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                  className="bg-white dark:bg-[hsl(28_14%_10%)]"
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <div className="text-sm font-medium text-[#1a1814] dark:text-white">Email</div>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                className="bg-white dark:bg-[hsl(28_14%_10%)]"
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium text-[#1a1814] dark:text-white">Password</div>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                required
                className="bg-white dark:bg-[hsl(28_14%_10%)]"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-[#e8e4dc] bg-[#f3f1ec] px-3 py-2 text-sm text-[#1a1814] dark:border-[hsl(35_10%_26%)] dark:bg-[hsl(28_14%_14%)] dark:text-white">
                {error}
              </div>
            ) : null}

            <Button
              className="h-11 w-full rounded-full bg-[#1a1814] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-[#1a1814]"
              disabled={loading || oauthLoading}
              type="submit"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[#e8e4dc] dark:border-[hsl(35_10%_22%)]" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wide text-[#8a8478] dark:text-[hsl(35_10%_52%)]">
                <span className="bg-white px-2 dark:bg-[hsl(28_14%_12%)]">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full rounded-full border border-[#d4cfc4] font-medium dark:border-[hsl(35_10%_26%)]"
              disabled={loading || oauthLoading}
              onClick={() => void signInWithGoogle()}
            >
              {oauthLoading ? "Redirecting…" : "Continue with Google"}
            </Button>

            <p className="pt-2 text-center text-sm text-[#5c574e] dark:text-[hsl(35_12%_70%)]">
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <a href="/signup" className="font-medium text-[#1a1814] underline-offset-4 hover:underline dark:text-white">
                    Create an account
                  </a>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <a href="/signin" className="font-medium text-[#1a1814] underline-offset-4 hover:underline dark:text-white">
                    Sign in
                  </a>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
