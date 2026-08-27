# USER_FLOWS.md

## 1. Цель

Этот документ описывает основные пользовательские сценарии MVP.

Он нужен, чтобы до разработки интерфейсов и API определить:

* кто выполняет действие;
* с какого экрана начинается сценарий;
* какие проверки происходят;
* какие данные меняются;
* что пользователь видит в результате;
* что происходит при ошибке.

Главный принцип:

> Сначала определяем реальные рабочие сценарии, потом проектируем экраны и endpoints.

---

# 2. Основные типы пользователей

В MVP есть два основных типа пользователей:

```text
DEVELOPER
CLIENT
```

### DEVELOPER

Разработчик:

* создаёт и подключает проекты;
* управляет интеграциями;
* приглашает клиентов;
* видит техническое состояние;
* работает с Project Health;
* имеет доступ к Developer Control Panel.

### CLIENT

Клиент:

* имеет доступ только к назначенным проектам;
* работает с разрешённым контентом;
* не видит технические настройки;
* не управляет интеграциями;
* не получает доступ к secrets.

---

# 3. Flow: Первый вход разработчика

```text
Developer
↓
Sign In
↓
Authentication
↓
Membership Check
↓
Developer Dashboard
```

### Сценарий

1. Пользователь открывает платформу.
2. Вводит credentials.
3. Supabase Auth проверяет authentication.
4. Платформа получает profile.
5. Проверяются memberships.
6. Пользователь попадает в Developer Dashboard.

### Если это первый вход

Если у пользователя ещё нет organization:

```text
Create Organization
↓
Organization created
↓
Developer becomes OWNER
↓
Dashboard
```

### Ошибки

Если:

* authentication неудачна;
* аккаунт disabled;
* membership отсутствует;

доступ запрещается.

---

# 4. Flow: Создание первого проекта

```text
Developer Dashboard
↓
Create Project
↓
Project Setup
↓
Project Created
↓
Project Overview
```

### Минимальные данные

Разработчик вводит:

```text
Project name
Production URL
```

Опционально:

```text
Description
Timezone
Locale
```

### После создания

Создаются:

```text
Project
ProjectMembership
```

`ProjectSettings` создаётся при необходимости или вместе с Project.
`ProjectHealth` создаётся только при первом health check или подключении Health subsystem.

Developer получает доступ к проекту.

---

# 5. Flow: Подключение существующего сайта

Продукт не создаёт сайт.

Основной сценарий:

```text
Existing Website
↓
Connect to Platform
↓
Project Configuration
↓
Health / CMS / Integrations
```

После создания Project разработчик подключает уже существующий сайт.

MVP не обещает подключение любого существующего сайта без подготовки. Управляемый
бизнес-контент сайта должен быть переведён на стабильный `CMS Contract v1`, после чего
выполняется небольшая одноразовая интеграция. Дизайн сайта не меняется.

Минимально:

```text
production_url
```

Далее можно подключить:

* CMS contract;
* GitHub;
* Vercel;
* Supabase;
* Sentry;
* PostHog — optional / later.

Подключение integrations не обязательно должно происходить за один шаг.

---

# 6. Flow: Подключение GitHub

```text
Project
↓
Integrations
↓
Connect GitHub
↓
OAuth
↓
Select Repository
↓
Connection Validation
↓
Connected
```

### После подключения

Платформа выполняет initial sync:

```text
repository
latest commit
branch
```

Создаётся:

```text
Integration
IntegrationSnapshot
AuditEvent
```

### Ошибка

Если OAuth или API недоступны:

```text
Integration status = error
```

Project при этом остаётся доступным.

---

# 7. Flow: Подключение Vercel

```text
Project
↓
Integrations
↓
Connect Vercel
↓
Authorize
↓
Select Vercel Project
↓
Validate
↓
Initial Sync
```

Получаем:

```text
production deployment
deployment status
deployment URL
commit
```

После этого deployment становится частью Project Health.

---

# 8. Flow: Подключение Sentry

```text
Project
↓
Integrations
↓
Connect Sentry
↓
Authorize
↓
Select Sentry Project
↓
Validate
↓
Initial Sync
```

Получаем:

```text
unresolved errors
critical errors
latest issue
```

---

# 9. Flow: Подключение Supabase

Важно различать Platform Supabase и клиентский Supabase.

```text
Project
↓
Integrations
↓
Connect Supabase
↓
Credentials / OAuth
↓
Select Project
↓
Validate
↓
Connected
```

