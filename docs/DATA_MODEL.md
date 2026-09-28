# DATA_MODEL.md

## 1. Цель

Data Model описывает структуру данных платформы:

* пользователей;
* организаций;
* проектов;
* memberships;
* ролей и permissions;
* CMS;
* integrations;
* Project Health;
* media;
* audit.

Основные требования:

* строгая multi-tenant изоляция;
* все проектные данные имеют `project_id`;
* данные организации имеют `organization_id`;
* клиент одного проекта не может получить данные другого;
* структура должна оставаться достаточно простой для MVP;
* специфичные данные конкретного клиента не должны становиться отдельными core-таблицами.

---

# 2. Общая схема

```text
auth.users
    │
    ▼
profiles
    │
    ├──────────────┐
    ▼              ▼
organizations   organization_memberships
    │
    ▼
projects
    │
    ├── project_memberships
    ├── content_modules
    │      ├── content_fields
    │      └── content_entries
    │
    ├── media_assets
    ├── provider_connections
    ├── project_provider_links
    └── integration_snapshots
    │
    ├── project_health
    ├── health_checks
    ├── health_incidents
    └── audit_events
```

---

# 3. ID Strategy

Для основных сущностей используем UUID.

Пример:

```text
id UUID PRIMARY KEY
```

Причины:

* безопаснее для публичных идентификаторов;
* удобно генерировать;
* нет последовательного enumeration;
* хорошо поддерживается PostgreSQL/Supabase.

---

# 4. Общие поля

Большинство сущностей имеют:

```text
id
created_at
updated_at
```

Multi-tenant сущности дополнительно:

```text
organization_id
project_id
```

где это применимо.

Удаляемые сущности при необходимости могут использовать:

```text
deleted_at
```

для soft delete.

---

# 5. profiles

Supabase Auth хранит authentication identity в:

```text
auth.users
```

В нашей public schema создаём:

```text
profiles
```

Минимальные поля:

```text
id UUID PRIMARY KEY
```

где `id` соответствует `auth.users.id`.

Дополнительно:

```text
display_name
avatar_url
created_at
updated_at
```

Не хранить здесь:

* password;
* password hash;
* session tokens.

---

# 6. organizations

Организация — верхний tenant.

Она может представлять:

* solo-разработчика;
* студию;
* агентство.

Поля:

```text
id
name
slug
status
created_at
updated_at
```

Статусы:

```text
active
suspended
archived
```

На первом этапе один разработчик может иметь одну organization.

Но структура должна позволять иметь несколько.

---

# 7. organization_memberships

Связывает пользователя и организацию.

`OrganizationMembership` предназначен для внутренних пользователей владельца платформы,
студии или агентства. Он не является обязательным механизмом доступа клиента к проекту.

Поля:

```text
id
organization_id
user_id
role
status
created_at
updated_at
```

Начальные organization-level роли:

```text
OWNER
MEMBER
```

Для MVP может реально использоваться только:

```text
OWNER
```

Но membership всё равно создаём отдельно.

Статусы:

```text
active
invited
disabled
```

---

# 8. projects

Один проект = один клиентский веб-проект.

Поля:

```text
id
organization_id

name
slug

production_url
status

created_at
updated_at
archived_at
```

Статусы проекта:

```text
active
maintenance
archived
```

Техническое состояние проекта не хранится в `projects`. Источником истины для него
является отдельная таблица `project_health`, которая автоматически создаётся как
1:1 row при создании проекта.

Dashboard получает состояние через объединение:

```text
projects + project_health
```

`project_settings` создаётся при необходимости или одновременно с Project и не является
частью обязательной минимальной записи проекта.

---

# 9. project_memberships

Определяет доступ пользователя к конкретному проекту.

`ProjectMembership` — основной механизм доступа к клиентскому проекту. Клиент может
иметь `ProjectMembership` с ролью `CLIENT`, не являясь `OrganizationMember`.

Поля:

```text
id

organization_id
project_id
user_id

role_id

status

created_at
updated_at
```

Статусы:

```text
active
invited
disabled
```

Именно через эту сущность проверяется:

> Имеет ли пользователь доступ к Project X?

