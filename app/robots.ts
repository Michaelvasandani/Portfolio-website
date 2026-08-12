import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/renderer-fixtures/" },
    sitemap: "https://michaelvasandani.com/sitemap.xml",
    host: "https://michaelvasandani.com",
  };
}
