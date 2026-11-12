import Link from "next/link";

/** Informational fallback only; the API policy remains the write boundary. */
export function PublicDataWriteNotice({
  headingLevel = 2,
}: {
  readonly headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="entry-card" aria-labelledby="intake-closed-title">
      <Heading id="intake-closed-title">
        Приём новых запросов временно закрыт
      </Heading>
      <p>
        Сейчас отправить новую задачу через сайт нельзя. Пожалуйста, вернитесь
        позже.
      </p>
      <Link className="button button-secondary" href="/methodology">
        Как проверяем информацию
      </Link>
    </section>
  );
}
