# UI_STRUCTURE.md

## 1. Цель

Этот документ описывает структуру интерфейса MVP:

* основные страницы;
* маршруты;
* меню;
* различия между DEVELOPER и CLIENT;
* структуру Multi-project Dashboard;
* структуру Project View;
* структуру Client CMS;
* базовые состояния интерфейса;
* навигацию между разделами.

Главный принцип:

> Интерфейс должен помогать пользователю быстро выполнить конкретный рабочий сценарий, а не демонстрировать количество функций платформы.

---

# 2. Основные интерфейсы

В MVP существует два основных пользовательских интерфейса:

```text
DEVELOPER INTERFACE
+
CLIENT INTERFACE
```

Они используют одну платформу и одну систему permissions, но имеют разную навигацию и доступные функции.

Client CMS и Developer CMS не являются двумя реализациями CMS. Оба интерфейса используют:

```text
один CMS engine
+
одни editors
+
одну validation
```

Различаются только layouts и permissions.

---

# 3. Общая структура маршрутов

Предварительно:

```text
/
├── login
├── dashboard
├── projects
│   ├── new
│   └── [projectId]
│       ├── overview
│       ├── content
│       ├── health
│       ├── deployments
│       ├── errors
│       ├── analytics
│       ├── database
│       ├── storage
│       ├── users
│       ├── integrations
│       ├── audit
│       └── settings
│
├── client
│   ├── projects
│   └── [projectId]
│       ├── content
│       └── media
│
└── account
    ├── profile
    └── security
```

Это логическая структура.

Конкретные URL могут быть уточнены во время реализации.

---

# 4. Login

Маршрут:

```text
/login
```

Минимальный экран:

```text
Email
Password

[ Sign In ]
```

Дополнительно:

```text
Forgot password
```

Если пользователь уже authenticated:

```text
/login
↓
redirect
```

DEVELOPER:

```text
/dashboard
```

CLIENT:

```text
/client/[projectId]/content
```

или выбор проекта, если доступно несколько.

---

# 5. Developer Layout

Основной layout developer-интерфейса:

```text
┌─────────────────────────────────────┐
│ Platform                            │
├───────────────┬─────────────────────┤
│ Sidebar       │ Main Content        │
│               │                     │
│ Dashboard     │                     │
│ Projects      │                     │
│               │                     │
│ Account       │                     │
└───────────────┴─────────────────────┘
```

Sidebar должен оставаться компактным.

MVP не требует десятков глобальных разделов.

---

# 6. Developer Global Navigation

Основное меню:

```text
Dashboard
Projects
```

Нижняя часть:

```text
Account
Logout
```

В будущем могут появиться:

```text
Organization
Team
Billing
```

Но их нет в MVP.

---

# 7. Multi-project Dashboard

Маршрут:

```text
/dashboard
```

Это главный экран DEVELOPER.

Главный вопрос:

> Какой проект требует моего внимания?

---

# 8. Dashboard Structure

Предлагаемая структура:

```text
Dashboard

Needs Attention
────────────────────────

Project A
Critical
Production deploy failed

Project B
Warning
3 critical errors


Healthy
────────────────────────

Project C
Project D
Project E
```

Не начинать MVP с большого количества графиков и analytics cards.

---

# 9. Dashboard Project Card

Минимальные данные:

```text
Project Name
Production URL

Health Status

Main Problem
Last Check
Latest Deployment
Critical Errors
```

Пример:

```text
Assol
assol.ru

● Healthy

Last check: 2 min ago
Deploy: success
Critical errors: 0
```

Проблемный проект:

```text
Project B

● Critical

Deployment failed
8 min ago
```

---

# 10. Health Status UI

Используем четыре состояния:

```text
healthy
warning
critical
unknown
```

UI не должен полагаться только на цвет.

Также показываем:

* icon;
* text label;
* краткую причину.

Например:

```text
Critical
Deployment failed
```

---

# 11. Projects List

Маршрут:

```text
/projects
```

Задача:

> Управление всеми проектами организации.

