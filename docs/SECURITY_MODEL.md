# SECURITY_MODEL.md

## 1. Цель

Security Model описывает, как платформа защищает:

* аккаунты пользователей;
* данные организаций;
* данные проектов;
* клиентский контент;
* интеграции;
* секреты;
* audit history;
* доступ между tenant'ами.

Главный принцип:

> Ни один пользователь не должен получать больше доступа, чем ему необходимо для выполнения своей роли.

---

## 2. Основные security principles

Система должна строиться вокруг следующих принципов:

* least privilege;
* deny by default;
* server-side authorization;
* tenant isolation;
* secure secret storage;
* short-lived sessions where possible;
* MFA для разработчиков;
* auditability;
* fail closed;
* minimum required scopes для integrations;
* отсутствие чувствительных данных в логах и analytics.

---

## 3. Trust Boundaries

Основные границы доверия:

```text
Browser
↓
Next.js Server
↓
Supabase / Platform Database
↓
External Integrations
```

Browser считается недоверенной средой.

Нельзя доверять:

* role из frontend state;
* project_id, переданному клиентом;
* hidden UI elements;
* localStorage;
* client-side permission checks.

Все критические проверки выполняются на сервере и дополнительно защищаются RLS.

### Current Project Health request flow

```text
Health UI
→ authenticated server action
→ Edge Function with user JWT
→ auth.getUser
→ RLS + health.read authorization
→ production_url
→ SSRF/DNS validation
→ controlled HTTP request
→ service-role controlled project_health write
→ RLS read by UI
```

Вызов из Next.js выполняется через authenticated server-side Supabase client. SDK
передаёт текущий user JWT в Edge Function; access token не передаётся в browser
JavaScript. `service role` создаётся и используется только внутри Edge Function для
контролируемой записи после authentication, RLS и `health.read` authorization. Он не
используется для authorization и не попадает в browser.

`project_health` остаётся единственным canonical source для текущего Health snapshot.
Пока реализован только HTTP signal, `overall_status` после проверки остаётся
`unknown`, даже если HTTP healthy. Redirect targets проходят повторную validation;
localhost, private/reserved IP и internal hostnames отклоняются. Проверка снижает
SSRF-риск, но не заявляет абсолютную DNS-rebinding immunity, поскольку стандартный
`fetch` выполняет собственное DNS connection resolution. Browser direct writes в
`project_health` запрещены.

---

## 4. Authentication

Первая версия использует Supabase Auth.

Поддерживаем:

* email/password;
* безопасные server-side sessions;
* logout;
* session expiration;
* password reset через провайдера auth.

Для developer accounts рекомендуется обязательный MFA.

В дальнейшем предпочтительны:

* TOTP;
* passkeys;
* hardware-backed authentication.

---

## 5. User Types

На первой версии:

```text
CLIENT
DEVELOPER
```

Но security model строится вокруг permissions, а не только роли.

Role является набором permissions.

---

## 6. CLIENT

CLIENT имеет доступ только к конкретным проектам, которые ему назначены.

Пример разрешений:

```text
project.read

content.read
content.write

media.read
media.write

profile.read
```

По умолчанию CLIENT не имеет:

```text
health.read
deploy.read
errors.read
analytics.read
integrations.read
integrations.manage
users.manage
audit.read
settings.write
```

Конкретному проекту могут выдаваться дополнительные права.

---

## 7. DEVELOPER

DEVELOPER имеет расширенные технические permissions.

Например:

```text
project.read

content.*
media.*

health.read
deploy.read
errors.read
analytics.read

integrations.read
integrations.manage

users.read
users.manage

audit.read

settings.read
settings.write
```

Даже DEVELOPER не должен автоматически иметь доступ ко всем организациям платформы.

Доступ ограничивается membership.

---

## 8. Membership Model

Доступ пользователя определяется membership, но уровни доступа разделены:

```text
OrganizationMembership
→ внутренние пользователи владельца платформы/агентства

ProjectMembership
→ доступ к конкретному клиентскому проекту
```

CLIENT не обязан иметь `OrganizationMembership`. Для клиента основным механизмом
авторизации является активный `ProjectMembership`.

Минимально:

```text
user_id
organization_id
project_id
role_id
status
```

Существуют две отдельные сущности:

```text
OrganizationMembership
ProjectMembership
```

Пользователь получает доступ только через активную membership.

Удаление membership должно немедленно закрывать дальнейший доступ.

---

## 9. Tenant Isolation

Tenant isolation — критическое требование.

Данные разных организаций и проектов должны быть логически изолированы.

Пример:

```text
Organization A
├── Project A1
└── Project A2

Organization B
└── Project B1
```

Пользователь Project A1 никогда не должен получить данные Project B1.

Даже если он вручную изменит:

```text
/project/A1
```

на:

```text
/project/B1
```

сервер и БД должны отказать в доступе.

---

## 10. Row Level Security

Multi-tenant таблицы должны использовать Supabase RLS.

RLS должна учитывать:

* текущего authenticated user;
* membership;
* organization_id;
* project_id;
* необходимые permissions.

Принцип:

```text
SELECT
WHERE user has access to project
```

и отдельно:

```text
INSERT / UPDATE / DELETE
WHERE user has corresponding permission
```

RLS нельзя отключать ради удобства frontend.

---

## 11. Server-side Authorization

RLS не заменяет application authorization полностью.

Перед критическими действиями Next.js server layer должен проверять:

```text
authenticated?
↓
membership active?
↓
project accessible?
↓
permission granted?
↓
action allowed?
```

Только после этого выполняется действие.

---

## 12. Permission Checks

Не размазывать проверки по приложению.

Желательно иметь общий authorization API.

Например:

```text
can(user, "content.write", projectId)
```

или:

```text
requirePermission(
  user,
  projectId,
  "integrations.manage"
)
```

UI может использовать те же permission definitions для отображения элементов, но UI никогда не является единственной защитой.

---

## 13. Sensitive Operations

Отдельно считаются чувствительными:

* управление users;
* управление permissions;
* подключение integrations;
* изменение secrets;
* удаление проекта;
* удаление большого объёма content;
* изменение технических settings;
* disconnect provider;
* будущие deploy actions.

Для них могут потребоваться:

* повторное подтверждение;
* MFA;
* explicit confirmation;
* audit event.

---

## 14. Sessions

Session должна:

* храниться безопасно;
* иметь срок действия;
* корректно инвалидироваться;
* не быть доступной JavaScript, если используется cookie-based flow;
* использовать Secure;
* использовать HttpOnly;
* использовать подходящий SameSite.

После изменения password или критического security-события желательно инвалидировать существующие sessions.

---

## 15. CSRF

Если используются cookie-based sessions, state-changing requests должны быть защищены от CSRF.

Минимально:

* SameSite;
* Origin checking;
* server-side action verification.

Не полагаться только на скрытые формы или frontend logic.

---

## 16. XSS

Client content считается недоверенным.

При выводе:

* не использовать raw HTML без необходимости;
* sanitise разрешённый rich text;
* экранировать пользовательские данные;
* осторожно работать с markdown/html editors.

Client CMS не должна позволять CLIENT вставлять произвольный executable HTML/JS в сайт.

---

## 17. SQL Injection

Использовать:

* Supabase query builder;
* parameterized queries;
* prepared statements.

Не строить SQL через строковую конкатенацию пользовательских данных.

---

## 18. File Upload Security

Media upload требует отдельной валидации.

Проверяется:

* file size;
* declared MIME;
* magic bytes;
* разрешённые форматы;
* extension;
* декодируемость изображения, если применимо.

Нельзя доверять только:

```text
file.name
file.type
```

Поддерживаемые image-типы MVP определяются отдельно.

Из нынешнего опыта необходимо учитывать:

* JPEG;
* PNG;
* WebP;
* HEIC;
* HEIF;
* MIME mismatch;
* iPhone Photos edge cases.

---

## 19. Media Isolation

MediaAsset всегда должен иметь принадлежность:

```text
organization_id
project_id
```

Нельзя позволять пользователю получить media другого проекта только по storage key.

Если используются signed URLs, они должны иметь ограниченный lifetime.

---

## 20. Secret Management

Секретами считаются:

* API tokens;
* OAuth refresh tokens;
* access tokens;
* service credentials;
* private keys;
* webhook secrets.

Секреты:

* не отображаются после сохранения полностью;
* не передаются frontend без необходимости;
* не пишутся в audit;
* не пишутся в logs;
* не отправляются в Sentry/PostHog;
* не хранятся в Git.

---

## 21. Integration Credentials

Для каждого provider необходимо использовать минимальный набор scopes.

Например, если для GitHub достаточно read-only доступа:

```text
repo:read
```

не запрашиваем write/delete permissions.

Для первой версии integrations предпочтительно делать read-only там, где это возможно.

---

## 22. Encryption

Передача данных должна происходить только через HTTPS.

Чувствительные integration credentials желательно хранить в encrypted form.

Encryption keys не должны находиться рядом с encrypted data без необходимости.

Конкретная реализация secret encryption уточняется перед coding stage.

---

## 23. External Providers

Внешние provider'ы считаются отдельной trust boundary.

Нельзя считать данные provider'а автоматически безопасными.

Нужно:

* валидировать ответы;
* обрабатывать malformed data;
* ограничивать timeouts;
* обрабатывать rate limits;
* не показывать внутренние ошибки provider'а клиенту как raw stack traces.

---

## 24. Webhooks

Если используются webhooks:

* проверять signature;
* использовать secret;
* защищаться от replay;
* проверять timestamp, если provider поддерживает;
* делать handlers idempotent;
* не доверять payload без проверки.

---

## 25. Audit Log

Security-sensitive действия должны создавать audit events.

Минимально:

```text
user
organization
project
action
entity
timestamp
result
```

Примеры:

```text
user.login
user.logout
membership.create
membership.delete

content.create
content.update
content.delete

integration.connect
integration.disconnect

settings.update
```

Audit log должен быть append-oriented.

Обычный CLIENT не должен иметь возможность удалять audit history.

---

## 26. Audit Metadata

Допустимо хранить:

* entity_id;
* action type;
* безопасные before/after summaries;
* IP при необходимости;
* user agent при необходимости.

Не хранить:

* password;
* API tokens;
* authorization headers;
* full secrets;
* private sensitive payloads.

---

## 27. Rate Limiting

Rate limiting нужен минимум для:

* login;
* password reset;
* invitation flow;
* sensitive API endpoints;
* webhook endpoints;
* expensive external integration sync.

Не нужно вводить чрезмерно сложную систему на MVP, но basic abuse protection обязательна.

Для manual Project Health check в текущем MVP действует 30-секундный cooldown на
проекте по `project_health.last_checked_at`. Authorization выполняется до проверки
cooldown; при активном cooldown Edge Function возвращает HTTP 429, `code =
check_cooldown` и `Retry-After`. DNS lookup, outbound fetch и project_health write при
этом не выполняются.

---

## 28. Brute-force Protection

Для auth:

* rate limiting;
* provider protections;
* MFA;
* generic authentication errors.

Не сообщать потенциальному атакующему слишком много информации вроде:

```text
такой email существует, пароль неверен
```

если это можно избежать.

---

## 29. Error Handling

Frontend не должен получать:

* stack traces;
* SQL errors;
* provider secrets;
* internal paths;
* environment variables.

Пользователь получает безопасное сообщение.

Подробности уходят в internal monitoring.

---

## 30. Logging

Logs не должны содержать:

* passwords;
* cookies;
* session tokens;
* authorization headers;
* API secrets;
* private content целиком.

