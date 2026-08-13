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
  title: "NetPulse - regional outage signals and NOC diagnostics",
  description:
    "See broad, state-level IODA connectivity signals and run offline NOC training diagnostics.",
  openGraph: {
    type: "website",
    title: "NetPulse - regional signals and NOC diagnostics",
    description: "State-level internet health signals and offline diagnostic training tools.",
    images: [
      {
        url: `${basePath}/og.png`,
        width: 1732,
        height: 908,
        alt: "NetPulse regional connectivity signal map and diagnostics workbench.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NetPulse - regional signals and NOC diagnostics",
    description: "State-level internet health signals and offline diagnostic training tools.",
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