---

# 10. roles

Роль представляет набор permissions.

Поля:

```text
id
key
name
description
is_system
created_at
```

Системные роли MVP:

```text
CLIENT
DEVELOPER
```

Пример:

```text
key = "CLIENT"
```

или:

```text
key = "DEVELOPER"
```

---

# 11. permissions

Отдельный список возможных permissions.

Поля:

```text
id
key
description
```

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

---

# 12. role_permissions

Связывает:

```text
Role
↔
Permission
```

Поля:

```text
role_id
permission_id
```

Composite unique:

```text
(role_id, permission_id)
```

Таким образом permission model не зависит от frontend.

---

# 13. Почему role_id находится в project_memberships

Для MVP один пользователь получает одну основную роль внутри конкретного проекта:

```text
CLIENT
```

или:

```text
DEVELOPER
```

Это значительно упрощает систему.

Если позже понадобится:

```text
EDITOR
SEO
MANAGER
ANALYST
```

их можно добавить без изменения основной модели.

Если когда-нибудь понадобится несколько ролей одному membership — можно вынести отдельную связь:

```text
project_membership_roles
```

Но в MVP она не нужна.

---

# 14. content_modules

ContentModule описывает тип управляемого контента.

Например:

```text
services
masters
portfolio
offers
contacts
```

Но это уже configuration конкретного проекта.

Поля:

```text
id

organization_id
project_id

key
name
description

is_active
sort_order

schema_version

created_at
updated_at
```

Пример:

```text
key = "services"
name = "Услуги"
```

---

# 15. content_fields

Описывает поля ContentModule.

Пример:

```text
services
├── name
├── price
├── duration
├── image
└── is_active
```

Поля:

```text
id

organization_id
project_id
module_id

key
label

field_type

required
sort_order

config JSONB

created_at
updated_at
```

Поддерживаемые типы MVP:

```text
text
textarea
number
boolean
image
url
date
select
```

Дополнительные типы (`relation`, `list/repeater`, multi-media) вводятся только тогда,
когда они нужны первому реальному проекту. Архитектура `JSONB` должна позволять
добавлять их без изменения базовой модели.

Схема в MVP задаётся через seed, config или developer-only configuration. Пользовательский
schema builder с настройкой типов, validation, drag & drop и relations в первую версию
не входит.

`config JSONB` может хранить:

```text
min
max
placeholder
options
validation
```

Не нужно создавать отдельную таблицу под каждую настройку field.

---

# 16. content_entries

Конкретные записи ContentModule.

Например:

```text
services
↓
Женская стрижка
```

Поля:

```text
id

organization_id
project_id
module_id

data JSONB

status
sort_order

created_by
updated_by

created_at
updated_at
deleted_at
```

Статусы:

```text
draft
published
hidden
```

Пример `data`:

```json
{
  "name": "Женская стрижка",
  "price": 2500,
  "duration": "60 минут",
  "is_active": true
}
```

---

# 17. Почему content_entries использует JSONB

Мы не хотим создавать core-таблицы:

```text
services
masters
portfolio
offers
products
cases
vacancies
```

для каждой отрасли.

Вместо этого:

```text
ContentModule
+
ContentFields
+
ContentEntry.data
```

позволяют использовать один CMS engine для разных проектов.

---

# 18. Ограничения JSONB

JSONB не должен превращаться в бесконтрольное хранилище.

Каждый `data` должен валидироваться против:

```text
ContentModule
+
ContentFields
```

Перед сохранением server layer проверяет:

* существование поля;
* field type;
* required;
* validation;
* permissions.

Контент, которым управляет Client CMS, хранится в Platform Database и является
canonical source. Клиентский сайт получает его через `CMS Contract v1`; Supabase клиента
или другая внешняя CMS не являются альтернативным источником истины для этого контента.

---

# 19. media_assets

Metadata всех media.

Поля:

```text
id

organization_id
project_id

storage_provider
storage_key

original_filename
mime_type
file_size

width
height

status

created_by
created_at
updated_at
deleted_at
```

Статусы:

```text
active
processing
deleted
orphaned
```

При необходимости:

```text
checksum
```