Должна существовать централизованная функция redaction для чувствительных полей.

---

## 31. Sentry Privacy

Sentry используется для технических ошибок платформы.

Не отправлять:

* authorization headers;
* cookies;
* tokens;
* passwords;
* sensitive client content.

Перед production должны быть настроены scrub/redaction rules.

---

## 32. PostHog Privacy

Если используется PostHog:

* не записывать passwords;
* не записывать tokens;
* не отправлять содержимое чувствительных полей;
* осторожно использовать session replay;
* masking включать для private input fields.

PostHog не является обязательным для работы платформы.

---

## 33. Dependency Security

Перед release:

* dependency audit;
* обновление критических vulnerabilities;
* secret scan;
* проверка exposed environment variables.

Security update core должен иметь высокий приоритет.

---

## 34. Backups

Security включает recoverability.

Необходимо иметь backups:

* platform database;
* критичных settings;
* CMS content;
* необходимых media metadata.

Backup не считается существующим, пока restore не был протестирован.

---

## 35. Destructive Actions

Опасные действия:

* удаление проекта;
* удаление пользователя;
* массовое удаление контента;
* удаление media;
* disconnect integration.

Должны иметь явное подтверждение.

Для части сущностей предпочтителен soft delete.

---

## 36. Developer Account Protection

Developer account является особо чувствительным, потому что может иметь доступ к большому числу проектов.

Для DEVELOPER рекомендуется:

* обязательный MFA;
* passkey в будущем;
* session visibility;
* ability to revoke sessions;
* alert о подозрительном login в будущем.

Компрометация developer account имеет значительно больший blast radius, чем CLIENT.

---

## 37. Client Account Protection

CLIENT также должен иметь безопасную authentication model.

Но permissions CLIENT должны минимизировать потенциальный ущерб даже при компрометации аккаунта.

CLIENT не получает технических credentials проекта.

---

## 38. Fail Closed

Если система не может определить:

* membership;
* permission;
* tenant;
* integration ownership;

действие должно быть запрещено.

Не использовать модель:

```text
если проверка сломалась → разрешить
```

Использовать:

```text
если проверка сломалась → deny
```

---

## 39. Security Testing

Минимально автоматизировать тесты:

### Tenant isolation

```text
User A cannot read Project B
User A cannot update Project B
User A cannot access Project B media
```

### Roles

```text
CLIENT cannot manage integrations
CLIENT cannot view technical settings
DEVELOPER can access assigned technical data
```

### Direct API access

Скрытие кнопки не влияет на результат.

Прямой вызов запрещённого endpoint тоже должен получать отказ.

---

## 40. Security QA Before Release

Перед production проверяем:

* auth;
* logout;
* expired session;
* MFA;
* CLIENT permissions;
* DEVELOPER permissions;
* tenant isolation;
* RLS;
* direct API requests;
* media authorization;
* integrations;
* secret exposure;
* logs;
* Sentry;
* PostHog, если он подключён;
* rate limits;
* destructive actions;
* backups;
* restore.

---

## 41. Security Incident Principle

Если обнаружен security issue:

```text
contain
↓
revoke affected access
↓
investigate
↓
fix
↓
verify
↓
document
```

Приоритет security-инцидента выше новых feature development.

---

## 42. Что не усложняем в MVP

Первая версия не требует:

* собственной IAM platform;
* hardware security modules;
* enterprise SSO;
* SCIM;
* сложного SOC;
* custom WAF;
* zero-trust network architecture;
* собственного auth provider.

Используем стандартные проверенные решения и не изобретаем криптографию самостоятельно.

---

## 43. Главный security principle

При любом архитектурном решении задаём три вопроса:

1. Может ли CLIENT получить больше доступа, чем ему нужен?
2. Может ли пользователь одного проекта получить данные другого проекта?
3. Что произойдёт, если credential или account будет скомпрометирован?

Если ответ создаёт большой необоснованный blast radius, архитектуру нужно пересмотреть.