MVP получает только необходимые технические данные.

Не предоставляет developer'у полноценный SQL dashboard.

---

# 10. Flow: Developer Dashboard

Главный сценарий разработчика:

```text
Login
↓
Multi-project Dashboard
↓
Needs Attention
```

Dashboard показывает проекты в порядке приоритета.

Пример:

```text
NEEDS ATTENTION

Project A
Critical
Production deploy failed

Project B
Warning
Sentry errors increased


HEALTHY

Project C
Project D
```

Developer должен за короткое время понять:

> Где сейчас есть проблема?

---

# 11. Flow: Открытие проблемного проекта

```text
Dashboard
↓
Project with warning/critical
↓
Project Overview
```

Developer видит:

```text
Overall Health

Website
Deployment
Errors
Database
Integrations

Open Incidents
Recent Activity
```

Далее developer может перейти в конкретный раздел.

---

# 12. Flow: Project Health Check

Background job:

```text
Scheduler
↓
Run Checks
↓
Normalize Results
↓
Store HealthChecks
↓
Update ProjectHealth
↓
Create/Update Incident
```

Например:

```text
HTTP check
→ passed

SSL
→ passed

Vercel
→ failed

Sentry
→ warning
```

Для Project Health v1 учитываются только следующие сигналы:

```text
HTTP availability
SSL
Deployment
Critical errors
Integration freshness
```

Deployment и Critical errors появляются после подключения соответствующих providers.
Недоступность отдельной integration относится к Integration Health и не должна
автоматически превращать сам сайт в `critical`.

Итог:

```text
Project Health = critical
```

В этом примере `critical` вызван failed deployment; предупреждение Sentry относится к
Integration Health и само по себе не повышает Project Health до `critical`.

---

# 13. Flow: Создание Health Incident

Если проверка обнаруживает проблему:

```text
HealthCheck failed
↓
Check existing incident
```

Если такого открытого incident нет:

```text
Create HealthIncident
```

Если уже существует:

```text
Update last_seen_at
```

Developer Dashboard начинает показывать проект в:

```text
Needs Attention
```

---

# 14. Flow: Resolution Incident

Если проблема исчезла:

```text
Next HealthCheck
↓
Passed
↓
Open Incident found
↓
Resolve Incident
```

Записывается:

```text
resolved_at
status = resolved
```

После пересчёта Project Health проект может перейти в:

```text
healthy
```

---

# 15. Flow: Developer вручную подтверждает проблему

Developer открывает incident:

```text
Incident
↓
Acknowledge
```

Статус:

```text
open
→
acknowledged
```

Это означает:

> Developer знает о проблеме и работает с ней.

Это не означает, что проблема решена.

---

# 16. Flow: Приглашение клиента

```text
Project
↓
Users
↓
Invite User
↓
Email
↓
Role = CLIENT
↓
Invitation
```

После принятия:

```text
ProjectMembership
status = active
```

CLIENT получает только разрешения своей роли.
CLIENT не обязан становиться OrganizationMember.

---

# 17. Flow: Первый вход CLIENT

```text
Client
↓
Sign In
↓
Authentication
↓
Project Membership
↓
Client CMS
```

CLIENT не попадает в Developer Dashboard.

Если доступен только один проект, можно сразу открыть его CMS.

Если проектов несколько:

```text
Select Project
```

---

# 18. Flow: Client CMS

CLIENT видит только разрешённые ContentModules.

Используется тот же CMS engine, editors и validation, что и в Developer interface;
отличаются только layout и permissions.

Например:

```text
Content

Services
Masters
Portfolio
Offers
Contacts
```

CLIENT не видит:

```text
Deployments
Sentry
Database
Integrations
Secrets
Developer Settings
```

---

# 19. Flow: Просмотр Content Module

```text
Client CMS
↓
Select Module
↓
Content Entries
```

Например:

```text
Services

Женская стрижка
Мужская стрижка
Окрашивание
```

Доступные действия зависят от permission:

```text
create
edit
hide
delete
reorder
```

---

# 20. Flow: Редактирование Content Entry

```text
Content Entry
↓
Edit
↓
Validate
↓
Permission Check
↓
Save
↓
Audit
```

Проверки:

1. User authenticated.
2. User имеет membership.
3. Project совпадает.
4. Есть `content.write`.
5. Поля существуют в ContentModule.
6. Values проходят validation.

