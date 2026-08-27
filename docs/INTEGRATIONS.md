# INTEGRATIONS.md

## 1. Цель

Integration Layer нужен для подключения внешних сервисов к платформе без жёсткой привязки Platform Core к конкретному провайдеру.

Платформа не заменяет внешние сервисы, а получает от них нормализованные данные для:

* Project Health;
* Developer Control Panel;
* Multi-project Dashboard;
* audit;
* диагностики состояния проекта.

Главный принцип:

> Platform Core работает с внутренними моделями данных, а особенности API конкретного провайдера скрыты внутри provider adapter.

---

## 2. Базовый набор интеграций MVP

В обязательной последовательности первой версии:

* GitHub;
* Vercel;
* Sentry;

Supabase подключается по возможности, если безопасно получать полезные технические
данные. Поддержка `AnalyticsProvider` сохраняется архитектурно, но PostHog — optional /
later и не является блокером Internal MVP.

При необходимости позже могут появиться:

* GitLab;
* Netlify;
* Cloudflare;
* Render;
* Railway;
* Neon;
* Firebase;
* другие providers.

Но MVP не обязан поддерживать их.

---

## 3. Общая схема

```text
External Service
↓
Provider Adapter
↓
Normalized Platform Model
↓
Platform Database
↓
Developer Dashboard / Project Health
```

Пример:

```text
Vercel API
↓
VercelProvider
↓
DeploymentStatus
↓
Platform DB
↓
Project Health
```

---

## 4. Provider Categories

Внутри платформы желательно использовать не названия конкретных сервисов, а категории providers.

```text
SourceControlProvider
DeploymentProvider
DatabaseProvider
StorageProvider
MonitoringProvider
AnalyticsProvider
```

Первая реализация:

```text
SourceControlProvider
→ GitHubProvider

DeploymentProvider
→ VercelProvider

DatabaseProvider
→ SupabaseProvider

StorageProvider
→ SupabaseProvider

MonitoringProvider
→ SentryProvider

AnalyticsProvider
→ PostHogProvider
```

---

## 5. Общая модель Integration

Каждое подключение хранится как отдельная сущность.

Минимальные поля:

```text
id
organization_id
project_id

provider_type
provider_name

external_account_id
external_project_id

status

created_at
updated_at
last_synced_at
last_error_at
```

Credentials хранятся отдельно от обычных metadata.

---

## 6. Integration Status

Нормализованные статусы:

```text
connected
degraded
disconnected
error
unknown
```

`connected` — интеграция работает нормально.

`degraded` — часть данных недоступна, но соединение существует.

`disconnected` — пользователь отключил интеграцию.

`error` — integration sync завершился ошибкой.

`unknown` — состояние ещё не определено.

---

## 7. GitHub Integration

### Цель

Получать базовую информацию о source repository проекта.

### MVP Data

```text
repository_name
repository_url
default_branch

latest_commit_sha
latest_commit_message
latest_commit_author
latest_commit_at
```

Дополнительно:

```text
repository_private
repository_archived
```

### Что показывает UI

Developer Control Panel может показывать:

```text
Repository: organization/project
Branch: main

Latest commit:
abc123
Fix portfolio upload
27 Aug 2026 13:42
```

### Permissions

Первая версия по возможности read-only.

Не нужно запрашивать права на:

* удаление repository;
* force push;
* изменение branch protection;
* управление collaborators.

### Будущее

Позже могут появиться:

* pull requests;
* CI status;
* branches;
* releases;
* GitHub Actions.

Но они не нужны для первого MVP.

---

## 8. Vercel Integration

### Цель

Получать состояние production deployments.

### MVP Data

```text
deployment_id
deployment_url

environment
status

created_at
ready_at

git_commit_sha
git_commit_message
```

Нормализованные deployment statuses:

```text
pending
building
success
failed
cancelled
unknown
```

### UI

Пример:

```text
Production
● Healthy

Latest deploy
27 Aug 2026 14:21

Commit
abc123
```

или:

```text
Production
● Critical

Latest deploy failed
```

### Project Health

Failed production deployment должен быть одним из health signals.

---

## 9. Supabase Integration

Нужно строго разделять:

```text
Platform Supabase
```

и:

```text
Connected Project Supabase
```

Platform Supabase является backend нашей системы.

Connected Project Supabase — внешний provider конкретного клиентского сайта.
Он не является альтернативным источником истины для контента Client CMS: canonical source
контента находится в Platform Database.

### MVP Data

Не нужно пытаться показывать всю БД.

Достаточно:

```text
connection_status
database_status
storage_status
last_successful_check
```

При возможности:

```text
database_size
storage_usage
```

но только если API позволяет это получать безопасно и без лишней сложности.

### Permissions

По возможности read-only.

Платформа не должна получать права:

* удалять таблицы;
* выполнять arbitrary SQL;
* изменять RLS;
* управлять пользователями проекта;

если это не требуется конкретной функцией.

---

## 10. Sentry Integration

### Цель

Получать технические сигналы об ошибках проекта.

### MVP Data

```text
unresolved_issue_count
critical_issue_count

last_issue_at
last_critical_issue_at
```

Для нескольких наиболее важных issues:

```text
issue_id
title
level
first_seen
last_seen
count
sentry_url
```

### UI

```text
Errors

2 critical
8 unresolved

Latest:
TypeError in checkout
5 min ago
```

Для глубокого анализа developer переходит в Sentry.

Мы не строим собственный полноценный error tracker.

---

## 11. PostHog Integration

PostHog является optional / later provider и не входит в обязательный build order MVP.

Отсутствие PostHog не должно влиять на остальные функции платформы.

### MVP Data

Можно ограничиться:

```text
last_event_at
sessions_7d
users_7d
```

или другим минимальным набором.

### Назначение

Основная задача — показать разработчику, что analytics:

* подключена;
* получает данные;
* не перестала внезапно работать.

Не обязательно сразу строить большой analytics dashboard.

---

## 12. Normalized Models

Platform Core не должен использовать raw responses provider APIs.

Например, внутренний deployment:

```text
DeploymentStatus {
  provider
  externalId
  environment
  status
  url
  commitSha
  createdAt
  completedAt
}
```

Внутренний monitoring summary:

```text
MonitoringSummary {
  status
  unresolvedCount
  criticalCount
  lastErrorAt
}
```

Внутренний repository summary:

```text
RepositorySummary {
  provider
  repositoryName
  repositoryUrl
  branch
  latestCommitSha
  latestCommitMessage
  latestCommitAt
}
```

---

## 13. Background Sync

Dashboard не должен выполнять десятки запросов к provider API при каждом открытии страницы.

Используем:

```text
Provider
↓
Scheduled Sync
↓
Normalized Data
↓
Platform DB
↓
Dashboard
```

Это позволяет:

* ускорить UI;
* уменьшить rate limit issues;
* хранить историю;
* переживать кратковременные сбои provider;
* рассчитывать health независимо от frontend request.

---

## 14. Sync Frequency

На MVP частота может быть простой.

Примерно:

```text
Project availability
→ каждые несколько минут

Deployment status
→ каждые несколько минут / webhook

Sentry
→ каждые несколько минут

GitHub
→ реже либо webhook

Analytics
→ значительно реже
```

Конкретные интервалы не фиксируются до реализации и тестирования нагрузки.

---

## 15. Webhooks

Если provider поддерживает webhooks, их стоит использовать для событий, где важна быстрая реакция.

Например:

```text
Vercel deployment completed
↓
webhook
↓
update deployment state
↓
recalculate Project Health
```

GitHub:

```text
push
↓
webhook
↓
update latest commit
```

Но polling всё равно может использоваться как fallback.

---

## 16. Integration Failure Isolation

Ошибка одного provider не должна ломать проект целиком.

Пример:

```text
GitHub       connected
Vercel       connected
Sentry       error
Supabase     connected
```

Project Health:

```text
warning
```

а не полный отказ dashboard.

---

## 17. Stale Data

Для каждой integration summary хранится:

```text
last_synced_at
```

Если данные слишком старые:

```text
status = stale
```

UI должен различать:

```text
provider сообщает ошибку
```

и:

```text
мы давно не смогли синхронизироваться
```

Это разные состояния.

---

## 18. Rate Limits

Каждый provider имеет свои ограничения.

Integration Layer должен:

* учитывать rate limits;
* использовать caching;
* избегать повторных одинаковых запросов;
* использовать backoff;
* не превращать provider outage в постоянный request storm.

---

## 19. Timeouts

Все внешние запросы должны иметь bounded timeout.

Нельзя допускать:

```text
Provider завис
↓
Server request висит бесконечно
↓
Dashboard зависает
```

При timeout возвращается controlled failure state.

---

## 20. Retries

Retry применяется только там, где операция безопасна для повторения.

Для read operations:

```text
retry with backoff
```

Для write operations в будущем требуется более осторожная idempotency strategy.

---

## 21. Credentials

Credentials интеграций не являются обычными project settings.

Они:

