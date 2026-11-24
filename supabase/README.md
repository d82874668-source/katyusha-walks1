# Автоматическое обновление справочника заведений

## Что уже подключено

- Supabase Edge Function: `sync-place-data`.
- Таблицы аудита и источников: `place_source_links`, `place_sync_runs`, `place_sync_changes`.
- В Supabase перенесены недостающие записи каталога: теперь база содержит все 375 мест.
- Для 59 мест добавлены подтверждённые ссылки на объекты OpenStreetMap.
- Обновление из OSM заполняет только пустые поля: адрес, телефон, часы работы и сайт.
- Если значение в базе уже есть и отличается от OSM, оно попадает в очередь `place_sync_changes` со статусом `pending`, а не перезаписывается.
- Рейтинги и отзывы OSM не предоставляет; Google/Foursquare пока не подключены.

## Включение расписания

Функция защищена собственным секретом в заголовке `x-sync-secret`. JWT-проверка функции отключена, но без секретного заголовка запросы получают 401.

1. Сгенерируйте длинный случайный секрет в PowerShell:

```powershell
$secret = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$secret
```

2. В Supabase Dashboard откройте **Edge Functions → Secrets** и добавьте:
   - Name: `PLACE_SYNC_SECRET`
   - Value: значение из PowerShell.

3. В Supabase SQL Editor один раз сохраните то же значение в Vault (замените placeholder):

```sql
select vault.create_secret(
  'ВСТАВЬТЕ_СЮДА_ТОТ_ЖЕ_СЕКРЕТ',
  'place_sync_secret',
  'Authentication secret for Katyusha Walks place metadata sync'
);
```

4. Создайте ежедневную задачу (03:30 UTC):

```sql
select cron.schedule(
  'katyusha-place-data-sync',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://kxwzahfthoqztmcavbic.supabase.co/functions/v1/sync-place-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'place_sync_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

5. Проверяйте историю в таблице `place_sync_runs`. Конфликты проверяйте в `place_sync_changes`.

## Ручной тест

После добавления секрета можно запустить dry-run из PowerShell:

```powershell
$headers = @{ "x-sync-secret" = $secret }
Invoke-RestMethod -Method Post -Uri "https://kxwzahfthoqztmcavbic.supabase.co/functions/v1/sync-place-data?dry_run=true" -Headers $headers
```

Dry-run не меняет данные. Обычный POST выполняет безопасное заполнение пустых полей.

## Следующий источник — рейтинги и отзывы

Для Google Places потребуется включить Places API и биллинг, добавить API key в Supabase Secrets и привязать Google Place ID к каждому заведению. Google Places ограничивает сохранение части контента: отзывы нельзя просто копировать в нашу базу; их нужно показывать в соответствии с правилами Google и атрибуцией. Поэтому рейтинги/отзывы не смешиваются с OSM-данными.