Показываем:

```text
Project
URL
Status
Health
Last Activity
```

Действия:

```text
Open
Archive
```

Кнопка:

```text
[ Add Project ]
```

---

# 12. Create Project

Маршрут:

```text
/projects/new
```

MVP форма:

```text
Project Name
Production URL
Timezone
Locale
```

Обязательные:

```text
Project Name
Production URL
```

Кнопка:

```text
Create Project
```

После успешного создания:

```text
/project/[id]/overview
```

---

# 13. Project Layout

После открытия проекта появляется project-level navigation.

Пример:

```text
Project Name
assol.ru

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

Необязательные/неподключённые разделы могут показываться как:

```text
Not connected
```

а не исчезать полностью.

---

# 14. Project Overview

Маршрут:

```text
/projects/[projectId]/overview
```

Главный технический обзор проекта.

Структура:

```text
Project Health

Website
Deployment
Errors
Database
Integrations

Open Incidents

Recent Activity
```

---

# 15. Overview Health Summary

Пример:

```text
Overall Health
Healthy

Website
● Reachable

SSL
● Valid

Deployment
● Success

Errors
● No critical errors
```

При проблеме:

```text
Overall Health
Critical

Deployment
● Failed
```

---

# 16. Open Incidents

На Overview показываем только актуальные incidents.

Пример:

```text
Open Incidents

Critical
Production deployment failed
12 min ago

Warning
Sentry integration unavailable
1 hour ago
```

Клик открывает подробности.

---

# 17. Recent Activity

Последние audit events:

```text
Client updated Service
12 min ago

Developer connected Vercel
2 hours ago
```

Не превращать Overview в полный Audit Log.

Показываем максимум несколько последних действий.

---

# 18. Content

Маршрут:

```text
/projects/[projectId]/content
```

DEVELOPER видит те же content modules, что CLIENT, через тот же CMS engine и editors,
но может иметь дополнительные возможности.

Изменения сохраняются в Platform Database — canonical source контента — и публикуются
на существующий сайт через `CMS Contract v1`.

Пример:

```text
Content

Services
Masters
Portfolio
Offers
Contacts
```

Дополнительно DEVELOPER может видеть:

```text
Configure module
```

если такая функция войдёт в MVP.

---

# 19. Content Module Screen

Маршрут:

```text
/projects/[projectId]/content/[moduleKey]
```

Пример:

```text
Services

[ Add Service ]

--------------------------------

Женская стрижка
2500 ₽
Published

Мужская стрижка
1800 ₽
Published
```

Базовые действия:

```text
Create
Edit
Hide
Delete
Reorder
```

в зависимости от permissions.

---

# 20. Content Entry Editor

Пример:

```text
Edit Service

Name
[ Женская стрижка ]

Price
[ 2500 ]

Duration
[ 60 ]

Image
[ current image ]
[ Replace ]

Active
[ ✓ ]

[ Save ]
```

Форма строится из:

```text
ContentFields
```

а не hardcoded для конкретной отрасли.

---

# 21. Save State

После Save пользователь должен ясно понимать результат.

Состояния:

```text
Saving...
Saved
Error
```

Не использовать ситуацию, когда пользователь нажал Save и не понимает, произошло ли что-то.

---

# 22. Unsaved Changes

Если пользователь изменил данные и пытается уйти:

```text
You have unsaved changes
```

Действия:

```text
Stay
Discard
```

Не обязательно делать сложную autosave-систему в MVP.

---

# 23. Health Page

Маршрут:

```text
/projects/[projectId]/health
```

Показывает подробное техническое состояние.

Пример:

```text
Project Health

Overall
Critical

Checks

HTTP
Passed
2 min ago

SSL
Passed
2 min ago

Deployment
Failed
7 min ago

Sentry
Warning
5 min ago

Integration freshness
Warning
5 min ago
```

Статус отдельной integration показывается отдельно от Project Health. Например,
недоступность Sentry может дать `warning`, но сама по себе не означает, что Website
или весь Project находятся в `critical`.

---

# 24. Health Incidents

Ниже:

```text
Open Incidents
Resolved Incidents
```

Incident card:

```text
Production deployment failed

