# TASK-001 — Repository Scaffold

## Status

`ready`

## Priority

`P0`

## Milestone

`Milestone A — Clickable Product`

---

# 1. Goal

Создать минимальный рабочий application scaffold для Real Estate Decision Service, который:

- открывается в VS Code;
- запускается локально;
- проходит lint/test/build;
- готов для дальнейших TASK;
- не содержит продуктовой логики, не описанной в спецификации.

---

# 2. Required Reading

Перед выполнением:

```text
PROJECT.md
AGENTS.md
README.md
docs/08-roadmap/implementation-plan.md
docs/08-roadmap/backlog.md
```

---

# 3. In Scope

Создать базовое приложение:

```text
app/
```

на:

```text
Next.js
React
TypeScript
```

с минимальной конфигурацией разработки.

---

# 4. Required Technical Setup

Минимум:

- Next.js;
- TypeScript;
- strict mode;
- package manager lockfile;
- ESLint;
- formatter;
- test runner;
- `.gitignore`;
- `.env.example`;
- базовая CI-ready command structure.

---

# 5. Application Structure

На этом этапе не нужно проектировать всё приложение.

Минимальная структура может включать:

```text
app/
src/
tests/
```

или эквивалентную idiomatic Next.js структуру.

Coding-agent должен выбрать стандартную структуру и не создавать избыточную архитектуру.

---

# 6. Home Page

Создать минимальную страницу, подтверждающую работоспособность scaffold.

Текст:

```text
Real Estate Decision Service
```

и короткая рабочая фраза:

```text
Помогаем выбрать недвижимость под ваши условия.
```

Это временный технический экран.

Не проектировать полноценный landing в этой TASK.

---

# 7. Environment

Создать:

```text
.env.example
```

Без реальных secrets.

Можно предусмотреть placeholders:

```text
DATABASE_URL=
OPENAI_API_KEY=
```

Но не подключать реальные сервисы в этой задаче.

---

# 8. Scripts

`package.json` должен иметь понятные команды:

```text
dev
build
lint
test
typecheck
```

Если framework автоматически объединяет часть команд, сохранить максимально близкую структуру.

---

# 9. Tests

Минимальный smoke test:

- приложение/основной компонент импортируется;
- базовая страница рендерится;
- test command завершается успешно.

---

# 10. CI

Допустимо добавить минимальный GitHub Actions workflow:

```text
install
typecheck
lint
test
build
```

Если это не усложняет scaffold.

---

# 11. Out of Scope

Не делать в TASK-001:

- database schema;
- Supabase;
- authentication;
- OpenAI integration;
- OpenClaw;
- source adapters;
- real estate UI;
- matching;
- request parsing;
- property cards;
- expert services.

---

# 12. Product Guardrails

Не:

- hardcode Tula;
- добавлять catalog pages;
- добавлять fake listings;
- добавлять готовый AI chat;
- создавать неподтверждённые product features.

---

# 13. Expected Output

После TASK repository должен содержать рабочий app scaffold.

Пример:

```text
real-estate-decision-service/
├── PROJECT.md
├── AGENTS.md
├── README.md
├── docs/
├── tasks/
├── app/
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
└── ...
```

Конкретное расположение Next.js файлов может отличаться, если оно соответствует стандартам framework.

---

# 14. Acceptance Criteria

TASK завершена только если:

- `npm install` / выбранный package manager работает;
- dev server запускается;
- home page открывается;
- TypeScript strict включён;
- `typecheck` проходит;
- `lint` проходит;
- `test` проходит;
- `build` проходит;
- `.env.example` не содержит secrets;
- project docs не удалены и не изменены без необходимости;
- pilot geography нигде не hardcoded.

---

# 15. Verification Commands

Coding-agent должен выполнить и сообщить результаты:

```text
<package-manager> typecheck
<package-manager> lint
<package-manager> test
<package-manager> build
```

---

# 16. Deliverable Report

После реализации сообщить:

```text
Implemented:
Files changed:
Tests:
Build:
Known limitations:
Spec deviations:
```

---

# 17. Do Not Continue Automatically

После успешного выполнения TASK-001:

**не начинать TASK-002 самостоятельно.**

Следующая задача будет выдана отдельно.

---

# 18. Definition of Done

TASK-001 считается Done, когда существует чистый, воспроизводимый, тестируемый repository scaffold, на который можно безопасно накладывать domain schemas и UI следующих задач.
