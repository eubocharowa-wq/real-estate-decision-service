import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicPageHero } from "../../public-page-components";
import {
  caseStudies,
  findCaseStudy,
} from "../../../../src/site-content/case-studies";

// Case-study routes are generated from the registry, not written by hand,
// so a new разбор only needs a new entry in src/site-content/case-studies.ts.
export function generateStaticParams() {
  return caseStudies.map((study) => ({ materialSlug: study.slug }));
}

export const dynamicParams = false;

interface CaseStudyPageProps {
  readonly params: Promise<{ readonly materialSlug: string }>;
}

export async function generateMetadata({
  params,
}: CaseStudyPageProps): Promise<Metadata> {
  const { materialSlug } = await params;
  const study = findCaseStudy(materialSlug);
  if (!study) return {};
  return {
    title: `${study.title} — разбор — Основание`,
    description: study.summary,
  };
}

export default async function CaseStudyPage({ params }: CaseStudyPageProps) {
  const { materialSlug } = await params;
  const study = findCaseStudy(materialSlug);
  if (!study) {
    notFound();
  }

  return (
    <>
      <PublicPageHero eyebrow="Разбор" title={study.title} lead={study.lead} />

      <section className="public-section" aria-label={study.evaluationHeading}>
        {study.leadExtra ? <p>{study.leadExtra}</p> : null}
        <h2>{study.evaluationHeading}</h2>
        <ul className="public-list">
          {study.evaluationPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="public-section" aria-label="Результат разбора">
        <h2>Результат разбора:</h2>
        <p>{study.result}</p>
        <p>
          <Link href="/materials">Вернуться к списку разборов</Link>
        </p>
      </section>
    </>
  );
}