После успешного сохранения:

```text
content_entries.updated_at
updated_by
```

Создаётся:

```text
AuditEvent
```

---

# 21. Flow: Ошибка CLIENT permission

CLIENT вручную вызывает запрещённый endpoint:

```text
POST /api/.../integrations
```

Server:

```text
Authentication
✓

Project Membership
✓

integrations.manage
✗
```

Ответ:

```text
403 Forbidden
```

UI не является защитой.

---

# 22. Flow: Создание Content Entry

```text
Module
↓
Add
↓
Form generated from ContentFields
↓
Validation
↓
Create
↓
Audit
```

Платформа строит форму по:

```text
ContentModule
+
ContentFields
```

а не по hardcoded компоненту конкретного бизнеса.

---

# 23. Flow: Скрытие Content Entry

CLIENT или DEVELOPER:

```text
Entry
↓
Hide
↓
status = hidden
```

Физическое удаление данных не требуется.

Клиентский сайт перестаёт показывать entry.

Audit:

```text
content.hide
```

---

# 24. Flow: Удаление Content Entry

Если deletion разрешён:

```text
Entry
↓
Delete
↓
Confirmation
↓
Soft Delete
```

Устанавливается:

```text
deleted_at
```

В будущем можно восстановить запись.

---

# 25. Flow: Сортировка контента

```text
Entries
↓
Reorder
↓
Update sort_order
↓
Save
```

Изменение должно быть атомарным.

Audit может записывать:

```text
content.reorder
```

без хранения огромного before/after payload.

---

# 26. Flow: Upload изображения

```text
CLIENT
↓
Choose Image
↓
Client-side preliminary validation
↓
Upload
↓
Server Validation
↓
Storage
↓
MediaAsset
↓
Attach to ContentEntry
```

Server проверяет:

* file size;
* magic bytes;
* format;
* MIME;
* ownership.

---

# 27. Flow: iPhone / HEIC

```text
User selects image
↓
Detect actual bytes
↓
Normalize if needed
↓
Upload supported image
```

Нельзя доверять только:

```text
filename
MIME
```

Ошибочная загрузка не должна оставлять UI заблокированным.

---

# 28. Flow: Замена изображения

```text
Current Image
↓
Replace
↓
Upload New
↓
Validate
↓
Attach New MediaAsset
↓
Old Asset marked for cleanup
```

Нельзя сначала удалить старое изображение, а потом пытаться загрузить новое.

Иначе при ошибке upload клиент потеряет рабочий файл.

---

# 29. Flow: Удаление изображения

```text
Image
↓
Remove
↓
Update ContentEntry
↓
Mark Media Asset
↓
Delayed Cleanup
```

Физическое удаление из storage может выполняться позже.

---

# 30. Flow: Audit Review

Developer:

```text
Project
↓
Audit
```

Видит:

```text
27 Aug 14:20
Client
Updated Service

27 Aug 14:12
Developer
Connected Vercel
```

Можно фильтровать хотя бы по:

* action;
* user;
* entity;
* date.

Расширенная аналитика audit не входит в MVP.

---

# 31. Flow: Integration Sync Error

```text
Background Sync
↓
Provider Timeout
↓
Retry
↓
Still Failed
↓
Integration status = degraded/error
```

Создаётся безопасная информация об ошибке.

Secrets не логируются.

Project Health оценивает, влияет ли эта ошибка на общий статус.

---

# 32. Flow: Provider восстановился

```text
Next Sync
↓
Success
↓
Integration status = connected
↓
Update last_synced_at
```

Если был incident только из-за integration availability, он может быть resolved.

---

# 33. Flow: Disconnect Integration

Только пользователь с:

```text
integrations.manage
```

Flow:

```text
Integration
↓
Disconnect
↓
Confirmation
↓
Revoke Credential
↓
Stop Sync
↓
status = disconnected
↓
Audit
```

Historical snapshots можно сохранить.

---

# 34. Flow: Archive Project

Вместо обычного delete:

```text
Project Settings
↓
Archive Project
↓
Confirmation
↓
status = archived
```

После archive:

* background checks останавливаются;
* проект исчезает из обычного dashboard;
* данные сохраняются;
* memberships не удаляются автоматически.

---

# 35. Flow: Restore Archived Project

```text
Archived Projects
↓
Restore
↓
status = active
↓
Resume checks
```

---

