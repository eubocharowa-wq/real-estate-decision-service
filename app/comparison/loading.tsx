export default function ComparisonLoading() {
  return (
    <main className="shortlist-loading" aria-busy="true" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Сравнение финалистов</p>
      <h1>Готовим таблицу решения…</h1>
      <p>Сопоставляем варианты по вашим условиям.</p>
    </main>
  );
}
