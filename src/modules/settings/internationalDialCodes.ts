/** Common ITU-T E.164 calling codes for UI dropdown (label + value). */
export const INTERNATIONAL_DIAL_CODES: { code: string; label: string }[] = [
  { code: "+1", label: "United States / Canada (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+64", label: "New Zealand (+64)" },
  { code: "+353", label: "Ireland (+353)" },
  { code: "+91", label: "India (+91)" },
  { code: "+86", label: "China (+86)" },
  { code: "+81", label: "Japan (+81)" },
  { code: "+82", label: "South Korea (+82)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+852", label: "Hong Kong (+852)" },
  { code: "+886", label: "Taiwan (+886)" },
  { code: "+971", label: "United Arab Emirates (+971)" },
  { code: "+966", label: "Saudi Arabia (+966)" },
  { code: "+27", label: "South Africa (+27)" },
  { code: "+234", label: "Nigeria (+234)" },
  { code: "+254", label: "Kenya (+254)" },
  { code: "+20", label: "Egypt (+20)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+33", label: "France (+33)" },
  { code: "+39", label: "Italy (+39)" },
  { code: "+34", label: "Spain (+34)" },
  { code: "+31", label: "Netherlands (+31)" },
  { code: "+32", label: "Belgium (+32)" },
  { code: "+41", label: "Switzerland (+41)" },
  { code: "+43", label: "Austria (+43)" },
  { code: "+46", label: "Sweden (+46)" },
  { code: "+47", label: "Norway (+47)" },
  { code: "+45", label: "Denmark (+45)" },
  { code: "+358", label: "Finland (+358)" },
  { code: "+48", label: "Poland (+48)" },
  { code: "+351", label: "Portugal (+351)" },
  { code: "+30", label: "Greece (+30)" },
  { code: "+420", label: "Czech Republic (+420)" },
  { code: "+36", label: "Hungary (+36)" },
  { code: "+40", label: "Romania (+40)" },
  { code: "+7", label: "Russia / Kazakhstan (+7)" },
  { code: "+380", label: "Ukraine (+380)" },
  { code: "+90", label: "Turkey (+90)" },
  { code: "+972", label: "Israel (+972)" },
  { code: "+55", label: "Brazil (+55)" },
  { code: "+52", label: "Mexico (+52)" },
  { code: "+54", label: "Argentina (+54)" },
  { code: "+56", label: "Chile (+56)" },
  { code: "+57", label: "Colombia (+57)" },
  { code: "+51", label: "Peru (+51)" },
  { code: "+593", label: "Ecuador (+593)" },
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+66", label: "Thailand (+66)" },
  { code: "+84", label: "Vietnam (+84)" },
  { code: "+63", label: "Philippines (+63)" },
  { code: "+62", label: "Indonesia (+62)" },
  { code: "+92", label: "Pakistan (+92)" },
  { code: "+880", label: "Bangladesh (+880)" },
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+977", label: "Nepal (+977)" },
];

/** Split legacy `phone` (e.g. +14155552671) using longest matching dial code prefix. */
export function splitLegacyPhone(full: string | null | undefined): { code: string; national: string } {
  const t = full?.trim() ?? "";
  if (!t) return { code: "+1", national: "" };
  if (!t.startsWith("+")) {
    return { code: "+1", national: t.replace(/\D/g, "") };
  }
  const afterPlus = t.slice(1).replace(/\D/g, "");
  if (!afterPlus) return { code: "+1", national: "" };
  let best: { code: string; len: number } | null = null;
  for (const { code } of INTERNATIONAL_DIAL_CODES) {
    const num = code.slice(1);
    if (afterPlus.startsWith(num) && (!best || num.length > best.len)) {
      best = { code, len: num.length };
    }
  }
  if (best) {
    return { code: best.code, national: afterPlus.slice(best.len) };
  }
  return { code: "+1", national: afterPlus };
}
