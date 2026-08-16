export default function ShortlistLoading() {
  return (
    <main className="shortlist-loading" aria-busy="true" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Формируем короткий список</p>
      <h1>Подбираем варианты под ваши условия…</h1>
      <p>Сопоставляем готовые результаты и качество данных.</p>
    </main>
  );
}
