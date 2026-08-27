# ARCHITECTURE.md

## 1. Цель архитектуры

Архитектура системы должна позволять безопасно управлять несколькими клиентскими веб-проектами из одной платформы.

Система должна:

* изолировать данные разных организаций и проектов;
* поддерживать разный уровень доступа для клиента и разработчика;
* подключать внешние сервисы через отдельные интеграционные слои;
* не зависеть жёстко от одного провайдера;
* позволять развивать platform core без необходимости вручную переписывать каждый подключённый сайт;
* поддерживать постепенное расширение функциональности без превращения системы в монолит;
* обеспечивать безопасное сопровождение нескольких проектов одновременно.

Главный архитектурный принцип:

> Платформа управляет проектами и агрегирует данные внешних сервисов, но не пытается заменить GitHub, Vercel, Supabase, Sentry, PostHog и другие специализированные системы.

---

## 2. Высокоуровневая архитектура

Базовая схема:

```text
Users
│
▼
Next.js Platform
│
├── Client CMS
├── Developer Control Panel
├── Multi-project Dashboard
├── Project Health
├── Audit Log
└── Integration Layer
│
▼
Supabase
├── Auth
├── PostgreSQL
├── Row Level Security
└── Storage

External Services
├── GitHub
├── Vercel
├── Sentry
├── Supabase Projects
└── PostHog (optional / later)
```

Next.js является основным приложением платформы.

Supabase используется как основной backend первой версии:

* аутентификация;
* PostgreSQL;
* RLS;
* хранение данных платформы;
* при необходимости storage платформы.

Внешние сервисы подключаются через отдельный integration layer.

---

## 3. Основные уровни системы

Архитектуру разделяем на несколько уровней.

### Platform Core

Содержит универсальную бизнес-логику системы:

* проекты;
* организации;
* пользователи;
* permissions;
* Project Health;
* audit;
* integrations;
* CMS infrastructure.

Platform Core не должен содержать клиентскую специфику конкретного сайта.

### Application Layer

Next.js-интерфейс:

* developer dashboard;
* project pages;
* client CMS;
* settings;
* integrations;
* monitoring.

### Data Layer

Supabase/PostgreSQL:

* organizations;
* projects;
* memberships;
* roles;
* permissions;
* integrations;
* health data;
* audit;
* CMS data;
* media metadata.

### Integration Layer

Отдельные adapters/providers для внешних сервисов.

### Connected Projects

Уже существующие клиентские сайты, которые подключаются к платформе через определённый integration contract.

---

## 4. Основные сущности

Минимальная доменная модель:

```text
Organization
Project
User
Membership
Role
Permission
Integration
HealthCheck
HealthIncident
AuditEvent
ContentModule
ContentEntry
MediaAsset
```

### Organization

Контейнер верхнего уровня.

Организация может представлять:

* отдельного разработчика;
* небольшую студию;
* агентство.

Организация содержит несколько проектов.

### Project

Один клиентский веб-проект.

Проект содержит:

* metadata;
* integrations;
* CMS configuration;
* content;
* health;
* users;
* audit;
* project settings.

### User

Пользователь платформы.

Может иметь доступ к одной или нескольким организациям и проектам.

### Membership

Есть два разных уровня доступа:

```text
OrganizationMembership
→ внутренние пользователи владельца платформы/агентства

ProjectMembership
→ доступ к конкретному клиентскому проекту
```

CLIENT не обязан быть OrganizationMember; для него основным механизмом доступа
является ProjectMembership.

### Role

Логическое объединение permissions.

Начальные роли:

* CLIENT;
* DEVELOPER.

### Permission

Конкретное разрешение на действие.

### Integration

Подключение проекта к внешнему сервису.

Например:

* GitHub repository;
* Vercel project;
* Sentry project;
* Supabase project.

### HealthCheck

Результат технической проверки проекта.

### HealthIncident

Выявленная проблема, требующая внимания.

### AuditEvent

Запись о важном действии пользователя или системы.

### ContentModule

Описание типа управляемого контента.

### ContentEntry

Конкретная запись внутри ContentModule.

### MediaAsset

Метаданные изображения или другого media-файла.

---

## 5. Multi-tenancy

Система проектируется как multi-tenant с самого начала.

Базовая иерархия:

```text
Organization
├── Users
└── Projects
    ├── Content
    ├── Integrations
    ├── Health
    ├── Audit
    ├── Media
    └── Project Memberships
```

Каждая проектная сущность должна иметь явную принадлежность к проекту.

Как минимум:

```text
organization_id
project_id
```

где это применимо.

Основное правило:

