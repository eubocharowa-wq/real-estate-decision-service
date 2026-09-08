import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicPageHero } from "../public-page-components";
import { findSiteRegion, siteRegions } from "../../../src/site-content/regions";

// Regional routes are generated from the registry, not written by hand, so
// the geography can grow past the pilot city without new route files —
// AGENTS.md §18: the city stays data, never hardcoded into routing.
export function generateStaticParams() {
  return siteRegions.map((region) => ({ region: region.slug }));
}

export const dynamicParams = false;

interface RegionPageProps {
  readonly params: Promise<{ readonly region: string }>;
}

export async function generateMetadata({
  params,
}: RegionPageProps): Promise<Metadata> {
  const { region: slug } = await params;
  const region = findSiteRegion(slug);
  if (!region) return {};
  return {
    title: `${region.headline} — Основание`,
    description: region.metaDescription,
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  const { region: slug } = await params;
  const region = findSiteRegion(slug);
  if (!region) {
    notFound();
  }

  return (
    <>
      <PublicPageHero
        eyebrow={region.federalSubject}
        title={region.headline}
        lead={region.lead}
      >
        <Link className="button button-primary" href="/selection">
          Начать бесплатный подбор
        </Link>
      </PublicPageHero>
    </>
  );
}
