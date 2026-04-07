import type { MetadataRoute } from "next";

import { BACUP_CANONICAL_HOST } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = `https://${BACUP_CANONICAL_HOST}`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/signin", "/signup"],
        disallow: [
          "/api/",
          "/dashboard",
          "/scratchpad",
          "/tasks",
          "/settings",
          "/google",
          "/calendar",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: BACUP_CANONICAL_HOST,
  };
}

