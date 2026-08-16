export default function PropertyDetailLoading() {
  return (
    <main className="shortlist-loading" aria-busy="true" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Страница объекта</p>
      <h1>Загружаем данные объекта…</h1>
      <p>Подготавливаем уже собранные факты и результаты проверки.</p>
    </main>
  );
}
