import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const title = "Michael Vasandani — AI Engineering Portfolio";
const description = "Michael Vasandani builds dependable agentic AI systems, software products, and data-intensive engineering tools.";

export const metadata: Metadata = {
  metadataBase: new URL("https://michaelvasandani.com"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "profile",
    url: "/",
    title,
    description,
    siteName: "Michael Vasandani Portfolio",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Michael Vasandani — engineer of dependable agentic systems" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/source-serif-4.005/source-serif-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/source-serif-4.005/source-serif-semibold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
