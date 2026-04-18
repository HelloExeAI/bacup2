/** Google People `otherContacts:search` requires at least this many characters. */
export const GOOGLE_OTHER_CONTACTS_MIN_QUERY = 3;

export class GooglePeopleSearchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "GooglePeopleSearchError";
  }
}

type PeopleSearchResult = {
  person?: {
    resourceName?: string;
    emailAddresses?: { value?: string; metadata?: { primary?: boolean } }[];
    names?: { displayName?: string; givenName?: string; familyName?: string; metadata?: { primary?: boolean } }[];
  };
};

export type GoogleOtherContactRow = {
  email: string;
  displayName: string | null;
  resourceName: string | null;
};

/**
 * Search the signed-in Google account’s “Other contacts” (People API).
 * Returns [] when `query` is shorter than {@link GOOGLE_OTHER_CONTACTS_MIN_QUERY}.
 */
export async function searchGoogleOtherContacts(
  accessToken: string,
  query: string,
): Promise<GoogleOtherContactRow[]> {
  const q = query.trim();
  if (q.length < GOOGLE_OTHER_CONTACTS_MIN_QUERY) return [];

  const apiUrl = new URL("https://people.googleapis.com/v1/otherContacts:search");
  apiUrl.searchParams.set("query", q);
  apiUrl.searchParams.set("readMask", "names,emailAddresses");
  apiUrl.searchParams.set("pageSize", "12");

  const res = await fetch(apiUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    const err = json?.error as { message?: string } | undefined;
    const msg = typeof err?.message === "string" ? err.message : "people_search_failed";
    throw new GooglePeopleSearchError(msg, res.status >= 400 && res.status < 600 ? res.status : 502, json);
  }

  const results = Array.isArray(json?.results) ? (json.results as PeopleSearchResult[]) : [];
  const out: GoogleOtherContactRow[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    const person = row.person;
    const resourceName = typeof person?.resourceName === "string" ? person.resourceName : null;
    const emails = person?.emailAddresses ?? [];
    const names = person?.names ?? [];
    const displayName =
      names.find((n) => n.metadata?.primary)?.displayName ||
      names[0]?.displayName ||
      [names[0]?.givenName, names[0]?.familyName].filter(Boolean).join(" ").trim() ||
      null;

    for (const ea of emails) {
      const email = typeof ea.value === "string" ? ea.value.trim().toLowerCase() : "";
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ email, displayName: displayName || null, resourceName });
      if (out.length >= 10) break;
    }
    if (out.length >= 10) break;
  }

  return out;
}