# 36. Flow: Developer открывает внешний сервис

Мы не копируем весь функционал provider.

Пример:

```text
Sentry Summary
↓
View in Sentry
```

или:

```text
Deployment
↓
Open in Vercel
```

Платформа отвечает на:

> Что произошло?

Provider отвечает на:

> Как глубоко это диагностировать?

---

# 37. Flow: Новый проект без integrations

Система должна работать даже если подключён только:

```text
production_url
```

Минимально можно выполнить:

```text
HTTP check
SSL check
```

Dashboard показывает остальные integrations:

```text
Not connected
```

Это не должно считаться application failure.

---

# 38. Flow: Partial Integration Failure

```text
Website
● healthy

GitHub
● connected

Vercel
● connected

Sentry
⚠ unavailable
```

Пользователь всё равно может:

* открыть project;
* работать с CMS;
* видеть deployment;
* видеть audit.

Один provider не должен блокировать весь проект.

---

# 39. Flow: Platform Error

Если ошибка происходит в самой платформе:

```text
Request
↓
Unexpected error
↓
Safe user message
↓
Internal Sentry event
```

Пользователь не получает:

* stack trace;
* secrets;
* SQL error.

---

# 40. Flow: Session Expired

```text
User Action
↓
Session Invalid
↓
Protected Action Rejected
↓
Sign In
```

Несохранённые данные по возможности не должны молча теряться.

---

# 41. Flow: Membership Disabled

Если developer отключает CLIENT:

```text
Membership
active
↓
disabled
```

Следующий защищённый request должен получить отказ.

Нельзя ждать истечения какой-то отдельной локальной роли в frontend.

---

# 42. Flow: User пытается открыть чужой Project ID

```text
User A
↓
/projects/project-b
↓
Server Membership Check
↓
No Access
↓
404/403
```

Данные Project B не возвращаются даже частично.

---

# 43. Flow: Project Onboarding MVP

Итоговый onboarding нового проекта:

```text
Create Project
↓
Production URL
↓
Initial Health Check
↓
Connect GitHub
↓
Connect Vercel
↓
Connect Sentry
↓
Connect Supabase
↓
Configure CMS
↓
Invite Client
↓
Project Active
```

На шаге `Initial Health Check` создаётся первая запись `ProjectHealth`. До этого
техническое состояние может отсутствовать.

Не все integrations обязательны.

Разработчик может завершить onboarding позже.

---

# 44. Flow: Daily Developer Workflow

Это один из главных сценариев продукта.

```text
Developer logs in
↓
Dashboard
↓
Needs Attention
↓
Open problematic project
↓
Understand reason
↓
Open provider if required
↓
Resolve
↓
Return to dashboard
```

Идеальный результат:

> Разработчику не нужно по очереди открывать все проекты, чтобы понять, всё ли работает.

---

# 45. Flow: Daily Client Workflow

```text
Client logs in
↓
CMS
↓
Select Content Module
↓
Edit
↓
Save
↓
Done
```

CLIENT не должен разбираться:

* где hosted сайт;
* какая БД;
* какой deployment provider;
* где Git repository.

---

# 46. Главный критерий UX

DEVELOPER должен отвечать на вопрос:

> Какой проект требует внимания?

CLIENT должен отвечать на вопрос:

> Где изменить нужные данные на сайте?

Если интерфейс заставляет обоих пользователей разбираться в устройстве платформы, UX слишком сложный.

---

# 47. Что не входит в User Flows MVP

Пока не проектируем:

* billing;
* subscriptions;
* AI actions;
* deployment trigger;
* rollback deploy;
* DNS management;
* marketplace;
* white-label;
* complex teams;
* approval workflows;
* client support tickets;
* notifications center;
* mobile native app.

---

# 48. Основные MVP Flows

Критические сценарии, которые должны полностью работать перед первым dogfooding:

```text
1. Developer login
2. Create Project
3. View Dashboard
4. Run Project Health
5. Open Health Incident
6. Connect Integration
7. Invite Client
8. Client login
9. Client edit content
10. Upload/replace media
11. Developer review Audit
12. Tenant isolation
```

Если хотя бы один из этих сценариев ломается, MVP ещё не готов к реальному использованию.

---

# 49. Главный принцип

Проектируем систему вокруг законченных пользовательских сценариев, а не вокруг количества экранов и функций.

Любой новый экран должен существовать потому, что он нужен конкретному User Flow.
