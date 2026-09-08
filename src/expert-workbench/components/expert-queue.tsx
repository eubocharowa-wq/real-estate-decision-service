import Link from "next/link";

import type { ExpertQueueViewModel } from "../contracts";
import {
  expertRequestTypeLabels,
  priorityLabels,
  specialistTypeLabels,
  workflowStatusLabels,
} from "../labels";

export function ExpertQueue({ view }: { readonly view: ExpertQueueViewModel }) {
  return (
    <main className="expert-queue-shell">
      <header className="expert-queue-header">
        <Link href="/" className="brand-mark" aria-label="На главную">
          Основание <span>/ expert</span>
        </Link>
        <p className="eyebrow">Рабочая очередь</p>
        <h1>Экспертные задачи</h1>
        <p>
          Порядок определяется срочностью и временем отправки. Коммерческие
          факторы не используются.
        </p>
      </header>
      {view.items.length === 0 ? (
        <section className="expert-empty" role="status">
          <h2>Доступных активных задач нет</h2>
          <p>Задачи другого типа специалиста остаются недоступны.</p>
        </section>
      ) : (
        <ol className="expert-queue-list" aria-label="Активные задачи">
          {view.items.map(
            ({ request, submittedAt, shortQuestion, contextLabel }) => (
              <li key={request.request_id}>
                <article
                  className={`expert-queue-card priority-${request.priority}`}
                >
                  <div className="expert-queue-card-meta">
                    <span>{priorityLabels[request.priority]}</span>
                    <span>{workflowStatusLabels[request.status]}</span>
                  </div>
                  <h2>{expertRequestTypeLabels[request.request_type]}</h2>
                  <p className="expert-queue-question">{shortQuestion}</p>
                  <dl>
                    <div>
                      <dt>Request ID</dt>
                      <dd>{request.request_id}</dd>
                    </div>
                    <div>
                      <dt>Контекст</dt>
                      <dd>{contextLabel}</dd>
                    </div>
                    <div>
                      <dt>Специалист</dt>
                      <dd>
                        {specialistTypeLabels[request.required_specialist]}
                      </dd>
                    </div>
                    <div>
                      <dt>Создано</dt>
                      <dd>
                        {new Date(request.created_at).toLocaleString("ru-RU")}
                      </dd>
                    </div>
                    <div>
                      <dt>Отправлено</dt>
                      <dd>{new Date(submittedAt).toLocaleString("ru-RU")}</dd>
                    </div>
                    <div>
                      <dt>Назначен</dt>
                      <dd>
                        {request.assigned_specialist_ref ?? "Пока не назначен"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="button button-primary button-small"
                    href={`/expert/requests/${request.request_id}`}
                  >
                    Открыть задачу
                  </Link>
                </article>
              </li>
            ),
          )}
        </ol>
      )}
    </main>
  );
}
