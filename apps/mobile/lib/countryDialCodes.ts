export type CountryDial = {
  iso2: string;
  dial: string;
  name: string;
};

/** Regional indicator symbols → flag emoji from ISO 3166-1 alpha-2. */
export function dialFlagEmoji(iso2: string): string {
  const a = iso2.toUpperCase();
  if (a.length !== 2 || !/^[A-Z]{2}$/.test(a)) return "\u2753";
  const base = 0x1f1e6;
  return String.fromCodePoint(base + a.charCodeAt(0) - 65, base + a.charCodeAt(1) - 65);
}

/** E.164-style dial codes (leading +). Order: US/CA first for shared +1. */
export const COUNTRY_DIAL_CODES: CountryDial[] = [
  { iso2: "US", dial: "+1", name: "United States" },
  { iso2: "CA", dial: "+1", name: "Canada" },
  { iso2: "GB", dial: "+44", name: "United Kingdom" },
  { iso2: "IN", dial: "+91", name: "India" },
  { iso2: "AU", dial: "+61", name: "Australia" },
  { iso2: "DE", dial: "+49", name: "Germany" },
  { iso2: "FR", dial: "+33", name: "France" },
  { iso2: "JP", dial: "+81", name: "Japan" },
  { iso2: "CN", dial: "+86", name: "China" },
  { iso2: "BR", dial: "+55", name: "Brazil" },
  { iso2: "MX", dial: "+52", name: "Mexico" },
  { iso2: "RU", dial: "+7", name: "Russia" },
  { iso2: "KR", dial: "+82", name: "South Korea" },
  { iso2: "IT", dial: "+39", name: "Italy" },
  { iso2: "ES", dial: "+34", name: "Spain" },
  { iso2: "NL", dial: "+31", name: "Netherlands" },
  { iso2: "SE", dial: "+46", name: "Sweden" },
  { iso2: "NO", dial: "+47", name: "Norway" },
  { iso2: "DK", dial: "+45", name: "Denmark" },
  { iso2: "FI", dial: "+358", name: "Finland" },
  { iso2: "PL", dial: "+48", name: "Poland" },
  { iso2: "CH", dial: "+41", name: "Switzerland" },
  { iso2: "AT", dial: "+43", name: "Austria" },
  { iso2: "BE", dial: "+32", name: "Belgium" },
  { iso2: "PT", dial: "+351", name: "Portugal" },
  { iso2: "IE", dial: "+353", name: "Ireland" },
  { iso2: "NZ", dial: "+64", name: "New Zealand" },
  { iso2: "SG", dial: "+65", name: "Singapore" },
  { iso2: "MY", dial: "+60", name: "Malaysia" },
  { iso2: "TH", dial: "+66", name: "Thailand" },
  { iso2: "VN", dial: "+84", name: "Vietnam" },
  { iso2: "PH", dial: "+63", name: "Philippines" },
  { iso2: "ID", dial: "+62", name: "Indonesia" },
  { iso2: "AE", dial: "+971", name: "United Arab Emirates" },
  { iso2: "SA", dial: "+966", name: "Saudi Arabia" },
  { iso2: "IL", dial: "+972", name: "Israel" },
  { iso2: "TR", dial: "+90", name: "Türkiye" },
  { iso2: "ZA", dial: "+27", name: "South Africa" },
  { iso2: "EG", dial: "+20", name: "Egypt" },
  { iso2: "NG", dial: "+234", name: "Nigeria" },
  { iso2: "KE", dial: "+254", name: "Kenya" },
  { iso2: "AR", dial: "+54", name: "Argentina" },
  { iso2: "CL", dial: "+56", name: "Chile" },
  { iso2: "CO", dial: "+57", name: "Colombia" },
  { iso2: "PK", dial: "+92", name: "Pakistan" },
  { iso2: "BD", dial: "+880", name: "Bangladesh" },
  { iso2: "LK", dial: "+94", name: "Sri Lanka" },
  { iso2: "NP", dial: "+977", name: "Nepal" },
  { iso2: "AF", dial: "+93", name: "Afghanistan" },
  { iso2: "IQ", dial: "+964", name: "Iraq" },
  { iso2: "IR", dial: "+98", name: "Iran" },
  { iso2: "JO", dial: "+962", name: "Jordan" },
  { iso2: "KW", dial: "+965", name: "Kuwait" },
  { iso2: "LB", dial: "+961", name: "Lebanon" },
  { iso2: "OM", dial: "+968", name: "Oman" },
  { iso2: "QA", dial: "+974", name: "Qatar" },
  { iso2: "BH", dial: "+973", name: "Bahrain" },
  { iso2: "YE", dial: "+967", name: "Yemen" },
  { iso2: "HK", dial: "+852", name: "Hong Kong" },
  { iso2: "TW", dial: "+886", name: "Taiwan" },
  { iso2: "MO", dial: "+853", name: "Macau" },
  { iso2: "CZ", dial: "+420", name: "Czechia" },
  { iso2: "HU", dial: "+36", name: "Hungary" },
  { iso2: "RO", dial: "+40", name: "Romania" },
  { iso2: "BG", dial: "+359", name: "Bulgaria" },
  { iso2: "GR", dial: "+30", name: "Greece" },
  { iso2: "UA", dial: "+380", name: "Ukraine" },
  { iso2: "BY", dial: "+375", name: "Belarus" },
  { iso2: "SK", dial: "+421", name: "Slovakia" },
  { iso2: "SI", dial: "+386", name: "Slovenia" },
  { iso2: "HR", dial: "+385", name: "Croatia" },
  { iso2: "RS", dial: "+381", name: "Serbia" },
  { iso2: "BA", dial: "+387", name: "Bosnia and Herzegovina" },
  { iso2: "MK", dial: "+389", name: "North Macedonia" },
  { iso2: "AL", dial: "+355", name: "Albania" },
  { iso2: "EE", dial: "+372", name: "Estonia" },
  { iso2: "LV", dial: "+371", name: "Latvia" },
  { iso2: "LT", dial: "+370", name: "Lithuania" },
  { iso2: "IS", dial: "+354", name: "Iceland" },
  { iso2: "LU", dial: "+352", name: "Luxembourg" },
  { iso2: "MT", dial: "+356", name: "Malta" },
  { iso2: "CY", dial: "+357", name: "Cyprus" },
  { iso2: "GH", dial: "+233", name: "Ghana" },
  { iso2: "TZ", dial: "+255", name: "Tanzania" },
  { iso2: "UG", dial: "+256", name: "Uganda" },
  { iso2: "ET", dial: "+251", name: "Ethiopia" },
  { iso2: "MA", dial: "+212", name: "Morocco" },
  { iso2: "DZ", dial: "+213", name: "Algeria" },
  { iso2: "TN", dial: "+216", name: "Tunisia" },
  { iso2: "PE", dial: "+51", name: "Peru" },
  { iso2: "VE", dial: "+58", name: "Venezuela" },
  { iso2: "EC", dial: "+593", name: "Ecuador" },
  { iso2: "UY", dial: "+598", name: "Uruguay" },
  { iso2: "PY", dial: "+595", name: "Paraguay" },
  { iso2: "BO", dial: "+591", name: "Bolivia" },
  { iso2: "CR", dial: "+506", name: "Costa Rica" },
  { iso2: "PA", dial: "+507", name: "Panama" },
  { iso2: "GT", dial: "+502", name: "Guatemala" },
  { iso2: "HN", dial: "+504", name: "Honduras" },
  { iso2: "SV", dial: "+503", name: "El Salvador" },
  { iso2: "NI", dial: "+505", name: "Nicaragua" },
  { iso2: "KZ", dial: "+7", name: "Kazakhstan" },
  { iso2: "UZ", dial: "+998", name: "Uzbekistan" },
  { iso2: "GE", dial: "+995", name: "Georgia" },
  { iso2: "AM", dial: "+374", name: "Armenia" },
  { iso2: "AZ", dial: "+994", name: "Azerbaijan" },
];

export const COUNTRY_DIAL_CODES_BY_NAME: CountryDial[] = [...COUNTRY_DIAL_CODES].sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function normalizeDialCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

/** Resolve stored `phone_country_code` to a row for display (exact dial match; +1 → first list row). */
export function findCountryByDial(dial: string): CountryDial | undefined {
  const d = normalizeDialCode(dial);
  if (!d) return undefined;
  const byLen = [...COUNTRY_DIAL_CODES].sort((a, b) => {
    const ld = b.dial.length - a.dial.length;
    if (ld !== 0) return ld;
    return a.iso2.localeCompare(b.iso2);
  });
  return byLen.find((c) => d === c.dial);
}