Severity
Critical

First seen
14:23

Last seen
14:27

Status
Open
```

Действие:

```text
Acknowledge
```

---

# 25. Deployments Page

Маршрут:

```text
/projects/[projectId]/deployments
```

MVP read-only.

Показываем:

```text
Latest Production Deployment

Status
Success

Date
Commit
URL
```

Несколько последних deployments при наличии данных.

Кнопка:

```text
Open in Vercel
```

Не делаем deploy из платформы в MVP.

---

# 26. Errors Page

Маршрут:

```text
/projects/[projectId]/errors
```

MVP read-only.

Показываем:

```text
Critical Issues
Unresolved Issues
Last Error
```

Список важных ошибок:

```text
TypeError ...
Critical
Last seen 5 min ago

Database timeout
Warning
Last seen 1 hour ago
```

Кнопка:

```text
Open in Sentry
```

---

# 27. Analytics Page

Маршрут:

```text
/projects/[projectId]/analytics
```

Если PostHog подключён:

```text
Users
Sessions
Last Event
```

Если нет:

```text
Analytics not connected

[ Connect PostHog ]
```

Не строим полноценный BI dashboard.

---

# 28. Database Page

Маршрут:

```text
/projects/[projectId]/database
```

MVP:

```text
Connection
Database Status
Last Check
```

При наличии безопасных данных:

```text
Database Size
```

Не предоставляем:

* SQL editor;
* table browser;
* destructive DB operations.

---

# 29. Storage Page

Маршрут:

```text
/projects/[projectId]/storage
```

Показываем:

```text
Storage Status
Usage
Media Assets
Potential Orphans
```

Если usage недоступен через provider:

```text
Unavailable
```

а не придумываем значение.

---

# 30. Users Page

Маршрут:

```text
/projects/[projectId]/users
```

DEVELOPER видит:

```text
Users

client@example.com
CLIENT
Active

developer@example.com
DEVELOPER
Active
```

Действия:

```text
Invite User
Disable Access
Change Role
```

в рамках MVP permissions.

---

# 31. Invite User

Форма:

```text
Email
Role

CLIENT
DEVELOPER
```

По умолчанию:

```text
CLIENT
```

После invitation:

```text
Pending
```

---

# 32. Integrations Page

Маршрут:

```text
/projects/[projectId]/integrations
```

Пример:

```text
GitHub
Connected
Last sync: 5 min ago

Vercel
Connected
Last sync: 2 min ago

Sentry
Connected

Supabase
Connected

PostHog
Not connected
```

---

# 33. Integration Card

Показываем:

```text
Provider
Status
Connected project/account
Last sync
Error if present
```

Действия:

```text
Connect
Reconnect
Disconnect
Open Provider
```

CLIENT по умолчанию этого экрана не видит.

---

# 34. Audit Page

Маршрут:

```text
/projects/[projectId]/audit
```

Audit events создаются Audit Core с ранних этапов. Эта страница является отдельным UI
и может быть реализована позже.

Структура:

```text
Audit Log

User
Action
Entity
Time
Result
```

Пример:

```text
Client
content.update
Service
14:23
Success
```

Фильтры MVP:

```text
User
Action
Date
```

---

# 35. Settings Page

Маршрут:

```text
/projects/[projectId]/settings
```

MVP:

```text
Project Name
Production URL
Timezone
Locale
Status
```

Отдельно:

```text
Danger Zone
```

Действие:

```text
Archive Project
```

Не ставить destructive action рядом с обычным Save.

---

# 36. Client Layout

CLIENT получает отдельный упрощённый интерфейс.

Пример:

```text
┌─────────────────────────────────────┐
│ Project Name                        │
├───────────────┬─────────────────────┤
│ Content       │ Main Content        │
│ Media         │                     │
│               │                     │
│ Account       │                     │
└───────────────┴─────────────────────┘
```

CLIENT не должен видеть технические разделы даже как disabled navigation.

---

# 37. Client Navigation

Минимально:

```text
Content
```

Дополнительно:

```text
Media
Account
Logout
```

Если Media используется только внутри content editors, отдельная Media page может вообще не понадобиться.

---

# 38. Client Home

Если у клиента один проект:

```text
Login
↓
Project Content
```

Не нужен отдельный пустой dashboard.

Если проектов несколько:

```text
My Projects
```

и простой выбор.

---

# 39. Client Content Screen

Пример:

```text
Website Content

