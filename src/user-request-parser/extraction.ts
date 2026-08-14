import type { Criterion, UserRequest } from "../domain";
import type { ExtractedFact, UserRequestParserInput } from "./contracts";
import {
  addCriterion,
  addExtractedFact,
  addInferredCandidate,
  addUnknown,
  addYears,
  money,
  parseNumericToken,
  scaleAmount,
  sourceSpan,
  stableId,
  type ParserDraft,
} from "./normalization";

type Priority = Criterion["priority"];
type PropertyType = UserRequest["property"]["allowed_property_types"][number];

interface ClassifiedPriority {
  value: Priority;
  confidence: number;
}

const clauseAt = (text: string, index: number): string => {
  const start = Math.max(
    text.lastIndexOf(".", index),
    text.lastIndexOf("!", index),
    text.lastIndexOf("?", index),
    text.lastIndexOf("\n", index),
  );
  const delimiters = [
    text.indexOf(".", index),
    text.indexOf("!", index),
    text.indexOf("?", index),
    text.indexOf("\n", index),
  ].filter((position) => position >= 0);
  const end = delimiters.length > 0 ? Math.min(...delimiters) : text.length;
  return text.slice(start + 1, end).trim();
};

const clauseSourceSpan = (text: string, index: number) => {
  const phrase = clauseAt(text, index);
  const start = text.indexOf(phrase, Math.max(0, text.lastIndexOf(".", index)));
  return sourceSpan(text, start, start + phrase.length);
};

