import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App surfaces, tokenised links, and API — never index these.
        disallow: [
          "/admin",
          "/dashboard",
          "/managed-portal",
          "/managed-approve",
          "/invite",
          "/api",
          "/login",
          "/signup",
          "/forgot-password",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
