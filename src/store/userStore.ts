import { create } from "zustand";
import type { User } from "@supabase/supabase-js";

export type ProfileRole = "founder" | "ea" | "member";

export type Profile = {
  id: string;
  name: string | null;
  role: ProfileRole;
  created_at: string;
  phone?: string | null;
  phone_country_code?: string | null;
  timezone?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
};

type UserState = {
  user: User | null;
  profile: Profile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  patchProfile: (patch: Partial<Profile>) => void;
  clear: () => void;
};

export const useUserStore = create<UserState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  patchProfile: (patch) =>
    set((s) => (s.profile ? { profile: { ...s.profile, ...patch } } : s)),
  clear: () => set({ user: null, profile: null }),
}));

