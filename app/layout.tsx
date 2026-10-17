import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";

// Token layer first: globals.css reads its colours from these custom
// properties rather than declaring its own.
import "./design-system.css";
import "./globals.css";
import { resolveSiteUrl } from "../src/public-site";
import { resolvePilotRuntimeConfig } from "../src/pilot-hardening/config";

// Cyrillic is required: the whole interface is in Russian. Both families are
// variable fonts, so the weights the stylesheet already uses (500 for display
// headings, 700-850 for interface emphasis) come from a single file each.
const interfaceFont = Inter({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-interface",
});

const displayFont = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-display",
});

const siteUrl = resolveSiteUrl();
const isProductionApplication =
  resolvePilotRuntimeConfig().mode === "production";

export const metadata: Metadata = {
  title: "Основание — выбор под ваши условия",
  description:
    "Формируем обоснованное решение по недвижимости под ваши условия.",
  // Stays undefined until an operator configures the origin, so relative
  // metadata is never resolved against a domain we do not control.
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  // A pilot/demo deployment is not the real product and must never be
  // indexed or cited as evidence that production is live. A route that
  // needs noindex for its own reasons (see the placeholder legal/about
  // pages) still sets metadata.robots itself; this only covers routes that
  // don't, and REDS_APPLICATION_MODE (src/pilot-hardening/config.ts) is the
  // only switch — never the hostname.
  ...(isProductionApplication
    ? {}
    : { robots: { index: false, follow: false } }),
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="ru"
      className={`${interfaceFont.variable} ${displayFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
