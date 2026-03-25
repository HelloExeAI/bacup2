import { create } from "zustand";
import type { User } from "@supabase/supabase-js";

export type ProfileRole = "founder" | "ea" | "member";

export type Profile = {
  id: string;
  name: string | null;
  role: ProfileRole;
  created_at: string;
};

type UserState = {
  user: User | null;
  profile: Profile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  clear: () => void;
};

export const useUserStore = create<UserState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  clear: () => set({ user: null, profile: null }),
}));