> Пользователь никогда не должен получать доступ к данным проекта, к которому он не имеет разрешения.

Изоляция обеспечивается не только интерфейсом.

Она должна работать на нескольких уровнях:

```text
UI
+
Server authorization
+
Database RLS
```

---

## 6. Roles и Permissions

На первой версии используем две пользовательские роли:

```text
CLIENT
DEVELOPER
```

Но бизнес-логика не должна строиться на большом количестве проверок вида:

```text
if role === "DEVELOPER"
```

Вместо этого права строятся вокруг permissions.

Примеры:

```text
project.read

content.read
content.write
content.publish

media.read
media.write
media.delete

health.read

deploy.read

errors.read

analytics.read

users.read
users.manage

integrations.read
integrations.manage

audit.read

settings.read
settings.write
```

### CLIENT

Получает только разрешения, необходимые для управления бизнес-контентом конкретного проекта.

Например:

```text
project.read
content.read
content.write
media.read
media.write
```

### DEVELOPER

Получает технические права на проект:

```text
content.*
health.read
deploy.read
errors.read
analytics.read
integrations.*
users.*
audit.read
settings.*
```

Конкретная модель permissions будет уточняться в `SECURITY_MODEL.md`.

---

## 7. Основной Data Flow

Пример чтения технического состояния проекта:

```text
Developer
↓
Next.js Developer Control Panel
↓
Platform API / Server Layer
↓
Integration Provider
↓
External Service
↓
Normalized Result
↓
Platform Database / Cache
↓
Dashboard
```

Например:

```text
Vercel API
↓
VercelProvider
↓
Normalized Deployment Status
↓
Project Health
↓
Developer Dashboard
```

Платформа не должна заставлять UI работать напрямую с API каждого сервиса.

Все данные приводятся к собственной внутренней модели.

---

## 8. Integration Provider Pattern

Внешние интеграции должны быть изолированы от Platform Core.

Пример интерфейсов:

```text
SourceControlProvider
DeploymentProvider
DatabaseProvider
MonitoringProvider
AnalyticsProvider
StorageProvider
```

Реализации первой версии:

```text
GitHubProvider
VercelProvider
SupabaseProvider
SentryProvider
PostHogProvider
```

Например Platform Core должен понимать:

```text
deployment.status = "failed"
```

а не особенности JSON-ответа Vercel API.

Это позволяет в будущем добавить другой provider без переписывания всей системы.

---

## 9. GitHub Integration

Первая версия GitHub integration может предоставлять:

* repository name;
* branch;
* latest commit;
* latest commit author;
* latest commit timestamp;
* repository URL;
* basic repository status.

На первом этапе интеграция преимущественно read-only.

Платформа не должна пытаться заменить GitHub.

---

## 10. Vercel Integration

Первая версия Vercel integration:

* production deployment;
* deployment status;
* deployment timestamp;
* commit/revision;
* deployment URL;
* failure state.

Нормализованный статус:

```text
pending
running
success
failed
unknown
```

---

## 11. Sentry Integration

Первая версия:

* unresolved issues count;
* critical issues;
* last error timestamp;
* project health signal.

Developer Control Panel показывает краткую сводку.

Для детальной диагностики можно переходить непосредственно в Sentry.

---

## 12. Supabase Integration

Нужно разделять:

```text
Platform Supabase
```

и:

```text
Client Project Supabase
```

Platform Supabase хранит собственные данные нашей системы.

Client Supabase integration получает технические данные конкретного клиентского проекта.

Первая версия может показывать:

* connection status;
* database availability;
* storage availability;
* базовые service health данные.

Не нужно пытаться строить полноценный аналог Supabase Dashboard.

---

## 13. PostHog Integration

PostHog является необязательной интеграцией.

Первая версия может предоставлять:

* базовое количество пользователей/сессий;
* основные product events;
* дату последнего поступления analytics data.

Если PostHog не подключён, остальная платформа должна работать без него.

---

## 14. CMS Architecture

Client CMS является частью платформы, но не должна быть жёстко привязана к конкретной отрасли.

Developer CMS и Client CMS не являются двумя реализациями. Это один CMS engine с:

```text
одними editors
+
одной validation
+
разными layouts / permissions
```

Различается представление и доступ, а не бизнес-логика CMS.

Нельзя строить core вокруг:

```text
services
masters
certificates
haircuts
```

Вместо этого используется концепция:

```text
ContentModule
↓
Fields
↓
ContentEntries
```

Например проект салона может определить:

```text
services
masters
portfolio
offers
contacts
```

а другой проект:

```text
products
team
cases
vacancies
```