для дедупликации или integrity.

---

# 20. Связь media с content

В `content_entries.data` image field может содержать:

```text
media_asset_id
```

а не arbitrary public URL.

Пример:

```json
{
  "image": {
    "media_asset_id": "uuid"
  }
}
```

Platform API уже резолвит корректный URL.

---

# 21. integrations foundation

`provider_connections` хранит organization-level connection metadata. Одна
connection может обслуживать несколько проектов через
`project_provider_links`.

## 21.1 provider_connections

Поля:

```text
id PRIMARY KEY
organization_id
provider
external_account_id
credential_ref UUID
status
created_at
updated_at
```

`provider` хранится в нормализованном lowercase-виде. Для одной организации
внешний provider account не дублируется.

---

## 21.2 project_provider_links

Связывает project с organization-level provider connection и external project.
Один проект имеет не более одной связи одного provider, а один external project
нельзя дважды связать с одной connection.

Поля:

```text
project_id
organization_id
connection_id
provider
external_project_id
external_project_name
created_at
updated_at
```

Tenant consistency обеспечивается composite foreign keys для project и connection.

---

# 22. credential_ref

Нельзя хранить plaintext token внутри `provider_connections` или любой другой
browser-readable сущности.

Вместо:

```text
access_token = "..."
```

храним UUID Vault secret:

```text
credential_ref
```

который указывает на защищённое secret storage.

В текущем репозитории `credential_ref` ссылается на UUID Supabase Vault secret.
Server-side resolver внутри Edge Function валидирует UUID и параметризованно читает
только `decrypted_secret` из `vault.decrypted_secrets`. При invalid/missing ref или
недоступном Vault provider adapter fail-closed возвращает безопасную ошибку; plaintext
token не попадает в обычные public tables или browser-readable data.

---

# 23. integration_snapshots

Хранит нормализованный результат последней синхронизации.

Поля:

```text
id

organization_id
project_id
integration_id

snapshot_type

status
data JSONB

captured_at
```

Примеры `snapshot_type`:

```text
repository
deployment
monitoring
database
analytics
```

---

# 24. Пример deployment snapshot

```json
{
  "status": "success",
  "environment": "production",
  "url": "https://example.com",
  "commit_sha": "abc123",
  "created_at": "..."
}
```

Platform Dashboard работает с нашим normalized snapshot, а не с raw Vercel response.

---

# 25. project_health

Одна актуальная запись на проект. Она автоматически создаётся trigger-ом при создании
Project и является источником истины для текущего технического состояния.

Поля:

```text
project_id PRIMARY KEY
organization_id
overall_status
http_status
ssl_status
deployment_status
critical_errors_status
integration_freshness_status
http_status_code
http_response_time_ms
ssl_expires_at
critical_error_count
last_checked_at
details JSONB
created_at
updated_at
```

Это быстрый summary для dashboard. Dashboard не читает health status из `projects`.

При подключённом Sentry `details.critical_errors` содержит только безопасный агрегат:

```text
provider
window = "24h"
issue_count
error_count
fatal_count
truncated
latest_seen_at
```

Заголовки, названия, сообщения, stack traces, culprit, user data и другие raw issue
поля в `project_health` не сохраняются. При provider failure статус Critical Errors
становится `unknown`, а устаревший `details.critical_errors` удаляется.

---

# 26. health_checks

Future history table; it is not part of the current implemented Health slice.

История отдельных проверок.

Поля:

```text
id

organization_id
project_id

check_type

status

response_time_ms

message
metadata JSONB

checked_at
```

`check_type`:

```text
http
ssl
deployment
errors
integration
```

Статус:

```text
passed
warning
failed
unknown
```

---

# 27. health_incidents

Future incident table; it is not part of the current implemented Health slice.

Отдельная сущность для проблем, требующих внимания.

Поля:

```text
id

organization_id
project_id

source
type
severity

title
description

status

first_seen_at
last_seen_at
resolved_at

created_at
updated_at
```

Severity:

```text
info
warning
critical
```

Status:

```text
open
acknowledged
resolved
```

---

# 28. Зачем health_incidents

HealthCheck отвечает:

> Что показала конкретная проверка?

