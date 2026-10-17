import type { ReactNode } from "react";

import { PilotModeBanner, SiteFooter, SiteHeader } from "./site-chrome";

type PublicLayoutProps = Readonly<{
  children: ReactNode;
}>;

// Public marketing/content routes only. Internal tooling (expert workbench,
// journey, shortlist and the other product screens) stays outside this group
// so it never renders the public chrome — AGENTS.md §85.
export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к основному содержанию
      </a>
      <PilotModeBanner />
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </>
  );
}
