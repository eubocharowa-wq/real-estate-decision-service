import type { Metadata } from "next";

import { PublicCta, PublicPageHero } from "../public-page-components";

export const metadata: Metadata = {
  title: "Материалы — Real Estate Decision Service",
  description:
    "Разборы реальных ситуаций выбора недвижимости. Раздел пока пустой — материалы появятся по мере накопления разборов.",
};

export default function MaterialsPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Материалы"
        title="Материалы"
        lead="Здесь будут разборы реальных ситуаций выбора: как читать расхождения в данных, чем отличаются сценарии покупки, где чаще всего теряются деньги и время."
      />

      <section className="public-section" aria-label="Список материалов">
        <div className="public-empty">
          <h2>Материалов пока нет</h2>
          <p>
            Раздел открыт, но пуст. Мы не публикуем пересказы чужих статей —
            материалы появятся здесь по мере того, как накопятся собственные
            разборы.
          </p>
        </div>
      </section>

      <PublicCta
        title="Пока материалов нет — можно начать с подбора"
        text="Подбор бесплатный и покажет на вашей задаче то, о чём будут материалы."
      />
    </>
  );
}