Платформа предоставляет общий механизм работы с этими сущностями.

---

## 15. Content Module

ContentModule описывает структуру управляемого контента.

Например:

```text
module_key: "services"
name: "Услуги"
```

и набор полей:

```text
name
price
duration
image
is_active
sort_order
```

Типы полей первой версии могут включать:

```text
text
textarea
number
boolean
image
select
date
url
```

Не нужно сразу строить универсальную enterprise-CMS со сложным schema builder.

Первая версия должна поддерживать только реально необходимые типы данных.

Schema в MVP задаётся через seed, config или developer-only configuration. Интерфейс
визуального schema builder не является частью первой версии.

---

## 16. Источник истины контента и связь с клиентским сайтом

Это один из ключевых архитектурных вопросов.

Для MVP фиксируется единственный источник истины:

> Контент, которым управляет Client CMS, хранится в Platform Database и является canonical source.

Поток данных:

```text
Client CMS
    ↓
Platform Database
    ↓
CMS Contract v1 / API adapter
    ↓
Existing Client Website
```

Существующий сайт не создаётся и не получает новый дизайн. Для подключения требуется
небольшая одноразовая интеграция, если управляемый бизнес-контент сайта переведён на
стабильный CMS Contract.

Не строим двустороннюю синхронизацию между несколькими CMS, Supabase клиента и Platform DB:

```text
CMS ↔ Client Supabase ↔ другая CMS ↔ Platform DB
```

Клиентский сайт получает необходимый контент через стабильный versioned contract.

Главное требование:

> Обновление платформы не должно требовать ручного переписывания всех подключённых сайтов.

---

## 17. Developer Control Panel

Для каждого проекта developer получает единый технический экран.

Пример структуры:

```text
Overview
Content
Health
Deployments
Errors
Analytics
Database
Storage
Users
Integrations
Audit
Settings
```

В первой версии часть разделов может быть read-only.

Цель Developer Control Panel:

> Быстро понять состояние проекта и перейти к нужному действию.

---

## 18. Multi-project Dashboard

Главный экран developer'а должен быть ориентирован не на список проектов, а на приоритет внимания.

Пример:

```text
NEEDS ATTENTION

Project A
Deploy failed

Project B
Critical errors detected


HEALTHY

Project C
Project D
Project E
```

Dashboard агрегирует:

* health;
* deployments;
* errors;
* integration states;
* последние проверки.

Основной вопрос, на который он отвечает:

> Какой проект сейчас требует моего внимания?

---

## 19. Project Health

Project Health собирает несколько сигналов в единое состояние проекта.

Минимальные проверки MVP:

```text
HTTP availability
SSL validity
Deployment status
Critical errors
Integration freshness
```

Внутренний статус проекта:

```text
healthy
warning
critical
unknown
```

Не нужно сразу строить сложную систему synthetic monitoring.

В дальнейшем могут появиться:

* forms;
* booking;
* checkout;
* Playwright flows;
* analytics anomalies;
* performance regressions.

Но они не входят в базовую архитектурную необходимость MVP.

Project Health и Integration Health разделены. Недоступность отдельного provider может
дать `warning` для Project Health, но не означает автоматически, что сам сайт сломан.

---

## 20. Audit Log

Audit должен быть частью core.

Минимальная запись:

```text
id
organization_id
project_id
user_id
action
entity_type
entity_id
timestamp
metadata
```

Пример:

```text
User: client@example.com
Project: Assol
Action: content.update
Entity: service
Entity ID: service-123
Time: 2026-08-27T14:20:00Z
```

Audit не должен хранить:

* passwords;
* access tokens;
* секреты;
* чувствительные payload целиком.

---

## 21. Media Architecture

Media рассматривается как отдельный reusable module.

Основные задачи:

* upload;
* validation;
* replace;
* delete;
* metadata;
* orphan detection.

Должны учитываться уже известные edge cases:

* JPEG;
* PNG;
* WebP;
* HEIC;
* HEIF;
* неправильный MIME;
* magic bytes;
* iPhone Photos;
* file size limits.

MediaAsset хранит metadata, а сами файлы могут находиться во внешнем object storage.

Storage provider не должен быть навсегда зашит в core.

---

## 22. Security Boundaries

Основные границы доверия:

```text
Browser
↓
Next.js Server
↓
Platform Database
↓
External Integrations
```

Browser считается недоверенной средой.

Проверки permissions никогда не должны полагаться только на UI.

Все критические действия проходят server-side authorization.

Multi-tenant data дополнительно защищаются через RLS.

Secrets внешних сервисов никогда не передаются клиенту.

