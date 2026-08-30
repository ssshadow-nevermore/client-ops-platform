# MVP_BUILD_PLAN.md

## 1. Цель

Этот документ определяет порядок разработки MVP платформы.

Главный принцип:

> Сначала строим минимальное безопасное ядро, затем подключаем реальные проекты и только после этого расширяем функциональность.

Мы не разрабатываем все модули одновременно.

Каждый этап должен завершаться работающим и проверяемым результатом.

---

# 2. Основной порядок разработки

```text
0. Specification Freeze
↓
1. Repository Foundation
↓
2. Supabase Foundation
↓
3. Authentication
↓
4. Authorization + RLS
↓
5. Audit Core
↓
6. Projects
↓
7. CMS Core
↓
8. Media
↓
9. Project Health
↓
10. Integration Framework
↓
11. GitHub
↓
12. Vercel
↓
13. Sentry
↓
14. Multi-project Dashboard
↓
15. Audit UI
↓
16. CMS Contract v1
↓
17. First Real Project
↓
18. Dogfooding
↓
19. Second Project
↓
20. Third Project
↓
21. Stabilization
↓
22. Internal MVP
```

---

# 3. Этап 0 — Freeze Specification

Перед первой строкой production-кода проверяем наличие:

```text
PRODUCT_HYPOTHESIS.md
TARGET_USER.md
MVP_SCOPE.md
NON_GOALS.md
SUCCESS_CRITERIA.md

ARCHITECTURE.md
SECURITY_MODEL.md
INTEGRATIONS.md
VERSIONING_STRATEGY.md
DATA_MODEL.md
USER_FLOWS.md
UI_STRUCTURE.md
MVP_BUILD_PLAN.md
```

Если во время разработки появляется новая идея:

```text
idea
↓
проверить MVP_SCOPE
↓
проверить NON_GOALS
```

Если функция не входит в MVP — она не реализуется сейчас.

---

# 4. Этап 1 — Repository Foundation

Создать новый private GitHub repository.

Базовая структура:

```text
app/
components/
lib/
supabase/
tests/
scripts/
docs/
```

Документы проекта можно хранить:

```text
docs/
```

или в root, если так удобнее.

---

# 5. Базовый stack

MVP:

```text
Next.js
TypeScript
Supabase
PostgreSQL
Vercel
```

Позже подключаются:

```text
GitHub API
Vercel API
Sentry
PostHog optional
```

---

# 6. Project Configuration

Настроить:

```text
TypeScript strict
ESLint
environment validation
.env.example
.gitignore
```

Не хранить реальные secrets в Git.

Пример:

```text
.env.local
```

должен быть ignored.

---

# 7. CI Baseline

С самого начала желательно иметь проверки:

```text
typecheck
lint
tests
build
```

Каждый основной этап должен проходить их перед завершением.

---

# 8. Этап 1 Definition of Done

Этап считается завершённым, когда:

* repository создан;
* приложение запускается локально;
* TypeScript работает в strict mode;
* lint работает;
* production build проходит;
* environment variables валидируются;
* secrets отсутствуют в repository.

---

# 9. Этап 2 — Supabase Foundation

Создать отдельный Supabase project для платформы.

Это:

```text
Platform Supabase
```

Он не является Supabase конкретного клиентского сайта.

---

# 10. Настроить Supabase

Минимально:

```text
Auth
PostgreSQL
RLS
Migrations
```

Storage подключается, когда начинаем Media Module.

---

# 11. Migration System

Все изменения БД выполняются через migrations.

Структура:

```text
supabase/
  migrations/
```

Не менять production schema вручную.

---

# 12. Initial Tables

На первом этапе создаём только фундамент:

```text
profiles

organizations
organization_memberships

projects
project_memberships
```

Не создаём сразу все будущие таблицы.

---

# 13. Initial RLS

Сразу включаем RLS для multi-tenant таблиц. Полные project-scoped policies и проверки
permissions реализуются на этапе 4 — Authorization + RLS.

Даже если приложение пока использует только одного developer.

Не откладывать tenant security на потом.

---

# 14. Этап 2 Definition of Done

Проверить:

```text
User A
→ Organization A

User B
→ Organization B
```

User A:

```text
✓ видит Organization A
✗ не видит Organization B
```

То же самое для projects.

---

# 15. Этап 3 — Authentication

Реализовать Supabase Auth.

MVP:

```text
login
logout
password reset
session
```

---

# 16. Developer Authentication

Первым реализуется DEVELOPER flow.

```text
/login
↓
authentication
↓
membership
↓
/dashboard
```

