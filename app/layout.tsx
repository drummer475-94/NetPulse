import type { Metadata, Viewport } from "next";
import "./globals.css";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath =
  configuredBasePath === "/"
    ? ""
    : configuredBasePath.replace(/\/$/, "");
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://netpulse-outage-map.drummer475.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "NetPulse — Internet outage signals near you",
  description:
    "See broad, state-level internet connectivity signals from Georgia Tech IODA.",
  openGraph: {
    type: "website",
    title: "NetPulse — Internet outage signals near you",
    description: "State-level internet health signals without false precision.",
    images: [
      {
        url: `${basePath}/og.png`,
        width: 1732,
        height: 908,
        alt: "NetPulse state-level internet connectivity signal map.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NetPulse — Internet outage signals near you",
    description: "State-level internet health signals without false precision.",
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