---

## 23. Secrets

Секреты интеграций:

* не хранятся в frontend;
* не записываются в audit;
* не отправляются в analytics;
* не выводятся в logs.

Необходимо хранить только минимально необходимые credentials/scopes.

Стратегия secret storage подробно описывается отдельно в `SECURITY_MODEL.md`.

---

## 24. Platform Core и Project-specific Logic

Жёстко разделяем:

```text
PLATFORM CORE
```

и:

```text
PROJECT SPECIFIC
```

Platform Core:

* auth;
* tenancy;
* permissions;
* projects;
* integrations;
* health;
* CMS engine;
* media;
* audit.

Project Specific:

* набор content modules;
* поля;
* бизнес-правила;
* специфичные integrations;
* внешний дизайн клиентского сайта.

Главное правило:

> Уникальная потребность одного клиента не должна автоматически становиться частью Platform Core.

---

## 25. Versioning

Platform Core должен иметь независимую версию.

Например:

```text
platform-core 1.0.0
cms-contract 1.0
```

Связь клиентских сайтов с платформой должна иметь стабильный versioned contract.

Пример:

```text
/api/v1/content
/api/v1/project-health
```

Breaking changes должны приводить к новой версии контракта, а не молча ломать старые проекты.

Подробнее стратегия описывается в `VERSIONING_STRATEGY.md`.

---

## 26. Deployment Model

Первая версия платформы:

```text
Next.js
↓
Vercel

Supabase
↓
PostgreSQL / Auth / RLS
```

Client projects могут быть размещены независимо от самой платформы.

Платформа не должна требовать, чтобы клиентский сайт обязательно находился на том же hosting provider.

Первая версия может быть лучше оптимизирована под определённый стек, но архитектурно клиентский сайт остаётся отдельным приложением.

---

## 27. Background Jobs

Некоторые операции нельзя выполнять только по пользовательскому запросу.

Например:

* periodic health checks;
* sync deployment status;
* sync Sentry data;
* expired SSL checks;
* stale integration checks.

Поэтому архитектура должна предусматривать background jobs / scheduled tasks.

На первой версии допускается простой механизм планировщика.

Не нужно сразу строить сложную distributed queue infrastructure.

---

## 28. Cached / Normalized Integration Data

Dashboard не должен при каждом открытии выполнять запросы сразу в пять внешних API для каждого проекта.

Лучше:

```text
External API
↓
Background Sync
↓
Normalized Platform Data
↓
Dashboard
```

Это:

* ускоряет UI;
* уменьшает API usage;
* позволяет хранить историю;
* позволяет работать при временной недоступности provider'а.

Для данных хранится `last_synced_at`.

---

## 29. Failure Isolation

Ошибка одной интеграции не должна ломать весь проект или dashboard.

Например:

```text
GitHub       healthy
Vercel       healthy
Sentry       unavailable
Supabase     healthy
```

Project Health может показать warning, но остальные данные остаются доступны.

Внешние integrations считаются потенциально нестабильными зависимостями.

---

## 30. Non-functional Requirements

Первая версия должна соблюдать следующие принципы:

### Security

Tenant isolation и permissions являются обязательными.

### Reliability

Отказ внешнего provider не должен приводить к отказу всей платформы.

### Simplicity

Не строить инфраструктуру для масштаба, которого пока нет.

### Modularity

Интеграции и CMS modules должны быть отделены от core.

### Observability

Ошибки самой платформы должны отслеживаться.

### Recoverability

Должны существовать понятные backup / restore / rollback сценарии.

### Performance

Multi-project dashboard не должен зависеть от десятков synchronous внешних API-вызовов.

### Maintainability

Архитектура должна оставаться понятной одному разработчику и небольшой команде.

---

## 31. Основные архитектурные ограничения MVP

В первой версии сознательно принимаются следующие ограничения:

* ограниченное количество provider integrations;
* ограниченный набор CMS field types;
* две основные роли;
* отсутствие сложной team hierarchy;
* отсутствие AI;
* отсутствие billing;
* отсутствие marketplace;
* отсутствие универсального visual page builder;
* отсутствие собственного hosting;
* отсутствие сложной event-driven infrastructure.

---

## 32. Главный архитектурный принцип

Архитектура должна оставаться настолько простой, насколько возможно, пока это не мешает:

* безопасности;
* tenant isolation;
* развитию core;
* подключению нескольких проектов;
* смене внешних providers.

При выборе между «идеальной универсальной архитектурой» и простой архитектурой, которая безопасно решает текущий MVP, предпочтение отдаётся второй.