---

# 17. Profile Creation

После создания `auth.users` создаётся:

```text
profiles
```

Не хранить authentication credentials самостоятельно.

---

# 18. Organization Bootstrap

Для первого developer:

```text
User
↓
Create Organization
↓
OrganizationMembership OWNER
```

Для собственного dogfooding допустимо иметь простой onboarding.

---

# 19. Security Baseline

Проверить:

* protected routes;
* server-side session validation;
* logout invalidation;
* expired session;
* no auth token leakage;
* safe redirect after login.

---

# 20. MFA

До публичного beta MFA для DEVELOPER должен стать обязательным.

На первом локальном MVP его можно подключить немного позже, если это ускоряет первоначальную разработку auth.

Но нельзя выпускать developer control panel публично без усиленной защиты.

---

# 21. Этап 3 Definition of Done

Developer может:

```text
sign in
↓
open protected dashboard
↓
sign out
```

Unauthenticated пользователь:

```text
/dashboard
↓
denied / redirect login
```

---

# 22. Этап 4 — Authorization + RLS

Создать:

```text
roles
permissions
role_permissions
```

Системные роли:

```text
CLIENT
DEVELOPER
```

---

# 23. Permission System

Реализовать единый authorization helper.

На этом же этапе реализовать и проверить project-scoped RLS policies. Authorization
должен работать одновременно на UI, server layer и уровне базы данных.

Пример концепции:

```text
requirePermission(
  user,
  projectId,
  "content.write"
)
```

Не создавать десятки разрозненных проверок.

---

# 24. Initial Permissions

Минимально:

```text
project.read

content.read
content.write

media.read
media.write

health.read

integrations.read
integrations.manage

users.read
users.manage

audit.read

settings.read
settings.write
```

Расширять только по мере необходимости.

---

# 25. Authorization Tests

Обязательные тесты:

```text
CLIENT
✗ integrations.manage

CLIENT
✗ settings.write

DEVELOPER
✓ integrations.manage
```

И:

```text
Developer A
✗ Project B without membership
```

---

# 26. Этап 4 Definition of Done

Permissions работают одновременно:

```text
UI
Server
Database/RLS
```

Скрытая кнопка не считается security control.

---

# 27. Этап 5 — Audit Core

Audit backend создаётся до Projects и остальных доменных модулей.

Создать:

```text
audit_events
```

и единый server-side audit writer, который вызывается из security-sensitive actions.
Audit Core не требует готовой страницы `/audit`.

Первые события:

```text
user.login
user.logout
authorization.denied
membership.create
membership.disable
```

Позже этим же writer'ом покрываются:

```text
project.create
project.archive
content.create
content.update
content.delete
media.upload
media.delete
integration.connect
integration.disconnect
settings.update
```

Нельзя откладывать запись security-sensitive действий до появления Audit UI.

### Этап 5 Definition of Done

Проверить, что:

* события создаются на server-side;
* denied actions также фиксируются;
* audit metadata не содержит secrets;
* обычный CLIENT не может удалять audit history;
* UI для просмотра audit пока не требуется.

---

# 28. Этап 6 — Projects

Реализовать:

```text
/projects
/projects/new
/projects/[projectId]
```

---

# 29. Create Project

Минимальная форма:

```text
name
production_url
timezone
locale
```

Обязательные:

```text
name
production_url
```

При создании создаются только:

```text
Project
ProjectMembership
```

`ProjectSettings` создаётся при необходимости или вместе с Project. `ProjectHealth` на
этом этапе не создаётся: он появляется при первом health check или подключении Health
subsystem.

---

# 30. Project Overview v0

Пока без integrations.

Показывать:

```text
Project Name
Production URL
Status
```

И placeholders:

```text
Health
Integrations
Content
```

---

# 31. Archive Project

Не делать hard delete.

Использовать:

```text
active
archived
```

---

# 32. Этап 6 Definition of Done

Developer может:

```text
create project
open project
edit settings
archive project
restore project
```

CLIENT не может создать или архивировать проект.

---

# 33. Этап 7 — CMS Core

Теперь создаём:

```text
content_modules
content_fields
content_entries
```

---

# 34. CMS Engine v1

Поддерживаем только field types:

```text
text
textarea
number
boolean
url
date
select
image
```

Не делать rich page builder.

Developer и CLIENT используют один CMS engine, editors и validation. Различаются только
layouts и permissions.

---

# 35. Content Module Configuration

На первом этапе schema configuration задаётся через seed, config или developer-only
configuration.

Не нужно строить user-facing visual schema builder, relation builder или drag & drop
настройку схемы в первой версии.