* хранятся отдельно;
* шифруются;
* никогда не отправляются клиенту;
* не отображаются полностью;
* не попадают в logs;
* не попадают в audit metadata;
* не попадают в Sentry/PostHog.

---

## 22. OAuth

Где возможно, предпочтителен OAuth вместо ручной вставки long-lived API tokens.

Flow:

```text
Developer
↓
Connect GitHub
↓
OAuth
↓
Provider grants limited scopes
↓
Platform stores secure credential
```

CLIENT не должен иметь возможность подключать технические provider integrations без отдельного permission.

---

## 23. Minimum Scopes

Каждая integration должна запрашивать минимально необходимые права.

Принцип:

```text
если нужна только информация
→ не просим write
```

MVP integrations преимущественно read-only.

---

## 24. Revoke / Disconnect

Пользователь с `integrations.manage` должен иметь возможность отключить provider.

После disconnect:

* credential удаляется или инвалидируется;
* integration становится `disconnected`;
* historical normalized data может сохраняться;
* новые sync jobs прекращаются.

---

## 25. Integration Audit Events

Фиксируем:

```text
integration.connect
integration.disconnect
integration.sync_failed
integration.credentials_rotated
```

Не записываем сам credential.

---

## 26. Project Health Integration

Integrations являются источниками health signals.

Пример:

```text
Vercel
→ production deploy failed

Sentry
→ critical errors

Supabase
→ database unavailable
```

Project Health агрегирует эти сигналы.

Не integration решает итоговое состояние проекта.

Итоговый health рассчитывает Platform Core.

---

## 27. Provider Adapter Contract

Каждый provider должен реализовывать понятный внутренний contract.

Например:

```text
connect()
disconnect()

validateConnection()

sync()

getSummary()
```

Дополнительные методы зависят от категории provider.

---

## 28. Source Control Provider

Пример:

```text
getRepository()
getLatestCommit()
```

---

## 29. Deployment Provider

Пример:

```text
getProductionDeployment()
getLatestDeployment()
getDeploymentStatus()
```

---

## 30. Monitoring Provider

Пример:

```text
getMonitoringSummary()
getCriticalIssues()
```

---

## 31. Analytics Provider

Пример:

```text
getAnalyticsSummary()
getLastEventTime()
```

---

## 32. Database Provider

Пример:

```text
getConnectionStatus()
getDatabaseStatus()
getStorageStatus()
```

---

## 33. Provider-specific Logic

Provider-specific код должен находиться отдельно.

Пример структуры:

```text
lib/
  integrations/
    github/
    vercel/
    sentry/
    supabase/
    posthog/
```

Platform Core не должен импортировать provider-specific SDK напрямую во всех своих слоях.

---

## 34. Adding a New Provider

Добавление нового provider должно выглядеть примерно так:

```text
Implement adapter
↓
map external API to normalized model
↓
register provider
↓
add UI connection flow
```

а не:

```text
переписать dashboard
переписать health
переписать project model
```

---

## 35. Integration UI

В project settings:

```text
Integrations

GitHub
● Connected

Vercel
● Connected

Sentry
● Connected

Supabase
● Connected

PostHog
○ Not connected
```

Developer может:

* подключить;
* проверить connection;
* отключить;
* увидеть last sync;
* увидеть ошибку.

CLIENT по умолчанию этого раздела не видит.

---

## 36. Integration Health

Нужно различать:

```text
Project Health
```

и:

```text
Integration Health
```

Пример:

```text
Website healthy

Sentry integration temporarily unavailable
```

Это не обязательно означает, что клиентский сайт сломан.

---

## 37. MVP Limitations

На первой версии:

* один provider одного типа на проект;
* ограниченный набор данных;
* преимущественно read-only;
* без сложных write operations;
* без массового управления инфраструктурой;
* без автоматического deploy;
* без автоматического rollback;
* без управления DNS;
* без изменения БД из платформы.

---

## 38. Что сознательно не делаем

Integration Layer не должен превращаться в:

* Vercel clone;
* GitHub client;
* Supabase dashboard;
* Sentry clone;
* analytics platform.

Показываем только те данные, которые помогают сопровождать проект.

---

## 39. Главный критерий интеграции

Перед добавлением новой integration или нового API field задаём вопрос:

> Помогает ли эта информация быстрее понять состояние проекта или выполнить регулярную задачу сопровождения?

Если нет — она не нужна в MVP.

---

## 40. Главный принцип

External providers являются источниками данных и специализированными инструментами.

Наша платформа является:

> единым operational layer поверх этих сервисов.
