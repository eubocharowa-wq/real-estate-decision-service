import type { Metadata } from "next";

import { ShortlistClient } from "../../src/shortlist/components";

export const metadata: Metadata = {
  title: "Подбор вариантов · REDS",
  description:
    "Короткий список недвижимости с персональным Match Score и отдельной оценкой надёжности данных.",
};

export default function ShortlistPage() {
  return <ShortlistClient />;
}
