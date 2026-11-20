-- Расписание. Выполните в SQL Editor. Перед этим: Database → Extensions → включите pg_cron и pg_net.
-- Замените ВСТАВЬ_СВОЙ_PROJECT_REF и ВСТАВЬ_СВОЙ_CRON_SECRET (тот же, что в Supabase Secrets).
select cron.schedule('sync-osm-weekly', '0 3 * * 1',
$$ select net.http_post(
     url := 'https://ВСТАВЬ_СВОЙ_PROJECT_REF.supabase.co/functions/v1/sync-osm',
     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','ВСТАВЬ_СВОЙ_CRON_SECRET'),
     body := '{"action":"discover"}'::jsonb) $$);
-- Проверка: select * from cron.job;   Журнал: select * from cron.job_run_details order by start_time desc limit 5;
-- Отключить: select cron.unschedule('sync-osm-weekly');
