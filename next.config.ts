import type { NextConfig } from "next";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const normalizedBasePath = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";
const isVinextBuild = process.argv.some((argument) =>
  argument.replaceAll("\\", "/").includes("/vinext/"),
);

const nextConfig: NextConfig = {
  // The Next CLI produces the GitHub Pages export. Vinext keeps its normal
  // server output for the existing Sites build.
  output: isVinextBuild ? undefined : "export",
  trailingSlash: true,
  basePath: normalizedBasePath,
  assetPrefix: normalizedBasePath || undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