---

# 36. Generic Entry Editor

Форма создаётся из:

```text
ContentModule
+
ContentFields
```

Например:

```text
name → text input
price → number input
active → checkbox
image → media picker
```

---

# 37. CMS CRUD

Минимально:

```text
create
read
update
hide
soft delete
reorder
```

---

# 38. Content Validation

Перед сохранением:

```text
field exists?
↓
type valid?
↓
required valid?
↓
custom validation?
↓
save
```

Нельзя сохранять arbitrary JSON от клиента без validation.

---

# 39. Client CMS UI

CLIENT видит:

```text
Content Modules
↓
Entries
↓
Editor
```

Не видит технические понятия:

```text
schema
JSON
storage key
API
database ID
```

---

# 40. Этап 7 Definition of Done

Создать тестовый проект с несколькими generic modules.

CLIENT может:

```text
login
↓
open project
↓
edit allowed content
↓
save
```

И не получает доступ к developer settings.

---

# 41. Этап 8 — Media Module

Создать:

```text
media_assets
```

Подключить Storage.

Storage implementation не должна размазываться по CMS.

---

# 42. Media Pipeline

```text
Select File
↓
Preliminary Validation
↓
Upload
↓
Server Validation
↓
Storage
↓
MediaAsset
↓
ContentEntry
```

---

# 43. Validation

Проверяем:

```text
size
MIME
magic bytes
actual image decoding
allowed format
ownership
```

---

# 44. Formats

MVP должен учитывать:

```text
JPEG
PNG
WebP
HEIC
HEIF
```

Особенно проверить iPhone Photos edge cases.

---

# 45. Replace Strategy

Правило:

```text
upload new
↓
validate
↓
attach new
↓
detach old
↓
cleanup later
```

Никогда:

```text
delete old
↓
try upload new
```

---

# 46. Orphan Strategy

Media, больше не связанное с content:

```text
orphaned
```

Физическая очистка происходит отдельно.

---

# 47. Этап 8 Definition of Done

Проверить на:

* desktop;
* Android browser;
* physical iPhone.

Особенно:

```text
старые фото из iPhone Photos
HEIC/HEIF
MIME mismatch
```

---

# 48. Этап 9 — Project Health v1

Теперь создаём:

```text
project_health
```

`project_health` создаётся автоматически вместе с каждым Project и является canonical
1:1 snapshot. `health_checks` и `health_incidents` остаются будущими таблицами и пока
не входят в реализованный MVP.

---

# 49. Первые Health Checks

Запланированный набор сигналов Project Health v1:

```text
HTTP availability
SSL
Deployment
Critical errors
Integration freshness
```

В текущем MVP реализован только HTTP availability через Edge Function. Deployment и
Critical errors требуют Vercel/Sentry integrations, SSL и integration freshness пока
не выполняются. Synthetic monitoring, forms, checkout, booking и Playwright flows
остаются future.

---

# 50. Health Status

```text
not_configured
unknown
healthy
degraded
critical
```

---

# 51. Health Incident Logic

Будущая incident logic после добавления `health_checks` и `health_incidents`:

Если проверка ломается:

```text
failed check
↓
open incident?
├── yes → update
└── no  → create
```

Если восстанавливается:

```text
passed check
↓
resolve incident
```

---

# 52. Scheduler

Scheduled/background mechanism нужен для будущих автоматических проверок.

Не строить distributed job system.

---

# 53. Health UI

Developer видит текущий canonical snapshot:

```text
Overall Health
Checks
HTTP status and response time
Last checked timestamp
```

CLIENT этого раздела не видит.

---

# 54. Этап 9 Definition of Done

Для текущего реализованного slice можно:

```text
указать недоступный URL
```

и проверить:

```text
health becomes critical
overall status remains unknown
dashboard reflects the real HTTP snapshot
```

После добавления остальных signals и incident storage:

```text
incident resolved
health returns healthy
```

---

# 55. Этап 10 — Integration Framework

До конкретных providers реализовать общий слой:

```text
Integration
Provider Adapter
Integration Snapshot
Integration Status
```

---

# 56. Base Adapter Contract

Например:

```text
validateConnection()
sync()
getSummary()
disconnect()
```

Конкретные interfaces уточняются в коде.

---

# 57. Этап 11 — GitHub Provider

Начать с GitHub.

Причина:

* понятный API;
* низкий риск;
* read-only данные;
* полезно для проверки provider architecture.

---

# 58. GitHub MVP

Получаем:

```text
repository
branch
latest commit
```

---

