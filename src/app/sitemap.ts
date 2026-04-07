import type { MetadataRoute } from "next";

import { defaultSiteOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = defaultSiteOrigin();
  const now = new Date();

  // Only include public, indexable marketing routes here.
  const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.8 },
    { path: "/signin", changeFrequency: "monthly", priority: 0.2 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.2 },
  ];

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}

