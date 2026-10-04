# Timetable

Personal class schedule PWA for **26.Б84-мм**.

## Phone

- Расписание: https://corpttt.github.io/timetable/ — Chrome → Install / Add to Home screen.
- Тетради (отдельная страница): https://corpttt.github.io/timetable/notebooks.html  
  Можно держать две вкладки: расписание и тетрадь.

## Features

- Colored subject timeline + **now** needle
- Dashed border when a class exists only in local ODS or only on Timetable SPbU
- Telegram overrides: badges **отмена** / **TG ✓** from forwarded messages
- HTML notebooks catalog (no MD in the app); light/dark theme toggle

## Update base schedule

```bash
python scripts/export_schedule_json.py
python scripts/sync_timetable_spbu.py   # optional
python scripts/build_skvoznaya_html.py  # if сквозная MD changed
python scripts/sync_notebooks_to_app.py
python scripts/publish_timetable.py     # push to corpttt/timetable Pages
```

## Telegram inbox (forward messages)

Bots **cannot** read Telegram Saved Messages («Избранное»).  
Use a **private chat with your bot** the same way: forward group messages there.

1. Create a bot with [@BotFather](https://t.me/BotFather) → copy token  
2. Copy `.env.example` → `.env`, set `TELEGRAM_BOT_TOKEN`  
3. Optional: `TELEGRAM_ALLOWED_USER_IDS=<your numeric id>`  
4. Run: `python scripts/telegram_inbox_bot.py`  
5. Open the bot in Telegram → `/start` → forward messages about VO / 14th line  
6. Publish: `python scripts/publish_timetable.py` (or set `TELEGRAM_AUTO_PUBLISH=1`)  
7. On phone: open the PWA → **↻ Обновить**

Dry-run without Telegram:

```bash
python scripts/tg_parse_cli.py "Алгоритмы завтра на 14 линии отменены"
python scripts/tg_parse_cli.py --apply "Информатика в четверг состоится"
```
