"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { syncPosthogPerson } from "@/lib/posthog-person";
import { useUserStore } from "@/store/userStore";
import { fetchMyProfile } from "@/lib/supabase/queries";

type Mode = "login" | "signup";

export function AuthForm({ oauthError }: { oauthError?: string }) {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);

  const [mode, setMode] = React.useState<Mode>("login");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(oauthError ?? null);
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<"google" | null>(null);

  React.useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  async function signInWithOAuth(provider: "google") {
    setError(null);
    setOauthLoading(provider);
    try {
      const supabase = createSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/scratchpad")}`;
      const { data, error: oErr } = await supabase.auth.signInWithOAuth({
        provider,
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
      throw new Error("OAuth did not return a redirect URL. Enable the provider in Supabase → Authentication.");
    } catch (err) {
      posthog.captureException(err);
      const message =
        err instanceof Error ? err.message : "Could not start sign-in. Check Supabase Auth provider settings.";
      setError(message);
    } finally {
      setOauthLoading(null);
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
            data: {
              name: name.trim() || null,
            },
          },
        });
        if (signUpError) throw signUpError;

        const user = data.user;
        setUser(user ?? null);

        // If email confirmation is enabled, session may be null here.
        if (!data.session) {
          setError("Check your email to confirm your account, then login.");
          setMode("login");
          return;
        }

        const profile = await fetchMyProfile(supabase);
        setProfile(profile);
        if (user) {
          syncPosthogPerson(user, profile);
          posthog.capture("user_signed_up", { email: user.email });
        }
        router.replace("/scratchpad");
        return;
      }

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });
      if (signInError) throw signInError;

      setUser(data.user);
      const profile = await fetchMyProfile(supabase);
      setProfile(profile);
      syncPosthogPerson(data.user, profile);
      posthog.capture("user_logged_in", { email: data.user.email });
      router.replace("/scratchpad");
    } catch (err) {
      posthog.captureException(err);
      if (err instanceof TypeError && /fetch/i.test(err.message)) {
        setError(
          "Network error: couldn't reach Supabase (Failed to fetch). Check NEXT_PUBLIC_SUPABASE_URL, your internet/DNS, and that the Supabase project is reachable from this network.",
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <div className="text-lg font-semibold">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </div>
            <div className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Login to continue."
                : "Sign up to start using Bacup-2."}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              {mode === "signup" ? (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Name</div>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Your name"
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-sm font-medium">Email</div>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Password</div>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {error}
                </div>
              ) : null}

              <Button className="w-full" disabled={loading || oauthLoading !== null} type="submit">
                {loading
                  ? "Please wait…"
                  : mode === "login"
                    ? "Login"
                    : "Sign up"}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span className="bg-background px-2">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="w-full border border-border"
                disabled={loading || oauthLoading !== null}
                onClick={() => void signInWithOAuth("google")}
              >
                {oauthLoading === "google" ? "Redirecting…" : "Google"}
              </Button>

              <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => {
                    setError(null);
                    setMode((m) => (m === "login" ? "signup" : "login"));
                  }}
                >
                  {mode === "login"
                    ? "Need an account? Sign up"
                    : "Already have an account? Login"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

