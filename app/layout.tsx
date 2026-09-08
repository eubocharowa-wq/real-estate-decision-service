import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";

// Token layer first: globals.css reads its colours from these custom
// properties rather than declaring its own.
import "./design-system.css";
import "./globals.css";
import { resolveSiteUrl } from "../src/public-site";

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

export const metadata: Metadata = {
  title: "Основание — выбор под ваши условия",
  description: "Помогаем выбрать недвижимость под ваши условия.",
  // Stays undefined until an operator configures the origin, so relative
  // metadata is never resolved against a domain we do not control.
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
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
