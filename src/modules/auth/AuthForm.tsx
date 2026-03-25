"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/userStore";
import { fetchMyProfile } from "@/lib/supabase/queries";

type Mode = "login" | "signup";

export function AuthForm() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const setProfile = useUserStore((s) => s.setProfile);

  const [mode, setMode] = React.useState<Mode>("login");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

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
        router.replace("/dashboard");
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
      router.replace("/dashboard");
    } catch (err) {
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

              <Button className="w-full" disabled={loading} type="submit">
                {loading
                  ? "Please wait…"
                  : mode === "login"
                    ? "Login"
                    : "Sign up"}
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

