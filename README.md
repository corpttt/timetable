# Timetable

Personal class schedule PWA.

## Phone

https://corpttt.github.io/timetable/ — Chrome → Install / Add to Home screen.

## Features

- Colored subject timeline
- Moving **now** needle on the rail + «Сейчас» button
- Dashed border when a class exists only in local ODS or only on Timetable SPbU

## Update data

```bash
python scripts/export_schedule_json.py
python scripts/sync_timetable_spbu.py
```

Then push and tap refresh in the app.