Services
Masters
Portfolio
Offers
Contacts
```

Цель:

> Клиент сразу понимает, где находится нужная информация.

Не использовать технические слова:

```text
ContentModule
ContentEntry
Schema
```

в клиентском UI.

---

# 40. Client Editor

Client editor должен быть максимально простым.

Например:

```text
Название услуги
[                 ]

Цена
[                 ]

Продолжительность
[                 ]

Фотография
[ Replace ]

Показывать на сайте
[ ✓ ]

[ Сохранить ]
```

Не показывать:

* database IDs;
* storage keys;
* JSON;
* API fields;
* provider configuration.

---

# 41. Client Permissions UI

Если CLIENT не имеет permission:

```text
content.delete
```

кнопка Delete не показывается.

Если он всё равно вызывает endpoint напрямую:

```text
403
```

То есть UI соответствует permissions, но не заменяет backend authorization.

---

# 42. Empty States

Каждый экран должен иметь нормальный empty state.

Пример Projects:

```text
No projects yet

Add your first client website.

[ Add Project ]
```

Integrations:

```text
GitHub is not connected.

Connect it to see repository activity.

[ Connect GitHub ]
```

Content:

```text
No services yet.

[ Add Service ]
```

---

# 43. Loading States

Не показывать пустой экран во время загрузки.

Используем:

* skeleton;
* loading indicator;
* понятный текст для долгих операций.

Background integration sync не должен блокировать весь UI.

---

# 44. Error States

Ошибка provider:

```text
Sentry data is temporarily unavailable.

Last successful sync: 14:20
```

Лучше, чем:

```text
500 Internal Server Error
```

Пользователь должен понимать:

* что именно сломалось;
* влияет ли это на сайт;
* когда данные последний раз были актуальны.

---

# 45. Stale State

Если integration давно не синхронизировалась:

```text
Data may be outdated

Last sync:
3 hours ago
```

Stale не равно:

```text
website broken
```

---

# 46. Confirmation Dialogs

Обязательны для:

* delete content;
* delete media;
* disable user;
* disconnect integration;
* archive project.

Пример:

```text
Archive this project?

Health checks will stop.
Project data will be preserved.