# 59. Этап 12 — Vercel Provider

Получаем:

```text
latest production deployment
status
commit
URL
```

Добавляем deployment signal в Project Health.

---

# 60. Этап 13 — Sentry Provider

Получаем:

```text
critical issues
unresolved issues
last issue
```

Добавляем error signal в Project Health.

---

# 61. Optional Provider — Supabase

Подключаем только если API позволяет получить полезные данные безопасно.

MVP:

```text
connection status
database health
storage health
```

Не делать SQL editor.

---

# 62. Optional / Later — PostHog

Поддержка `AnalyticsProvider` сохраняется архитектурно, но PostHog подключается только
если нужен для собственного использования.

Не входит в обязательный build order и не является блокером Internal MVP.

---

# 63. Этапы 10–13 Definition of Done

Ошибка любого provider:

```text
не ломает platform
не ломает CMS
не ломает другие integrations
```

Dashboard показывает:

```text
integration unavailable
```

отдельно от:

```text
website unavailable
```

---

# 64. Этап 14 — Multi-project Dashboard

Теперь, когда есть реальные health data, строим главный экран.

Не раньше.

---

# 65. Dashboard v1

Разделить:

```text
Needs Attention
Healthy
Unknown
```

---

# 66. Project Summary

Показывать только важное:

```text
Project
Health
Main Incident
Last Check
Latest Deploy
Critical Errors
```

---

# 67. Sorting

Приоритет:

```text
critical
↓
warning
↓
unknown
↓
healthy
```

Внутри можно сортировать по последней активности.

---

# 68. Этап 14 Definition of Done

Developer с 5+ тестовыми проектами может за несколько секунд понять:

> Какой проект требует внимания?

Если для этого нужно открывать каждый Project — dashboard ещё не решает задачу.

---

# 69. Этап 15 — Audit UI

Audit Core уже реализован на этапе 5. На этом этапе добавляется только интерфейс
просмотра audit events:

```text
Audit Log
```

---

# 70. Audit UI Details

Developer видит:

```text
Who
Action
Entity
Time
Result
```

Фильтры:

```text
user
action
date
```

---

# 71. Security

Никогда не писать в audit:

```text
password
token
secret
authorization header
```

---

# 72. Этап 15 Definition of Done

Developer может ответить:

> Кто изменил этот контент и когда?

---

# 73. Этап 16 — CMS Contract v1

Теперь фиксируем публичный versioned contract для контента и media. Первый настоящий
сайт подключается только на следующем этапе.

---

# 74. CMS Contract v1

Создать:

```text
/api/v1/
```

или небольшой versioned client adapter.

Клиентский сайт получает данные платформы через стабильный contract.

---

# 75. Не подключать сайт напрямую к внутренним таблицам

Нельзя делать:

```text
Client Website
↓
internal platform database structure
```

Лучше:

```text
Client CMS
↓
Platform DB
↓
CMS Contract v1
↓
Client Website
```

---

# 76. Этап 17 — First Real Project

Для первого сайта:

```text
текущий content
↓
ContentModules
↓
ContentEntries
↓
CMS
```

Frontend сайта получает данные через новый contract.

---

# 77. Не менять дизайн сайта

При подключении платформы:

```text
visual frontend
=
frozen
```

Меняется источник данных, а не утверждённый клиентом дизайн.

---

# 78. End-to-End Flow

Проверить:

```text
CLIENT
↓
CMS
↓
Edit Content
↓
Platform DB
↓
CMS Contract
↓
Client Website
↓
Refresh
↓
New Content Visible
```

---

# 79. Media End-to-End

```text
iPhone
↓
CMS upload
↓
Platform Storage
↓
MediaAsset
↓
Client Website
↓
Correct image
```

---

# 80. Этап 17 Definition of Done

Первый настоящий сайт полностью обслуживается через платформу без потери существующего функционала.

---

# 81. Этап 18 — Dogfooding

Теперь не добавлять большие функции.

Использовать систему.

Минимум несколько недель.

---

# 82. Что фиксировать

Для каждого случая:

```text
Что хотел сделать?
Сколько заняло?
Пришлось ли открыть внешний сервис?
Чего не хватило?
Было ли действие лишним?
```

---

# 83. Pain Log

Можно создать:

```text
DOGFOODING_NOTES.md
```

или Issues в GitHub.

Категории:

```text
friction
bug
missing-data
unnecessary-feature
security
performance
client-confusion
```

---

# 84. Главное правило dogfooding

Не реализовывать функцию после одного раздражения.

Искать повторяемость.

Например:

```text
возникло 1 раз
→ записали

возникло 5 раз
→ кандидат на feature
```

---

# 85. Этап 19 — Second Project

Подключить сайт другого типа.

Цель:

> Проверить, что мы не построили систему только под первый проект.

---

# 86. Проверить CMS Abstraction

Если второй сайт требует:

```text
cases
team
products
vacancies
```

не создавать новые core-таблицы.

Использовать:

```text
ContentModules
```

---

# 87. Этап 20 — Third Project

После третьего проекта провести архитектурный review.

Определить:

```text
что действительно universal core
что project-specific
что оказалось лишним
чего постоянно не хватает
```

---

# 88. First Major MVP Review

После 3 проектов проверить `SUCCESS_CRITERIA.md`.

Особенно:

### Dashboard

Можно ли быстро понять состояние проектов?

### Project Health

Узнаём ли мы о базовых проблемах раньше клиента?

### Client CMS

Может ли клиент делать основные изменения самостоятельно?

### Audit

Понимаем ли мы, кто что менял?

### Maintenance

Стало ли реально меньше ручной работы?

---

# 89. Если критерии не выполняются

Не добавлять:

```text
billing
AI
white-label
marketplace
```

Сначала исправить core value.

---

# 90. Этап 21 — Stabilization

После нескольких реальных проектов:

```text
bug fixing
security review
performance
UX cleanup
backup
restore
rollback
```

---

# 91. QA Baseline

Обязательно:

```text
TypeScript
Lint
Unit tests
Integration tests
RLS tests
Build
```

---

# 92. Browser QA

Минимум:

```text
Chromium
WebKit/Safari
mobile
```

---

# 93. Physical Device QA

Client CMS обязательно проверить физически:

```text
iPhone
Android
```

Особенно:

* login;
* forms;
* media;
* save;
* errors.

---

# 94. Adversarial QA

Проверять систему не только happy-path.

Например:

```text
CLIENT calls developer API
invalid project_id
expired session
deleted membership
provider timeout
broken image
stale integration
duplicate request
rapid Save
network interruption
```

---

# 95. Security QA

Проверить:

```text
tenant isolation
RLS
permissions
direct API access
secret exposure
logs
Sentry scrubbing
upload validation
auth
sessions
```

---

# 96. Recovery QA

Проверить:

```text
database backup
database restore
application rollback
migration recovery
```

Backup без restore test не считается проверенным backup.

---

# 97. Этап 22 — Internal MVP Complete

MVP можно считать готовым для собственного постоянного использования, если:

* есть минимум 3 реальных проекта;
* dashboard реально используется;
* Project Health помогает обнаруживать проблемы;
* CLIENT самостоятельно меняет контент;
* tenant isolation проверена;
* audit работает;
* integrations устойчивы;
* система переживает provider failures;
* backups и restore проверены;
* возвращаться к полностью ручному workflow уже неудобно.

---

# 98. Что происходит после Internal MVP

Только после этого возвращаемся к вопросу рынка.

Следующий этап:

```text
external alpha
↓
3–5 developers
↓
usage observation
↓
feedback
↓
willingness-to-pay
```

---

# 99. Что НЕ делаем до Internal MVP

Не реализуем:

```text
AI agent
website generator
visual builder
billing
subscriptions
marketplace
white-label
complex agency roles
enterprise SSO
automatic deploy
automatic rollback
DNS management
native mobile app
```

---

# 100. Общая последовательность

```text
0. Specification Freeze

1. Repository Foundation

2. Supabase Foundation

3. Authentication

4. Authorization + RLS

5. Audit Core

6. Projects

7. CMS Core

8. Media

9. Project Health

10. Integration Framework

11. GitHub

12. Vercel

13. Sentry

14. Multi-project Dashboard

15. Audit UI

16. CMS Contract v1

17. First Real Project

18. Dogfooding

19. Second Project

20. Third Project

21. Stabilization

22. Internal MVP Complete

PostHog — optional / later, вне обязательного порядка
```

---

# 101. Главный принцип разработки

Не измеряем прогресс количеством написанного кода.

Каждый этап должен давать законченный рабочий сценарий.

Предпочтительно:

```text
одна маленькая функция
+
полный flow
+
security
+
tests
```

чем:

```text
десять наполовину работающих модулей
```

---

# 102. Главный критерий принятия решений

Во время разработки любой новой функции задаём три вопроса:

1. Уменьшает ли она время сопровождения?
2. Уменьшает ли она количество ручных действий?
3. Уменьшает ли она вероятность пропустить проблему?

Если ответ везде «нет» — функция не входит в MVP.