HealthIncident отвечает:

> Есть ли проблема, которая требует внимания разработчика?

Пример:

```text
HealthCheck:
Vercel deploy failed

↓

HealthIncident:
Production deployment failed
Severity: critical
```

---

# 29. audit_events

Append-oriented audit log.

Поля:

```text
id

organization_id
project_id

user_id

action

entity_type
entity_id

result

metadata JSONB

created_at
```

Пример:

```text
action = "content.update"
entity_type = "content_entry"
entity_id = "..."
```

---

# 30. result audit event

```text
success
failed
denied
```

Security-sensitive отказ также можно фиксировать:

```text
integration.manage
→ denied
```

Но не следует превращать Audit Log в полный технический application log.

---

# 31. Audit metadata

Можно хранить:

```json
{
  "changed_fields": [
    "price",
    "duration"
  ]
}
```

Нельзя хранить:

* password;
* session;
* API token;
* authorization header;
* secret;
* полный чувствительный payload.

---

# 32. project_settings

Для project-level настроек можно использовать отдельную сущность:

```text
project_settings
```

Поля:

```text
project_id PRIMARY KEY
organization_id

timezone
locale

settings JSONB

updated_at
```

Не стоит добавлять десятки колонок в `projects`.

---

# 33. organization_settings

При необходимости:

```text
organization_settings
```

Поля:

```text
organization_id PRIMARY KEY

settings JSONB

updated_at
```

В MVP может почти не использоваться.

---

# 34. API / CMS Access

Если клиентский сайт получает content из Platform API, может понадобиться:

```text
project_api_credentials
```

Но эту сущность пока не фиксируем окончательно.

Перед реализацией нужно отдельно решить механизм:

```text
Client Website
↔
Platform
```

Возможные варианты:

* public project key + signed requests;
* server-to-server secret;
* SDK;
* Supabase-compatible access;
* scoped API token.

Это отдельное security decision.

---

# 35. Таблицы MVP

Минимальный набор таблиц первой рабочей версии:

```text
profiles

organizations
organization_memberships

projects
project_memberships

roles
permissions
role_permissions

content_modules
content_fields
content_entries

media_assets

provider_connections
project_provider_links
integration_snapshots

project_health
health_checks
health_incidents

audit_events
```

Дополнительно при необходимости:

```text
project_settings
organization_settings
```

---

# 36. Relationships

```text
Organization
1 ─── N Projects

Organization
1 ─── N OrganizationMemberships

Project
1 ─── N ProjectMemberships

User
1 ─── N ProjectMemberships

Role
1 ─── N ProjectMemberships

Role
N ─── N Permissions

Project
1 ─── N ContentModules

ContentModule
1 ─── N ContentFields

ContentModule
1 ─── N ContentEntries

Project
1 ─── N MediaAssets

Organization
1 ─── N ProviderConnections

ProviderConnection
1 ─── N ProjectProviderLinks

Project
1 ─── N ProjectProviderLinks

IntegrationSnapshot
belongs to a future normalized integration history model

Project
1 ─── 1 ProjectHealth

Project
1 ─── N HealthChecks

Project
1 ─── N HealthIncidents

Project
1 ─── N AuditEvents
```

---

# 37. Delete Rules

Удаление organization не должно происходить обычной кнопкой.

Для Projects предпочтительно:

```text
archive
```

вместо немедленного hard delete.

Для ContentEntry:

```text
soft delete
```

может использовать `deleted_at`.

Media также желательно не удалять физически мгновенно.

Membership можно disable вместо удаления, если audit важен.

---

# 38. Foreign Keys

Все реальные связи должны иметь PostgreSQL foreign keys.

Пример:

```text
projects.organization_id
→ organizations.id
```

Нельзя полагаться только на UUID, записанный в колонке без FK.

---

# 39. Cascades

Не использовать массово:

```text
ON DELETE CASCADE
```

без анализа blast radius.

Особенно:

* organizations;
* projects;
* users.

Для критичных сущностей предпочтительнее:

```text
RESTRICT
```

или controlled soft-delete flow.

---

# 40. Indexes

Минимально индексируем:

```text
organization_id
project_id
user_id
module_id
integration_id
created_at
status
```

Особенно важны composite indexes для tenant queries.

Например:

```text
(project_id, status)
```

или:

```text
(project_id, created_at)
```

---

# 41. Unique Constraints

Примеры:

```text
organizations.slug
```

может быть unique.

Для module key:

```text
UNIQUE(project_id, key)
```

Для membership:

```text
UNIQUE(project_id, user_id)
```

Для roles:

```text
roles.key
```

system roles должны быть unique.

---

# 42. Time

Все timestamps храним как:

```text
TIMESTAMPTZ
```

в UTC.

UI отображает время с учётом project/user timezone.

---

# 43. Money

Если CMS содержит деньги, не хранить их как floating point.

Использовать:

```text
integer minor units
```

например:

```text
250000
```

для 2500.00 ₽

или PostgreSQL `NUMERIC`, если конкретный модуль действительно требует decimal.

Поскольку generic content сейчас хранится в JSONB, правила money fields должны задаваться схемой field.

---

# 44. JSONB Usage

JSONB разрешается для:

* content entry values;
* field configuration;
* normalized provider snapshots;
* safe audit metadata;
* flexible project settings.

JSONB не заменяет:

* relationships;
* tenancy;
* memberships;
* users;
* roles;
* integrations;
* health incidents.

Core relations остаются нормализованными.

---

# 45. RLS Context

Основные таблицы, требующие RLS:

```text
organizations
organization_memberships

projects
project_memberships

content_modules
content_fields
content_entries

media_assets

integrations
integration_snapshots

project_health
health_checks
health_incidents

audit_events
```

Доступ всегда определяется через current authenticated user и memberships.

---

# 46. Service Role

Supabase `service_role` никогда не передаётся frontend.

Background jobs могут использовать elevated server-side credentials только там, где это действительно необходимо.

После elevated operation всё равно должна проверяться принадлежность project/organization в application logic.

---

# 47. Current Snapshot vs History

Для dashboard храним быстрый current state:

```text
project_health
```

Для истории:

```text
health_checks
integration_snapshots
health_incidents
```

Это позволяет не пересчитывать dashboard из миллионов historical events.

---

# 48. Data Retention

Не нужно хранить историю бесконечно.

Например в будущем:

```text
health_checks
→ 90 days

integration snapshots
→ limited history

audit events
→ significantly longer
```

Конкретные сроки определяются позже.

---

# 49. Backup Priority

Критичность:

```text
HIGH
organizations
projects
memberships
content
audit
integration metadata
```

Media-файлы резервируются через storage strategy.

Transient health snapshots имеют меньшую критичность.

---

# 50. Что не моделируем сейчас

MVP Data Model пока не включает:

* billing;
* subscriptions;
* invoices;
* agency reseller model;
* white-label;
* AI actions;
* marketplace;
* plugin system;
* enterprise teams;
* custom roles editor;
* notification engine;
* complex workflow engine;
* full content revision history;
* deployment actions;
* DNS management.

Если функция отсутствует в MVP, таблицу под неё заранее не создаём.

---

# 51. Главное правило

Перед добавлением новой таблицы задаём вопрос:

> Это универсальная сущность Platform Core или специфичная потребность одного проекта?

Если это client-specific business entity, предпочтительно использовать:

```text
ContentModule
+
ContentEntry
```

а не расширять core новой таблицей.

---

# 52. Итоговая модель MVP

```text
IDENTITY
├── auth.users
└── profiles

TENANCY
├── organizations
├── organization_memberships
├── projects
└── project_memberships

AUTHORIZATION
├── roles
├── permissions
└── role_permissions

CMS
├── content_modules
├── content_fields
├── content_entries
└── media_assets

INTEGRATIONS
├── provider_connections
├── project_provider_links
└── integration_snapshots

HEALTH
├── project_health
├── health_checks
└── health_incidents

AUDIT
└── audit_events
```

Эта структура является стартовой моделью.

Перед созданием migrations она должна пройти отдельный review:

* tenant isolation;
* RLS feasibility;
* query patterns;
* indexing;
* deletion rules;
* integration credential strategy.
