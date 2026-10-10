# Timetable

PWA расписания Матмеха СПбУ — группы **26.Б81–Б84-мм**.

## Phone

https://corpttt.github.io/timetable/ — Chrome → Install / Add to Home screen.

Тетради живут отдельно (Google Drive / notebooks Pages), не в этом PWA.

## Features

- Выбор группы (Б81–Б84)
- Цветная лента пар + игла **сейчас**
- Пунктир, если пара только в ODS или только на Timetable SPbU
- Правки поверх таблицы: бейджи **отмена** / **✓** из `overrides.json`
- Светлая / тёмная тема

## Overrides через приложение Grok (телефон)

Grok — **отдельное приложение**, не Telegram.

1. Открой [GROK.md](GROK.md) → скопируй блок промпта в Instructions / Custom instructions Grok.
2. Вставь текст анонса про пары → Grok вернёт JSON (`updatedAt` + `items`).
3. Влей ответ в `overrides.json` (замени или смержи `items`) в этом репо / в UCHEBA `расписание/app/overrides.json`.
4. Опубликуй: из UCHEBA — `python scripts/publish_timetable.py`.
5. На телефоне в PWA нажми **↻ Обновить**.

Правки из overrides важнее ODS и сайта Timetable.

## Update base schedule (UCHEBA)

```bash
python scripts/build_multi_group_schedules.py
python scripts/sync_timetable_spbu.py   # optional badges
python scripts/publish_timetable.py
```