const commaSegmentAt = (text: string, index: number): string => {
  const start = Math.max(
    text.lastIndexOf(",", index),
    text.lastIndexOf(".", index),
  );
  const candidates = [
    text.indexOf(",", index),
    text.indexOf(".", index),
  ].filter((position) => position >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(start + 1, end).trim();
};

const classifyPriority = (
  text: string,
  fallback: Priority = "preferred",
): ClassifiedPriority => {
  const value = text.toLowerCase();
  if (
    /не хочу,? но можно|не хочу,? но если|лучше не|предпоч[её]л(?:а)? бы избежать/u.test(
      value,
    )
  ) {
    return { value: "avoid", confidence: 0.98 };
  }
  if (/не рассматрива|ни в коем случае|вообще не рассматрива/u.test(value)) {
    return { value: "exclude", confidence: 0.99 };
  }
  if (
    /не ?важен|неважно|не принципиально|можно любой|готов(?:а)? рассмотреть/u.test(
      value,
    )
  ) {
    return { value: "neutral", confidence: 0.98 };
  }
  if (/желательно|хотелось бы|по возможности|будет плюсом|лучше/u.test(value)) {
    return { value: "preferred", confidence: 0.96 };
  }
  if (
    /только|строго|обязательно|принципиально|не больше|не меньше|максимум|минимум/u.test(
      value,
    )
  ) {
    return { value: "must", confidence: 0.98 };
  }
  return { value: fallback, confidence: 0.72 };
};

const matchSpan = (rawText: string, match: RegExpExecArray) =>
  sourceSpan(rawText, match.index, match.index + match[0].length);

const pushUnique = <T>(values: T[], value: T): void => {
  if (!values.includes(value)) values.push(value);
};

const recordScalar = (
  draft: ParserDraft,
  rawText: string,
  match: RegExpExecArray,
  field: string,
  value: ExtractedFact["value"],
  priority: Priority | null = null,
  confidence = 0.98,
): void => {
  addExtractedFact(
    draft,
    field,
    value,
    matchSpan(rawText, match),
    confidence,
    priority,
    confidence,
  );
};

const extractIntentAndGoal = (draft: ParserDraft, rawText: string): void => {
  const find = /найди(?:те)?/iu.exec(rawText);
  const compare = /(?:сравн(?:и|ить|ите)|какой лучше|три варианта)/iu.exec(
    rawText,
  );
  const affordability =
    /(?:что (?:я|мы) могу позволить|могу позволить|по карману)/iu.exec(rawText);
  const locationDiscovery =
    /(?:город пока не (?:выбрали|выбран)|не зна(?:ю|ем),? в каком городе|куда лучше переехать)/iu.exec(
      rawText,
    );

  const detected = compare
    ? (["compare", compare] as const)
    : affordability
      ? (["affordability", affordability] as const)
      : locationDiscovery
        ? (["location_discovery", locationDiscovery] as const)
        : find
          ? (["find", find] as const)
          : null;
  if (detected) {
    draft.request.intent = detected[0];
    recordScalar(draft, rawText, detected[1], "intent", detected[0]);
  } else {
    const decisionHelp =
      /(?:помоги(?:те)? выбрать|не могу решить|принять решение)/iu.exec(
        rawText,
      );
    if (decisionHelp) {
      draft.request.intent = "decision_help";
      recordScalar(draft, rawText, decisionHelp, "intent", "decision_help");
    }
  }

  const goalPatterns: Array<[UserRequest["goal"]["purpose"], RegExp]> = [
    ["relocation", /(?:переех|переезд)\p{L}*/iu],
    ["parents_purchase", /(?:для родителей|родителям)/iu],
    ["child_purchase", /(?:для ребёнка|для ребенка|сыну|дочери)/iu],
    ["second_home", /(?:второй дом|вторая квартира)/iu],
    ["investment", /(?:инвестиц|для сдачи|доходн)\p{L}*/iu],
    ["housing_improvement", /(?:улучшить жилищ|расширить жилплощад)\p{L}*/iu],
    ["capital_preservation", /(?:сохранить капитал|сбережен)\p{L}*/iu],
    ["seasonal_residence", /(?:дача|сезонн)\p{L}*/iu],
    ["own_residence", /(?:для себя|будем жить|собственное жиль[её])/iu],
  ];
  for (const [purpose, pattern] of goalPatterns) {
    const match = pattern.exec(rawText);
    if (!match) continue;
    draft.request.goal = { purpose, description: match[0] };
    recordScalar(draft, rawText, match, "goal.purpose", purpose);
    break;
  }
};

const extractResultLimit = (draft: ParserDraft, rawText: string): void => {
  const match =
    /(?:найди(?:те)?|покажи(?:те)?)\s+(\d+|одну|один|два|две|три|четыре|пять|пяти|шесть|семь|восемь|девять|десять)/iu.exec(
      rawText,
    );
  if (!match?.[1]) return;
  const count = parseNumericToken(match[1].replace(/одну/u, "одна"));
  if (count === null || count < 5 || count > 10) return;
  draft.request.result_limit = count;
  draft.user_requested_limit = count;
  recordScalar(draft, rawText, match, "result_limit", count);
};

const extractLocation = (draft: ParserDraft, rawText: string): void => {
  const cityPatterns = [
    /(?:квартир(?:у|ы)?|дом(?:а)?|недвижимость)\s+в\s+([А-ЯЁ][а-яё-]+)/giu,
    /(?:город(?:е)?|только)\s+([А-ЯЁ][а-яё-]+)(?!\s+район)/giu,
  ];
  for (const pattern of cityPatterns) {
    for (const match of rawText.matchAll(pattern)) {
      const city = match[1];
      if (!city || /район|област/u.test(city)) continue;
      pushUnique(draft.request.location.cities, city);
      draft.request.location.location_flexible = /только/iu.test(match[0])
        ? false
        : null;
      recordScalar(
        draft,
        rawText,
        match as RegExpExecArray,
        "location.cities",
        city,
        /только/iu.test(match[0]) ? "must" : "preferred",
      );
    }
  }

  const country = /(?:в|по)\s+(России|Беларуси|Казахстане)/iu.exec(rawText);
  if (country?.[1]) {
    const code = country[1].toLowerCase().startsWith("рос")
      ? "RU"
      : country[1].toLowerCase().startsWith("бел")
        ? "BY"
        : "KZ";
    pushUnique(draft.request.location.country_codes, code);
    recordScalar(draft, rawText, country, "location.country_codes", code);
  }

  const south = /(?:на юг|южн(?:ый|ом|ые|ых) регион\p{L}*)/iu.exec(rawText);
  if (south) {
    pushUnique(draft.request.location.regions, "юг");
    draft.request.location.location_flexible = true;
    recordScalar(draft, rawText, south, "location.regions", "юг", "neutral");
  }

  const regionPattern = /(?:в|по)\s+([А-ЯЁ][\p{L}-]+\s+(?:области|крае))/gu;
  for (const match of rawText.matchAll(regionPattern)) {
    if (!match[1]) continue;
    pushUnique(draft.request.location.regions, match[1]);
    recordScalar(
      draft,
      rawText,
      match as RegExpExecArray,
      "location.regions",
      match[1],
      "preferred",
    );
  }

  const excludedLocationPattern =
    /((?:[А-ЯЁ][а-яё-]+\s+)?(?:область|край|город))\s+(?:вообще\s+)?не рассматрива\p{L}*/giu;
  for (const match of rawText.matchAll(excludedLocationPattern)) {
    if (!match[1]) continue;
    pushUnique(draft.request.location.excluded_locations!, match[1]);
    recordScalar(
      draft,
      rawText,
      match as RegExpExecArray,
      "location.excluded_locations",
      match[1],
      "exclude",
      0.99,
    );
  }

  const districtPattern = /([А-ЯЁ][а-яё-]+)\s+район/gu;
  for (const match of rawText.matchAll(districtPattern)) {
    const district = match[1];
    if (!district) continue;
    const clause = clauseAt(rawText, match.index ?? 0);
    const priority = classifyPriority(clause, "preferred");
    const excluded = priority.value === "exclude" || priority.value === "avoid";
    pushUnique(
      excluded
        ? draft.request.location.excluded_districts
        : draft.request.location.preferred_districts,
      district,
    );
    addCriterion(draft, {
      field: excluded
        ? "location.excluded_districts"
        : "location.preferred_districts",
      category: "location",
      operator: excluded ? "not_in" : "in",
      target: district,
      unit: null,
      priority: priority.value,
      weight:
        priority.value === "preferred" || priority.value === "avoid" ? 4 : null,
      source_span: clauseSourceSpan(rawText, match.index ?? 0),
      priority_confidence: priority.confidence,
    });
  }

  const microdistrictPattern = /микрорайон\s+([А-ЯЁA-Z][\p{L}\d-]*)/giu;
  for (const match of rawText.matchAll(microdistrictPattern)) {
    if (!match[1]) continue;
    pushUnique(draft.request.location.microdistricts!, match[1]);
    recordScalar(
      draft,
      rawText,
      match as RegExpExecArray,
      "location.microdistricts",
      match[1],
    );
  }

  const unknownCity =
    /город пока не (?:выбрали|выбран)|не зна(?:ю|ем),? в каком городе/iu.exec(
      rawText,
    );
  if (unknownCity) {
    draft.request.location.cities = [];
    draft.request.location.location_flexible = true;
    addUnknown(draft, {
      field: "location.city",
      reason: "not_specified",
      explanation: "Целевой город явно не выбран.",
      materiality: "high",
    });
  }
};

const propertyTypes: Array<[PropertyType, RegExp]> = [
  ["apartments", /апартамент\p{L}*/giu],
  ["apartment", /квартир\p{L}*/giu],
  ["townhouse", /таунхаус\p{L}*/giu],
  ["house", /дом(?:а|ом|у)?/giu],
  ["land", /(?:земельный участок|участок земли)/giu],
];

const extractProperty = (draft: ParserDraft, rawText: string): void => {
  for (const [type, pattern] of propertyTypes) {
    for (const match of rawText.matchAll(pattern)) {
      const clause = clauseAt(rawText, match.index ?? 0);
      const priority = classifyPriority(clause, "preferred");
      if (priority.value === "exclude") {
        pushUnique(draft.request.property.excluded_property_types!, type);
      } else {
        pushUnique(draft.request.property.allowed_property_types, type);
      }
      recordScalar(
        draft,
        rawText,
        match as RegExpExecArray,
        priority.value === "exclude"
          ? "property.excluded_property_types"
          : "property.allowed_property_types",
        type,
        priority.value,
        priority.confidence,
      );
    }
  }
  if (
    /(?:квартир\p{L}*|дом\p{L}*)\s+или\s+(?:квартир\p{L}*|дом\p{L}*)/iu.test(
      rawText,
    )
  ) {
    draft.request.property.property_type_flexible = true;
  }
  const anyType =
    /(?:любой тип|тип не важен|всё равно квартира или дом)/iu.exec(rawText);
  if (anyType) {
    draft.request.property.property_type_flexible = true;
    recordScalar(
      draft,
      rawText,
      anyType,
      "property.property_type_flexible",
      true,
      "neutral",
    );
  }
  const fullyFlexibleType = /(?:любой объект|тип недвижимости любой)/iu.exec(
    rawText,
  );
  if (fullyFlexibleType) {
    draft.request.property.allowed_property_types = [
      "apartment",
      "apartments",
      "house",
      "townhouse",
      "land",
    ];
    draft.request.property.property_type_flexible = true;
    recordScalar(
      draft,
      rawText,
      fullyFlexibleType,
      "property.allowed_property_types",
      draft.request.property.allowed_property_types,
      "neutral",
    );
  }

  const marketPatterns: Array<
    [UserRequest["property"]["allowed_market_types"][number], RegExp]
  > = [
    ["new_build", /(?:новостройк|новый дом)\p{L}*/giu],
    ["secondary", /(?:вторичк|вторичное жиль[её])\p{L}*/giu],
    ["suburban", /загородн\p{L}*/giu],
  ];
  for (const [marketType, pattern] of marketPatterns) {
    for (const match of rawText.matchAll(pattern)) {
      pushUnique(draft.request.property.allowed_market_types, marketType);
      recordScalar(
        draft,
        rawText,
        match as RegExpExecArray,
        "property.allowed_market_types",
        marketType,
        classifyPriority(clauseAt(rawText, match.index ?? 0)).value,
      );
    }
  }
};

const numericAmount = (amount: string, unit: string): number | null => {
  const value = parseNumericToken(amount);
  return value === null ? null : scaleAmount(value, unit);
};

const moneyToken =
  "(\\d+(?:[.,]\\d+)?|один|одна|два|две|три|четыре|пять|пяти|шесть|шести|семь|восемь|девять|десять)";
const moneyUnit = "(млн\\.?|миллион(?:а|ов)?|тыс\\.?|тысяч(?:а|и)?)";

const extractBudget = (draft: ParserDraft, rawText: string): void => {
  const ownFunds = new RegExp(
    `${moneyToken}\\s*${moneyUnit}\\s*(?:своих|собственных)`,
    "iu",
  ).exec(rawText);
  if (ownFunds?.[1] && ownFunds[2]) {
    const amount = numericAmount(ownFunds[1], ownFunds[2]);
    if (amount !== null) {
      draft.request.budget.own_funds = money(amount);
      recordScalar(
        draft,
        rawText,
        ownFunds,
        "budget.own_funds",
        money(amount),
        "must",
      );
    }
  }

  const totalBudget = new RegExp(
    `(?:на вс[её]|всего)\\s+(?:есть\\s+)?${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (totalBudget?.[1] && totalBudget[2]) {
    const amount = numericAmount(totalBudget[1], totalBudget[2]);
    if (amount !== null) {
      draft.request.budget.total_budget = money(amount);
      draft.request.budget.budget_context = /включая ремонт/iu.test(rawText)
        ? "total_entry"
        : "ambiguous";
      recordScalar(
        draft,
        rawText,
        totalBudget,
        "budget.total_budget",
        money(amount),
        "must",
      );
      if (draft.request.budget.budget_context === "ambiguous") {
        addUnknown(draft, {
          field: "budget.context",
          reason: "ambiguous",
          explanation:
            "Неясно, включает ли общая сумма ремонт и сопутствующие расходы.",
          materiality: "high",
        });
      }
    }
  }

  const priceMaximum = new RegExp(
    `(?:до|не больше|максимум)\\s+${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (
    priceMaximum?.[1] &&
    priceMaximum[2] &&
    !/(?:плат[её]ж|первоначальн\p{L}* взнос|ремонт|резерв|своих|собственных)/iu.test(
      commaSegmentAt(rawText, priceMaximum.index),
    )
  ) {
    const amount = numericAmount(priceMaximum[1], priceMaximum[2]);
    if (amount !== null && !totalBudget) {
      const span = matchSpan(rawText, priceMaximum);
      const priority: ClassifiedPriority = {
        value: "must",
        confidence: 0.99,
      };
      draft.request.budget.purchase_price.maximum = money(amount);
      draft.request.budget.budget_context = "property_price";
      addCriterion(draft, {
        field: "budget.purchase_price.maximum",
        category: "finance",
        operator: "lte",
        target: amount,
        unit: "RUB",
        priority: priority.value,
        weight: priority.value === "preferred" ? 5 : null,
        source_span: span,
        priority_confidence: priority.confidence,
      });
    }
  }

  const priceMinimum = new RegExp(
    `(?:от|не меньше|минимум)\\s+${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (priceMinimum?.[1] && priceMinimum[2]) {
    const amount = numericAmount(priceMinimum[1], priceMinimum[2]);
    if (
      amount !== null &&
      !/(?:метр|первоначальн\p{L}* взнос|ремонт|резерв|своих|собственных)/iu.test(
        commaSegmentAt(rawText, priceMinimum.index),
      )
    ) {
      const priority = classifyPriority(
        clauseAt(rawText, priceMinimum.index),
        "must",
      );
      draft.request.budget.purchase_price.minimum = money(amount);
      addCriterion(draft, {
        field: "budget.purchase_price.minimum",
        category: "finance",
        operator: "gte",
        target: amount,
        unit: "RUB",
        priority: priority.value,
        weight: priority.value === "preferred" ? 5 : null,
        source_span: matchSpan(rawText, priceMinimum),
        priority_confidence: priority.confidence,
      });
    }
  }

  const renovation = new RegExp(
    `(?:на ремонт|ремонт)\\s+(?:до|не больше|примерно|около)?\\s*${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (renovation?.[1] && renovation[2]) {
    const amount = numericAmount(renovation[1], renovation[2]);
    if (amount !== null) {
      draft.request.budget.renovation_budget = money(amount);
      recordScalar(
        draft,
        rawText,
        renovation,
        "budget.renovation_budget",
        money(amount),
      );
    }
  }

  const reserve = new RegExp(
    `(?:оставить|резерв)\\s+(?:минимум|не меньше)?\\s*${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (reserve?.[1] && reserve[2]) {
    const amount = numericAmount(reserve[1], reserve[2]);
    if (amount !== null) {
      draft.request.budget.reserve_after_purchase = money(amount);
      recordScalar(
        draft,
        rawText,
        reserve,
        "budget.reserve_after_purchase",
        money(amount),
      );
    }
  }
  const budgetFlexible =
    /(?:бюджет гибкий|бюджет можно (?:немного )?увеличить)/iu.exec(rawText);
  if (budgetFlexible) {
    draft.request.budget.budget_flexible = true;
    recordScalar(
      draft,
      rawText,
      budgetFlexible,
      "budget.budget_flexible",
      true,
      "neutral",
    );
  }
};

const extractFinancing = (draft: ParserDraft, rawText: string): void => {
  const mortgage = /ипотек\p{L}*/iu.exec(rawText);
  if (mortgage) {
    draft.request.financing.purchase_methods = ["mortgage"];
    recordScalar(
      draft,
      rawText,
      mortgage,
      "financing.purchase_methods",
      "mortgage",
    );
  }
  const installment = /рассрочк\p{L}*/iu.exec(rawText);
  if (installment) {
    draft.request.financing.purchase_methods = ["installment"];
    recordScalar(
      draft,
      rawText,
      installment,
      "financing.purchase_methods",
      "installment",
    );
  }
  const cash = /(?:за наличные|без кредита)/iu.exec(rawText);
  if (cash) {
    draft.request.financing.purchase_methods = ["cash"];
    recordScalar(draft, rawText, cash, "financing.purchase_methods", "cash");
  }

  const familyMortgage = /семейн\p{L}*\s+ипотек\p{L}*/iu.exec(rawText);
  if (familyMortgage) {
    pushUnique(
      draft.request.financing.required_program_types,
      "family_mortgage",
    );
    const priority = classifyPriority(
      commaSegmentAt(rawText, familyMortgage.index),
      "preferred",
    );
    addCriterion(draft, {
      field: "financing.program_type",
      category: "finance",
      operator: "eq",
      target: "family_mortgage",
      unit: null,
      priority: priority.value,
      weight: priority.value === "preferred" ? 5 : null,
      source_span: matchSpan(rawText, familyMortgage),
      priority_confidence: priority.confidence,
    });
  }

  const zeroDown = /без\s+(?:первоначального\s+взноса|пв)/iu.exec(rawText);
  if (zeroDown) {
    const priority = classifyPriority(
      clauseAt(rawText, zeroDown.index),
      "preferred",
    );
    addCriterion(draft, {
      field: "financing.zero_initial_payment",
      category: "finance",
      operator: "boolean",
      target: true,
      unit: null,
      priority: priority.value,
      weight: priority.value === "preferred" ? 5 : null,
      source_span: matchSpan(rawText, zeroDown),
      priority_confidence: priority.confidence,
    });
  }

  const payment = new RegExp(
    `плат[её]ж(?:\\s+по ипотеке)?\\s*(?:не больше|максимум|до|около|примерно)?\\s*${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (payment?.[1] && payment[2]) {
    const amount = numericAmount(payment[1], payment[2]);
    if (amount !== null) {
      const priority = classifyPriority(
        clauseAt(rawText, payment.index),
        "must",
      );
      draft.request.financing.monthly_payment_max = money(amount);
      addCriterion(draft, {
        field: "financing.monthly_payment_max",
        category: "finance",
        operator: "lte",
        target: amount,
        unit: "RUB/month",
        priority: priority.value,
        weight: priority.value === "preferred" ? 5 : null,
        source_span: matchSpan(rawText, payment),
        priority_confidence: priority.confidence,
      });
    }
  }

  const initialPayment = new RegExp(
    `(?:первоначальн\\p{L}* взнос|пв)\\s*(?:не больше|максимум|до|около)?\\s*${moneyToken}\\s*${moneyUnit}`,
    "iu",
  ).exec(rawText);
  if (initialPayment?.[1] && initialPayment[2]) {
    const amount = numericAmount(initialPayment[1], initialPayment[2]);
    if (amount !== null) {
      const priority = classifyPriority(
        commaSegmentAt(rawText, initialPayment.index),
        "must",
      );
      draft.request.financing.initial_payment_max = money(amount);
      addCriterion(draft, {
        field: "financing.initial_payment_max",
        category: "finance",
        operator: "lte",
        target: amount,
        unit: "RUB",
        priority: priority.value,
        weight: priority.value === "preferred" ? 5 : null,
        source_span: matchSpan(rawText, initialPayment),
        priority_confidence: priority.confidence,
      });
    }
  }

  const bankPattern = /(?:банк|в банке)\s+([А-ЯЁA-Z][\p{L}-]+)/giu;
  for (const match of rawText.matchAll(bankPattern)) {
    if (!match[1]) continue;
    pushUnique(draft.request.financing.preferred_banks!, match[1]);
    recordScalar(
      draft,
      rawText,
      match as RegExpExecArray,
      "financing.preferred_banks",
      match[1],
    );
  }
};

const extractTimeline = (
  draft: ParserDraft,
  rawText: string,
  input: UserRequestParserInput,
): void => {
  const moveIn =
    /въехать\s+(?:нужно\s+)?(?:максимум\s+)?через\s+(год|\d+\s+(?:год|года|лет))/iu.exec(
      rawText,
    );
  if (moveIn?.[1]) {
    const numeric = /\d+/.exec(moveIn[1]);
    const years = numeric ? Number(numeric[0]) : 1;
    const referenceDate = input.context?.reference_date;
    const deadline = referenceDate ? addYears(referenceDate, years) : null;
    draft.request.timeline.move_in_by = deadline;
    addCriterion(draft, {
      field: "timeline.move_in_by",
      category: "timeline",
      operator: "before",
      target: deadline ?? { relative_years: years },
      unit: deadline ? null : "years_from_request",
      priority: "must",
      weight: null,
      source_span: matchSpan(rawText, moveIn),
      priority_confidence: 0.99,
    });
    if (!referenceDate) {
      draft.warnings.push({
        code: "relative_date_without_reference",
        message: "Срок сохранён как относительный: reference_date не передан.",
        field: "timeline.move_in_by",
      });
    }
  }

  const ready =
    /(?:готов(?:ое|ая) жиль[её]|въехать сразу|готово сейчас)/iu.exec(rawText);
  if (ready) {
    draft.request.timeline.ready_now_required = true;
    recordScalar(
      draft,
      rawText,
      ready,
      "timeline.ready_now_required",
      true,
      "must",
    );
  }
  const willingToWait = /готов(?:ы|а)? ждать/iu.exec(rawText);
  if (willingToWait) {
    draft.request.timeline.willing_to_wait = true;
    recordScalar(
      draft,
      rawText,
      willingToWait,
      "timeline.willing_to_wait",
      true,
      "neutral",
    );
  }

  const purchaseYear =
    /(?:купить|покупка)\s+(?:нужно\s+)?до конца\s+(20\d{2})\s+года/iu.exec(
      rawText,
    );
  if (purchaseYear?.[1]) {
    draft.request.timeline.purchase_by = `${purchaseYear[1]}-12-31`;
    recordScalar(
      draft,
      rawText,
      purchaseYear,
      "timeline.purchase_by",
      draft.request.timeline.purchase_by,
      "must",
    );
  }

  const moveInYear =
    /въехать\s+(?:нужно\s+)?до конца\s+(20\d{2})\s+года/iu.exec(rawText);
  if (moveInYear?.[1]) {
    draft.request.timeline.move_in_by = `${moveInYear[1]}-12-31`;
    recordScalar(
      draft,
      rawText,
      moveInYear,
      "timeline.move_in_by",
      draft.request.timeline.move_in_by,
      "must",
    );
  }

  const completionYear =
    /(?:сдача|завершение строительства)\s+(?:не позже|до конца)\s+(20\d{2})\s+года/iu.exec(
      rawText,
    );
  if (completionYear?.[1]) {
    draft.request.timeline.construction_completion_by = `${completionYear[1]}-12-31`;
    recordScalar(
      draft,
      rawText,
      completionYear,
      "timeline.construction_completion_by",
      draft.request.timeline.construction_completion_by,
      "must",
    );
  }
};

const extractHousehold = (draft: ParserDraft, rawText: string): void => {
  const children =
    /(один|одна|двое|два|две|трое|три|четверо|четыре|\d+)\s+(?:реб[её]нок|детей|реб[её]нка)/iu.exec(
      rawText,
    );
  if (children?.[1]) {
    const forms: Record<string, number> = { двое: 2, трое: 3, четверо: 4 };
    const count =
      forms[children[1].toLowerCase()] ?? parseNumericToken(children[1]);
    if (count !== null) {
      draft.request.household.children_count = count;
      recordScalar(draft, rawText, children, "household.children_count", count);
    }
  }
  const adults = /(один|одна|двое|два|две|трое|три|\d+)\s+взросл\p{L}*/iu.exec(
    rawText,
  );
  if (adults?.[1]) {
    const forms: Record<string, number> = { двое: 2, трое: 3 };
    const count =
      forms[adults[1].toLowerCase()] ?? parseNumericToken(adults[1]);
    if (count !== null) {
      draft.request.household.adults_count = count;
      recordScalar(draft, rawText, adults, "household.adults_count", count);
    }
  }
  const ages =
    /дет(?:и|ям|ей)[,:]?\s*(\d{1,2})(?:\s*(?:и|,)\s*(\d{1,2}))?\s*лет/iu.exec(
      rawText,
    );
  if (ages?.[1]) {
    draft.request.household.children_ages = [Number(ages[1])];
    if (ages[2]) draft.request.household.children_ages.push(Number(ages[2]));
    recordScalar(
      draft,
      rawText,
      ages,
      "household.children_ages",
      draft.request.household.children_ages,
    );
  }
  const elderly = /(один|одна|двое|два|две|\d+)\s+пожил\p{L}*/iu.exec(rawText);
  if (elderly?.[1]) {
    const count =
      elderly[1].toLowerCase() === "двое" ? 2 : parseNumericToken(elderly[1]);
    if (count !== null) {
      draft.request.household.elderly_count = count;
      recordScalar(draft, rawText, elderly, "household.elderly_count", count);
    }
  }
  const pet = /(?:собак|кошк|питомц)\p{L}*/iu.exec(rawText);
  if (pet) {
    draft.request.household.pets_count = 1;
    recordScalar(draft, rawText, pet, "household.pets_count", 1);
  }
  const accessibility =
    /(?:безбарьерн|коляск|доступн\p{L}* для инвалид)\p{L}*/iu.exec(rawText);
  if (accessibility) {
    pushUnique(draft.request.household.accessibility_needs!, accessibility[0]);
    recordScalar(
      draft,
      rawText,
      accessibility,
      "household.accessibility_needs",
      accessibility[0],
    );
  }
};

const extractLifestyleAndInfrastructure = (
  draft: ParserDraft,
  rawText: string,
): void => {
  const remote = /(?:работаю удал[её]нно|удал[её]нная работа)/iu.exec(rawText);
  if (remote) {
    draft.request.lifestyle.remote_work = true;
    recordScalar(draft, rawText, remote, "lifestyle.remote_work", true);
  }
  const car = /(одна|один|два|две|\d+)\s+(?:машин|автомобил)\p{L}*/iu.exec(
    rawText,
  );
  if (car?.[1]) {
    const count = parseNumericToken(car[1]);
    if (count !== null) {
      draft.request.lifestyle.car_count = count;
      pushUnique(draft.request.lifestyle.commute_modes, "car");
      recordScalar(draft, rawText, car, "lifestyle.car_count", count);
    }
  }
  const publicTransport =
    /(?:общественн\p{L}* транспорт|метро(?!\p{L})|автобус)/iu.exec(rawText);
  if (publicTransport) {
    pushUnique(draft.request.lifestyle.commute_modes, "public_transport");
    recordScalar(
      draft,
      rawText,
      publicTransport,
      "lifestyle.commute_modes",
      "public_transport",
    );
  }
  for (const [field, pattern] of [
    ["lifestyle.quiet", /(?:тихо|тихий район|тишина)/iu],
    ["lifestyle.green_area", /(?:зел[её]ный район|много зелени)/iu],
    ["lifestyle.walkability", /(?:всё пешком|пешая доступность)/iu],
  ] as const) {
    const match = pattern.exec(rawText);
    if (match) {
      pushUnique(draft.request.lifestyle.notes, match[0]);
      recordScalar(
        draft,
        rawText,
        match,
        field,
        true,
        classifyPriority(clauseAt(rawText, match.index)).value,
      );
    }
  }

  const commute =
    /(?:до работы|дорога до офиса)\s+(?:не больше|максимум|до)\s+(\d+)\s*минут/iu.exec(
      rawText,
    );
  if (commute?.[1]) {
    const minutes = Number(commute[1]);
    addCriterion(draft, {
      field: "lifestyle.commute_time_max",
      category: "location",
      operator: "within_time",
      target: minutes,
      unit: "minutes",
      priority: "must",
      weight: null,
      source_span: matchSpan(rawText, commute),
      priority_confidence: 0.98,
    });
    addUnknown(draft, {
      field: "location.travel_destination",
      reason: "dependent_value_missing",
      explanation:
        "Не указан адрес работы, относительно которого считать время в пути.",
      materiality: "critical",
    });
  }

  const infrastructure: Array<[string, RegExp]> = [
    ["school", /школ\p{L}*/giu],
    ["kindergarten", /детск\p{L}* сад\p{L}*/giu],
    ["park", /парк\p{L}*/giu],
    ["clinic", /(?:поликлиник|клиник)\p{L}*/giu],
    ["transport", /(?:метро(?!\p{L})|остановк\p{L}*|транспорт\p{L}*)/giu],
  ];
  for (const [name, pattern] of infrastructure) {
    for (const match of rawText.matchAll(pattern)) {
      const clause = clauseAt(rawText, match.index ?? 0);
      const fuzzy = /(?:рядом|недалеко|хорошая доступность)/iu.exec(clause);
      const explicitTime = /(\d+)\s*минут/iu.exec(clause);
      const explicitDistance =
        /(\d+(?:[.,]\d+)?)\s*(км|метр\p{L}*|м(?!\p{L}))/iu.exec(clause);
      const mode = /пешком/iu.test(clause)
        ? "walk"
        : /(?:на машине|автомобил)/iu.test(clause)
          ? "car"
          : /(?:общественн\p{L}* транспорт|автобус|метро(?!\p{L}))/iu.test(
                clause,
              )
            ? "public_transport"
            : "unspecified";
      if (!fuzzy && name === "transport" && /общественн/iu.test(clause))
        continue;
      const priority = /важно/iu.test(clause)
        ? ({ value: "preferred", confidence: 0.92 } as const)
        : classifyPriority(clause, "preferred");
      const criterion = addCriterion(draft, {
        field: `infrastructure.${name}_proximity`,
        category: "infrastructure",
        operator: explicitTime
          ? "within_time"
          : explicitDistance
            ? "within_distance"
            : "custom",
        target: explicitTime?.[1]
          ? { maximum: Number(explicitTime[1]), mode }
          : explicitDistance?.[1] && explicitDistance[2]
            ? {
                maximum: Number(explicitDistance[1].replace(",", ".")),
                mode,
              }
            : fuzzy
              ? "nearby"
              : "available",
        unit: explicitTime
          ? "minutes"
          : explicitDistance?.[2]?.toLowerCase() === "км"
            ? "km"
            : explicitDistance
              ? "m"
              : null,
        priority: priority.value,
        weight: /важно/iu.test(clause) ? 5 : 3,
        source_span: clauseSourceSpan(rawText, match.index ?? 0),
        priority_confidence: priority.confidence,
      });
      if (fuzzy && !explicitTime && !explicitDistance) {
        addUnknown(draft, {
          field: `infrastructure.${name}_proximity`,
          reason: "ambiguous",
          explanation: `Формулировка «${fuzzy[0]}» не задаёт расстояние или время.`,
          materiality: name === "school" ? "high" : "medium",
        });
      }
      if (
        name === "school" &&
        draft.request.household.children_count !== null
      ) {
        addInferredCandidate(draft, {
          proposed_criterion: {
            field: criterion.field,
            category: criterion.category,
            target: criterion.target,
            priority: criterion.priority,
          },
          reason:
            "Школа явно упомянута вместе с детьми; пригодность конкретной школы не выводится.",
          source_text: clause,
          confidence: 0.9,
        });
      }
    }
  }
};

const extractPropertyFeatures = (draft: ParserDraft, rawText: string): void => {
  const area =
    /(?:площадь\s+)?(?:не меньше|минимум|от)\s+(\d+(?:[.,]\d+)?)\s*(?:м(?:2|²)|кв\.?\s*м|метр\p{L}*)/iu.exec(
      rawText,
    );
  if (area?.[1]) {
    addCriterion(draft, {
      field: "property.area_sqm",
      category: "property",
      operator: "gte",
      target: Number(area[1].replace(",", ".")),
      unit: "sqm",
      priority: "must",
      weight: null,
      source_span: matchSpan(rawText, area),
      priority_confidence: 0.98,
      applicable_property_types: [
        "apartment",
        "apartments",
        "house",
        "townhouse",
      ],
    });
  }

  const rooms =
    /(?:не меньше|минимум|от)?\s*(\d+)\s*[- ]?(?:комнатн\p{L}*|комнат\p{L}*)/iu.exec(
      rawText,
    );
  if (rooms?.[1]) {
    const value = Number(rooms[1]);
    const minimum = /не меньше|минимум|от/iu.test(rooms[0]);
    draft.request.property.rooms_min = value;
    if (!minimum) draft.request.property.rooms_max = value;
    addCriterion(draft, {
      field: minimum ? "property.rooms_min" : "property.rooms",
      category: "property",
      operator: minimum ? "gte" : "eq",
      target: value,
      unit: "rooms",
      priority: minimum ? "must" : "preferred",
      weight: minimum ? null : 4,
      source_span: matchSpan(rawText, rooms),
      priority_confidence: minimum ? 0.98 : 0.8,
      applicable_property_types: [
        "apartment",
        "apartments",
        "house",
        "townhouse",
      ],
    });
  }

  const floor = /(?:первый этаж|этаж вообще не важен|этаж не важен)/iu.exec(
    rawText,
  );
  if (floor) {
    const clause = clauseAt(rawText, floor.index);
    const priority = classifyPriority(clause, "preferred");
    addCriterion(draft, {
      field: "property.floor.is_first",
      category: "property",
      operator: "boolean",
      target: priority.value === "neutral" ? "any" : false,
      unit: null,
      priority: priority.value,
      weight:
        priority.value === "avoid" || priority.value === "preferred" ? 4 : null,
      source_span: clauseSourceSpan(rawText, floor.index),
      priority_confidence: priority.confidence,
      applicable_property_types: ["apartment", "apartments"],
    });
  }

  const lastFloor = /последн\p{L}* этаж/iu.exec(rawText);
  if (lastFloor) {
    const priority = classifyPriority(
      clauseAt(rawText, lastFloor.index),
      "preferred",
    );
    addCriterion(draft, {
      field: "property.floor.is_last",
      category: "property",
      operator: "boolean",
      target: priority.value === "neutral" ? "any" : false,
      unit: null,
      priority: priority.value,
      weight: priority.value === "avoid" ? 4 : null,
      source_span: clauseSourceSpan(rawText, lastFloor.index),
      priority_confidence: priority.confidence,
      applicable_property_types: ["apartment", "apartments"],
    });
  }

  const landArea =
    /(?:участок|земля)\s+(?:не меньше|минимум|от)\s+(\d+(?:[.,]\d+)?)\s*сот\p{L}*/iu.exec(
      rawText,
    );
  if (landArea?.[1]) {
    addCriterion(draft, {
      field: "house.land_area",
      category: "house",
      operator: "gte",
      target: Number(landArea[1].replace(",", ".")),
      unit: "sotka",
      priority: "must",
      weight: null,
      source_span: matchSpan(rawText, landArea),
      priority_confidence: 0.98,
      applicable_property_types: ["house", "townhouse", "land"],
    });
  }

  const featurePatterns: Array<[string, RegExp]> = [
    ["property.finishing", /(?:с отделкой|без отделки|ремонт не нужен)/iu],
    ["property.balcony", /(?:балкон|лоджия)/iu],
    ["property.elevator", /лифт/iu],
    ["property.parking", /парковк\p{L}*/iu],
    ["house.utilities", /(?:газ|водопровод|канализация|коммуникации)/iu],
  ];
  for (const [field, pattern] of featurePatterns) {
    const match = pattern.exec(rawText);
    if (!match) continue;
    const priority = classifyPriority(
      clauseAt(rawText, match.index),
      "preferred",
    );
    addCriterion(draft, {
      field,
      category: field.startsWith("house.") ? "house" : "property",
      operator: "exists",
      target: match[0],
      unit: null,
      priority: priority.value,
      weight:
        priority.value === "preferred" || priority.value === "avoid" ? 3 : null,
      source_span: matchSpan(rawText, match),
      priority_confidence: priority.confidence,
      applicable_property_types:
        field === "property.elevator"
          ? ["apartment", "apartments"]
          : field.startsWith("house.")
            ? ["house", "townhouse"]
            : ["apartment", "apartments", "house", "townhouse"],
    });
  }
};

const extractSourceLinks = (draft: ParserDraft, rawText: string): void => {
  const urls = (rawText.match(/https?:\/\/[^\s,]+/gu) ?? []).map((url) =>
    url.replace(/[.;!?]+$/u, ""),
  );
  draft.request.source_links = [...new Set(urls)];
  for (const url of draft.request.source_links) {
    const start = rawText.indexOf(url);
    addExtractedFact(
      draft,
      "source_links",
      url,
      sourceSpan(rawText, start, start + url.length),
      1,
    );
  }
  if (/(?:три|3) варианта/iu.test(rawText) && urls.length === 0) {
    addUnknown(draft, {
      field: "source_links",
      reason: "dependent_value_missing",
      explanation:
        "Для сравнения упомянутых вариантов нужны ссылки или идентификаторы.",
      materiality: "critical",
    });
  }
};

export const extractRuleBasedDraft = (
  draft: ParserDraft,
  input: UserRequestParserInput,
): ParserDraft => {
  const rawText = input.raw_text;
  extractIntentAndGoal(draft, rawText);
  extractResultLimit(draft, rawText);
  extractLocation(draft, rawText);
  extractProperty(draft, rawText);
  extractBudget(draft, rawText);
  extractFinancing(draft, rawText);
  extractTimeline(draft, rawText, input);
  extractHousehold(draft, rawText);
  extractLifestyleAndInfrastructure(draft, rawText);
  extractPropertyFeatures(draft, rawText);
  extractSourceLinks(draft, rawText);

  if (draft.extracted_facts.length === 0) {
    draft.warnings.push({
      code: stableId("warning", "no_explicit_fields", rawText),
      message: "Не удалось уверенно выделить структурированные поля.",
      field: null,
    });
  }
  return draft;
};