Cancel
Archive
```

---

# 47. Notifications

На MVP достаточно простых toast/inline notifications:

```text
Changes saved
Integration connected
Upload failed
Access denied
```

Не нужен полноценный Notification Center.

---

# 48. Search

Глобальный search не является обязательным MVP.

На первых версиях достаточно:

* project list;
* simple module filtering;
* audit filters.

Search добавляется только при реальной необходимости.

---

# 49. Responsive Design

Developer Control Panel должен нормально работать минимум на:

* desktop;
* tablet;
* mobile browser.

Но developer experience в первую очередь оптимизируется под desktop.

Client CMS должен особенно хорошо работать на мобильном устройстве.

Причина:

> Клиент часто будет менять фото, цену или текст прямо с телефона.

---

# 50. Mobile Client CMS

Критические flows на телефоне:

```text
Login
↓
Open Module
↓
Edit Entry
↓
Choose Photo
↓
Save
```

Должны тестироваться на реальном iPhone/Android, а не только через responsive emulator.

---

# 51. Accessibility

MVP должен соблюдать базовые accessibility principles:

* semantic HTML;
* labels;
* keyboard navigation;
* visible focus;
* достаточный contrast;
* ошибки формы связаны с конкретными полями;
* status не передаётся только цветом.

Не откладывать accessibility полностью «на потом».

---

# 52. Desktop Developer Priority

Главный desktop screen:

```text
/dashboard
```

Пользователь должен увидеть `Needs Attention` без лишней прокрутки.

Не занимать первый экран:

* огромным welcome banner;
* маркетинговыми блоками;
* бесполезными графиками.

---

# 53. Breadcrumbs

В project sections можно использовать:

```text
Projects
/
Assol
/
Health
```

Особенно полезно на глубоких страницах.

---

# 54. Page Titles

Каждый экран должен иметь понятный title.

Не:

```text
Overview
```

без контекста.

Лучше:

```text
Assol
Overview
```

---

# 55. External Links

Переходы во внешние providers явно обозначаются:

```text
Open in Sentry ↗
Open in Vercel ↗
Open repository ↗
```

Пользователь должен понимать, что покидает платформу.

---

# 56. Dangerous Technical Actions

В MVP мы избегаем интерфейсов:

```text
Deploy
Rollback
Run SQL
Delete Database
Change DNS
```

Платформа пока преимущественно наблюдает и администрирует безопасные данные.

Это значительно уменьшает security risk.

---

# 57. Developer Dashboard Priority

Порядок информации:

```text
1. Problems
2. Project Health
3. Recent relevant activity
4. Healthy projects
```

Не:

```text
analytics first
```

Главная функция продукта — сопровождение.

---

# 58. Client CMS Priority

Порядок:

```text
1. Business content
2. Simple editing
3. Media
```

Не:

* system settings;
* technical status;
* deployments;
* integrations.

---

# 59. Navigation Principle

DEVELOPER:

> Состояние → причина → подробности → внешний инструмент при необходимости.

CLIENT:

> Контент → запись → изменение → сохранить.

Если основной сценарий требует больше уровней навигации без необходимости, структуру нужно упростить.

---

# 60. MVP Screens

Минимальный набор экранов для первого dogfooding:

```text
Authentication

Login

Developer
Dashboard
Projects
Create Project

Project
Overview
Content
Health
Integrations
Users
Audit
Settings

Client
Content Modules
Content Entry Editor

Shared
Account
```

Deployments, Errors, Analytics, Database и Storage могут появиться как отдельные страницы после подключения provider integration либо быть частью Overview на самой ранней версии.

---

# 61. Возможное упрощение MVP

Чтобы не построить слишком много пустых экранов, первая версия Project View может быть:

```text
Overview
Content
Health
Users
Integrations
Audit
Settings
```

А:

```text
Deployments
Errors
Database
Analytics
Storage
```

показывать блоками внутри `Overview`.

Когда объём данных увеличится, блок можно вынести в отдельную страницу.

Это предпочтительнее, чем заранее создавать десяток разделов.

---

# 62. Frontend Freeze Principle

После утверждения базового Client CMS UI технические изменения backend не должны автоматически приводить к новым полям и настройкам для клиента.

Любой новый элемент Client UI должен быть обоснован конкретной пользовательской задачей.

---

# 63. UI Success Criteria

Developer должен:

* открыть dashboard;
* за несколько секунд определить проблемные проекты;
* открыть конкретную причину;
* не искать техническую информацию по множеству сервисов вручную.

CLIENT должен:

* открыть CMS;
* быстро найти нужный контент;
* изменить его;
* сохранить;
* не понимать техническое устройство сайта.

---

# 64. Что не входит в UI MVP

Не проектируем сейчас:

* AI assistant;
* site builder;
* visual page editor;
* billing;
* subscription screens;
* marketplace;
* white-label editor;
* workflow designer;
* advanced organization management;
* massive analytics dashboard;
* notification center;
* internal chat;
* ticket system;
* mobile native application.

---

# 65. Главный принцип

Каждый экран должен отвечать на конкретный вопрос.

Developer:

> Что требует моего внимания и почему?

Client:

> Где изменить нужные данные?

Если экран не помогает ответить хотя бы на один важный рабочий вопрос, он не нужен в MVP.
