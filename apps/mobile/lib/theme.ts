/**
 * Mirrors web `src/app/globals.css` warm paper / charcoal tokens (HSL components).
 */
export const lightTheme = {
  background: "hsl(40, 18%, 97%)",
  foreground: "hsl(24, 12%, 14%)",
  muted: "hsl(36, 22%, 93%)",
  mutedForeground: "hsl(26, 10%, 40%)",
  border: "hsl(34, 16%, 84%)",
  accent: "hsl(221, 83%, 53%)",
  card: "hsl(40, 16%, 99%)",
};

export const darkTheme = {
  background: "hsl(28, 16%, 8%)",
  foreground: "hsl(40, 20%, 96%)",
  muted: "hsl(28, 14%, 12%)",
  mutedForeground: "hsl(35, 12%, 70%)",
  border: "hsl(35, 10%, 22%)",
  accent: "hsl(217, 91%, 60%)",
  card: "hsl(28, 14%, 11%)",
};

export type AppTheme = typeof lightTheme;
