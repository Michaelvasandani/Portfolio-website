import type { MetadataRoute } from "next";

import { getRendererFixture } from "@/src/renderer/fixtures";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getRendererFixture("typical").lastUpdated;
  return [
    { url: "https://michaelvasandani.com/", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://michaelvasandani.com/resume", lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
