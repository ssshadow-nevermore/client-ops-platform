# VERSIONING_STRATEGY.md

## 1. Цель

Versioning Strategy описывает, как обновлять платформу, CMS-модули и интеграционный контракт с клиентскими сайтами так, чтобы:

* обновление платформы не ломало подключённые проекты;
* старые проекты могли продолжать работать;
* изменения можно было внедрять постепенно;
* breaking changes были контролируемыми;
* существовала возможность rollback;
* не возникала ситуация, когда десятки сайтов приходится обновлять вручную.

Главный принцип:

> Платформа, CMS contract и клиентский сайт должны иметь независимые версии и не зависеть от полного совпадения кода.

---

## 2. Что версионируется отдельно

Минимально разделяем:

```text
Platform Core
CMS Contract
Integration Providers
Database Schema
Client Project Adapter
```

Не считаем всю систему одной единственной версией.

---

## 3. Platform Core Version

Основная платформа имеет собственную версию.

Пример:

```text
platform-core 1.0.0
```

Используем Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

### PATCH

Исправления без изменения публичного поведения.

Например:

```text
1.0.0
→
1.0.1
```

Примеры:

* bug fix;
* security fix;
* исправление UI;
* внутренний refactor без breaking changes.

### MINOR

Новая обратно совместимая функциональность.

```text
1.0.0
→
1.1.0
```

Например:

* новый health signal;
* новый optional provider;
* новый тип CMS field;
* новая страница Developer Control Panel.

### MAJOR

Breaking changes.

```text
1.x
→
2.0.0
```

Требует отдельной migration strategy и периода совместимости.

---

## 4. CMS Contract Version

Связь платформы с клиентским сайтом должна иметь независимую версию.

Например:

```text
cms-contract v1
```

Клиентский сайт работает не с внутренними таблицами платформы, а со стабильным contract.

Для MVP контент, которым управляет Client CMS, хранится в Platform Database и является
единственным canonical source. Client Supabase или другая CMS не участвуют в отдельной
двусторонней синхронизации.

Пример:

```text
/api/v1/content
/api/v1/media
```

В будущем:

```text
/api/v2/content
```

Появление v2 не должно автоматически отключать v1.

---

## 5. Почему contract важнее внутренней структуры

Клиентский сайт не должен знать:

* структуру внутренних таблиц;
* названия внутренних сервисов;
* детали Supabase;
* внутреннюю архитектуру платформы.

Он должен зависеть только от стабильного контракта.

Пример:

```text
Client Website
↓
CMS Contract v1
↓
Platform
```

Внутри платформы при этом можно менять:

* database schema;
* storage provider;
* implementation;
* caching;
* background jobs.

Пока контракт v1 сохраняется, сайт продолжает работать.

---

## 6. Client Project Adapter

Для подключения существующего сайта может использоваться небольшой adapter/SDK.

Это одноразовая интеграция существующего сайта с Platform CMS API, а не требование
пересобрать сайт или изменить его дизайн.

Например:

```text
@platform/client
```

У него тоже есть собственная версия:

```text
@platform/client 1.3.0
```

Adapter должен быть максимально небольшим и стабильным.

Его задача:

* authentication with platform;
* получение content;
* media URLs;
* contract parsing;
* error handling.

Не переносить внутрь adapter бизнес-логику всей платформы.

---

## 7. Совместимость

Для каждого contract version должна быть определена compatibility matrix.

Пример:

| Platform | CMS Contract | Client Adapter |
| -------- | ------------ | -------------- |
| 1.x      | v1           | 1.x            |
| 2.x      | v1, v2       | 1.x, 2.x       |
| 3.x      | v2           | 2.x            |

Это позволяет заранее понимать, какие комбинации поддерживаются.

---

## 8. Backward Compatibility

Предпочтительный подход:

```text
Additive changes
>
Breaking changes
```

Лучше добавить optional field, чем переименовать существующий.

Например вместо:

```text
price
→
amount
```

лучше временно поддерживать оба либо вводить новую версию contract.

---

## 9. Deprecation

Если API или contract устаревает:

```text
active
↓
deprecated
↓
scheduled for removal
↓
removed
```

Нельзя удалять старый contract внезапно.

Для deprecated версии должна быть известна:

* дата объявления;
* причина;
* replacement;
* срок поддержки;
* migration guide.

---

## 10. Database Migrations

Изменения схемы БД проходят только через migrations.

Не допускается ручное изменение production schema без фиксации migration.

Пример:

```text
migrations/
  001_initial.sql
  002_add_health_incidents.sql
  003_add_permissions.sql
```

Каждая migration должна:

* быть воспроизводимой;
* иметь порядок;
* быть протестирована;
* по возможности быть backward compatible.

---

## 11. Expand and Contract

Для потенциально breaking изменений БД используем подход:

```text
EXPAND
↓
MIGRATE
↓
SWITCH
↓
CONTRACT
```

Пример: хотим заменить поле:

```text
name
```

на:

```text
display_name
```

Не удаляем `name` сразу.

### Expand

Добавляем:

```text
display_name
```

### Migrate

Заполняем новое поле.

### Switch

Новый код использует `display_name`.

### Contract

Старое поле удаляется только после периода совместимости.

---

## 12. Content Schema Versioning

ContentModule может меняться со временем.

Например:

```text
services v1
↓
services v2
```

Изменения могут включать:

* новое поле;
* изменение validation;
* новый field type;
* изменение required status.

Каждая schema должна иметь version.

Пример:

```text
schema_version = 3
```

---

## 13. Safe CMS Changes

Добавление optional field обычно считается безопасным.

Пример:

```text
subtitle?: string
```

Breaking changes:

* удаление field;
* изменение его типа;
* изменение значения semantics;
* превращение optional в required без migration.

Такие изменения должны сопровождаться migration.

---

## 14. Provider Versioning

Внешние provider API могут меняться независимо от нас.

Каждый adapter должен скрывать эти изменения от Platform Core.

Например:

```text
Vercel API changes
↓
update VercelProvider
↓
Platform normalized model unchanged
```

Поэтому provider-specific API version не должна распространяться на всю систему.

---

## 15. Integration Contract

Platform Core должен работать с нормализованными моделями.

Например:

```text
DeploymentStatus
```

не должен зависеть от конкретной версии Vercel API.

Если provider меняет response:

```text
VercelProvider
```

адаптируется, но остальные части системы не меняются.

---

## 16. Release Channels

В будущем можно использовать:

```text
stable
beta
```

MVP может использовать только:

```text
stable
```

Beta добавляется только когда появится необходимость тестировать новые возможности на части собственных проектов.

---

## 17. Staged Rollout

Новые platform changes не должны сразу применяться ко всем проектам, если они потенциально рискованные.

Пример:

```text
internal project
↓
1 test client project
↓
small group
↓
all projects
```

Для первых версий это может выполняться вручную.

Не нужна сложная rollout infrastructure.

---

## 18. Feature Flags

Для рискованных или незавершённых функций допускаются feature flags.

Например:

```text
new_project_health_v2
```

Feature flag не должен превращаться в постоянный мусор.

После полного rollout:

* flag удаляется;
* старый код удаляется.

---

## 19. Rollback

Каждый production release должен иметь понятный rollback path.

Минимально:

* предыдущая application version;
* database migration state;
* deployment history;
* backup.

Принцип:

```text
release
↓
problem detected
↓
rollback
↓
verify
```

Rollback должен быть протестируемым сценарием, а не теоретической возможностью.

---

## 20. Database Rollback

Не все database migrations безопасно откатывать автоматически.

Поэтому migrations делятся на:

* reversible;
* non-reversible.

Для destructive migrations до выполнения нужен backup.

В некоторых случаях лучше сделать forward-fix, чем unsafe rollback.

---

## 21. Content Rollback

Audit Log не является полноценным backup.

Для значимых CMS changes в будущем можно хранить revision history.

Например:

```text
ContentEntry
↓
ContentRevision
```

Но полноценная revision system не обязательна для самого первого MVP.

---

## 22. Media Versioning

Замена изображения не должна сразу уничтожать возможность восстановления предыдущего файла, если это создаёт риск потери данных.

На ранней версии можно использовать:

* delayed deletion;
* soft delete;
* temporary retention.

Это особенно полезно для клиентских ошибок.

---

## 23. API Versioning

Public/internal integration contract желательно versioned через URL или explicit version header.

Простой вариант:

```text
/api/v1/
```

Для MVP этого достаточно.

Нельзя создавать новую API version для каждого minor change.

---

## 24. Webhook Versioning

Webhook payload также считается contract.

Он должен иметь:

```text
event_type
event_version
```

Например:

```text
content.updated
version: 1
```

Это позволит развивать events без неожиданного breaking поведения.

---

## 25. Breaking Change Checklist

Перед breaking change нужно ответить:

1. Какие проекты будут затронуты?
2. Какие версии сейчас используются?
3. Можно ли сделать изменение additive?
4. Нужна ли migration?
5. Нужен ли compatibility period?
6. Есть ли rollback?
7. Проверено ли изменение на реальном проекте?

---

## 26. Project Compatibility Status

Developer Control Panel в будущем может показывать:

```text
Platform compatibility
● Up to date
```

или:

```text
⚠ Adapter update recommended
```

или:

```text
⚠ Deprecated CMS contract v1
```

Это позволит заранее видеть технический долг по проектам.

---

## 27. Не обновлять проекты молча

Потенциально breaking клиентские adapters или integrations нельзя обновлять скрытно без контроля.

Developer должен иметь возможность понять:

* что обновилось;
* что изменилось;
* какие проекты затронуты.

---

## 28. Release Notes

Для значимых версий Platform Core вести release notes.

Минимально:

```text
Added
Changed
Fixed
Security
Deprecated
```

Особенно важны:

* breaking changes;
* migration steps;
* security fixes.

---

## 29. Security Releases

Критические security fixes имеют приоритет над обычным release cycle.

Если уязвимость затрагивает:

* authentication;
* tenant isolation;
* credentials;
* authorization;

обновление должно происходить максимально быстро.

При этом rollout всё равно должен быть проверен.

---

## 30. Starter Versioning

Если в будущем существуют reusable starters, их versioning не должен быть основным механизмом обновления production-проектов.

Starter нужен в момент создания проекта.

После этого проект должен зависеть от стабильных contracts/modules, а не от постоянного сравнения с template repository.

Иначе возникает:

```text
starter v1
↓
копия
↓
клиентские изменения
↓
starter v5
↓
невозможно нормально merge
```

Этого следует избегать.

---

## 31. Shared Packages

Повторяемую логику, которую нужно обновлять между проектами, предпочтительно переносить в versioned packages.

Например:

```text
@platform/client
@platform/media
@platform/contracts
```

Но package extraction должен происходить только для реально повторяемого кода.

Не создавать десятки packages заранее.

---

## 32. Platform-owned vs Project-owned Code

Platform-owned:

* contracts;
* adapters;
* shared client SDK;
* integration logic;
* platform core.

Project-owned:

* дизайн;
* project-specific business rules;
* custom components;
* unique integrations.

Platform update не должен переписывать project-owned code.

---

## 33. Compatibility Tests

Перед выпуском contract/client-adapter изменений нужны автоматические compatibility tests.

Минимально:

```text
current platform
+
old supported adapter
```

и:

```text
current platform
+
current adapter
```

Если поддерживаются несколько contract versions — тестируются все поддерживаемые.

---

## 34. Dogfooding

Все значимые versioning decisions сначала проверяются на собственных проектах.

Нельзя считать migration strategy рабочей, пока она не была реально применена хотя бы к одному существующему проекту.

---

## 35. MVP Versioning Scope

На первой версии достаточно:

* Semantic Versioning для Platform Core;
* `/api/v1` для CMS contract;
* database migrations;
* versioned content schemas;
* compatibility metadata;
* tested rollback;
* release notes для значимых изменений.

Не нужны:

* сложные release channels;
* автоматический fleet-wide updater;
* enterprise migration orchestration;
* Canary infrastructure.

---

## 36. Главный критерий

Хорошая versioning strategy должна позволять сделать:

```text
Platform 1.0
↓
Platform 1.5
↓
Platform 2.0
```

не превращая каждый переход в ручную переделку всех клиентских сайтов.

---

## 37. Главный принцип

Клиентские проекты должны зависеть от стабильных contracts, а не от внутренних деталей платформы.

Если изменение Platform Core требует вручную открыть и переписать каждый подключённый сайт, значит граница между платформой и проектом спроектирована неправильно.
