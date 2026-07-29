import type { Metadata, Viewport } from "next";
import "./globals.css";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath =
  configuredBasePath === "/"
    ? ""
    : configuredBasePath.replace(/\/$/, "");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "NetPulse — Internet outage signals near you",
  description:
    "Find major internet outage signals near your current location or a U.S. ZIP code.",
  openGraph: {
    type: "website",
    title: "NetPulse — Internet outage signals near you",
    description: "Know when the internet goes quiet.",
    images: [
      {
        url: `${basePath}/og.png`,
        width: 1732,
        height: 908,
        alt: "NetPulse outage radar with the headline Know when the internet goes quiet.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NetPulse — Internet outage signals near you",
    description: "Know when the internet goes quiet.",
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f2e9",
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
