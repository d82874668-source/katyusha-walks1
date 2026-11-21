# Инструкция: публикация обновления (GitHub + Supabase)

Простыми словами: **GitHub** хранит файлы сайта, **Supabase** хранит базу и серверные функции. Делайте шаги по порядку.

## 0. Резервная копия (до всего)
1. **Что открыть:** папку проекта на компьютере. **Куда нажать:** правый клик → «Копировать», вставьте рядом и назовите `сайт-копия-2026-11-20`.
2. **Supabase:** supabase.com → ваш проект → **Table Editor** → таблица `places` → кнопка **Export → CSV**. Также экспортируйте таблицу `routes`. Проект на бесплатном тарифе не имеет автокопий, поэтому CSV обязательны.
3. **Как проверить:** файлы CSV открываются и содержат ваши строки.
Все миграции ниже только **добавляют** поля и таблицы. Они ничего не удаляют (нет `DROP`, нет очистки).

## 1. Какие файлы загружать в GitHub
Загружать всё из папки проекта, кроме: `node_modules`, `.env`, `research/tmp`. Для этого уже есть `.gitignore`.
Нельзя публиковать `.env` и ключи `service_role`: любой сможет менять и удалять вашу базу. Проверено: в проекте нет `service_role`; в `config.js` только публичный publishable key (он для браузера безопасен при включённом RLS).

## 2. GitHub Desktop (без командной строки)
1. **Открыть:** программу GitHub Desktop → **Current Repository** → ваш репозиторий сайта.
2. **Заменить файлы:** скопируйте содержимое архива `rfn.if` в папку репозитория с заменой.
3. **Что должно получиться:** слева в списке появятся изменённые файлы (`index.html`, `assets/...`, `supabase/...`, `admin.html`).
4. **Commit:** внизу слева в поле Summary напишите «Темы, фильтры, автоматизация», нажмите **Commit to main**.
5. **Отправка:** **Push origin**.
6. **Проверить:** на github.com откройте репозиторий, там видна свежая запись коммита.
Вернуться назад: на github.com → **Commits** → нужный коммит → **Revert**.

## 3. Supabase: миграции (по порядку)
**Открыть:** supabase.com → проект → **SQL Editor → New query**. Вставьте файл целиком → **Run**. Результат: «Success».
| Порядок | Файл | Что меняет |
|---|---|---|
| 1 | `supabase/migrations/20261120_expand_places.sql` | добавляет поля в `places` (если ещё не выполняли) |
| 2 | `supabase/seed.sql` | добавляет только отсутствующие места; Sea Breeze в базе исправьте командой ниже |
| 3 | `supabase/migrations/20261121_automation.sql` | добавляет поля, таблицы источников, журналов, рейтингов, фото, очереди, RLS |

Исправление Sea Breeze в уже существующей базе (seed.sql не перезаписывает строки):
```sql
update public.places set latitude = 40.5917, longitude = 49.9867, is_approx = false, coord_source = 'Booking.com (карточка Sea Breeze Resort)' where id = 26;
```
**Проверить:** Table Editor → в `places` те же строки, что и раньше; появились таблицы `data_sources`, `sync_logs`.

## 4. Администратор
1. Supabase → **Authentication → Users → Add user** → ваш email и пароль.
2. Скопируйте UUID пользователя. В SQL Editor: `insert into public.admin_users (user_id) values ('ВСТАВЬ_UUID');`
3. **Проверить:** откройте `ваш-сайт/admin.html`, войдите. Без входа панель ничего не показывает.

## 5. Ключи
- **Project URL и publishable (anon) key** — публичные, можно в `config.js`.
- **service_role / secret key** — только на сервере. На сайте и в GitHub **никогда**.
- Ключи внешних API (Google, Foursquare) — только в Supabase Secrets.

## 6. Edge Function и секреты
1. Установите Node.js (nodejs.org) и в терминале (PowerShell) из папки проекта: `npx supabase login` — откроется браузер, подтвердите.
2. `npx supabase link --project-ref ВСТАВЬ_СВОЙ_PROJECT_REF` (Project ref — в Settings → General).
3. Секрет: `npx supabase secrets set CRON_SECRET=ВСТАВЬ_ДЛИННЫЙ_СЛУЧАЙНЫЙ_ПАРОЛЬ`
4. Развернуть: `npx supabase functions deploy sync-osm`
5. В файле `supabase/functions/sync-osm/index.ts` замените `ВСТАВЬ_СВОЙ_EMAIL` на ваш email (так просит Overpass) и повторите шаг 4.
6. **Проверить:** admin.html → «Найти новые объекты». Должна появиться строка в журнале. Журналы функции: Supabase → **Edge Functions → sync-osm → Logs**.

## 7. Расписание
1. Database → **Extensions** → включить `pg_cron` и `pg_net`.
2. SQL Editor → вставьте `supabase/cron.sql`, замените заполнители → Run.
3. Раз в неделю (понедельник, 03:00 UTC) ищутся новые объекты. Проверка: `select * from cron.job;` и `select * from cron.job_run_details order by start_time desc limit 5;`. Работает без открытого сайта.
Рейтинги, фото и обновление закрытых заведений **пока не автоматизированы** (см. отчёт).

## 8. Публикация сайта
Где размещён сайт, из файлов проекта точно не видно. В README предполагался GitHub Pages: проверьте **Settings → Pages** в репозитории. Если там указана ветка `main`, после Push сайт обновится за 1–2 минуты. Если используете другой хостинг, он подключён к GitHub и сам пересоберёт сайт. Ошибки: вкладка **Actions** в репозитории.
GitHub Pages — статичный хостинг: серверный код у вас идёт через Supabase, и это нормально.

## 9. Финальный чек-лист
- [ ] Сайт открывается, карточки грузятся из Supabase
- [ ] Окно тем, сохранение темы, «Идеальный день» в трёх темах
- [ ] Карта: маркер Sea Breeze на суше, «Сбросить фильтры» работает
- [ ] RLS включён на всех таблицах (Table Editor → значок щита)
- [ ] admin.html требует вход
- [ ] В GitHub нет `.env` и `service_role`
- [ ] `select * from cron.job;` показывает задание

## Восстановление
Вернуть код: GitHub → Revert. Вернуть данные: Table Editor → **Import data from CSV** из резервной копии (шаг 0).
