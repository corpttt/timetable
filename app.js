/* Schedule PWA */
(function () {
  const TZ = "Europe/Moscow";
  const GROUPS_URL = "./groups.json";
  const OVERRIDES_URL = "./overrides.json";
  const GROUP_KEY = "ucheba-schedule-group";
  const CACHE_PREFIX = "schedule-cache-v4:";
  const CACHE_KEYS_LEGACY = [
    "schedule-cache-v3",
    "schedule-cache-v2",
    "schedule-cache-v1",
    "b84-schedule-cache-v1",
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    data: null,
    nearest: null,
    colorMap: null,
    overrides: { items: [] },
    groups: [],
    groupId: null,
  };

  function cacheKey(groupId) {
    return CACHE_PREFIX + (groupId || "Б84");
  }

  function readGroupId() {
    try {
      const v = localStorage.getItem(GROUP_KEY);
      if (v) return v;
    } catch (_) {}
    return null;
  }

  function writeGroupId(id) {
    try {
      localStorage.setItem(GROUP_KEY, id);
    } catch (_) {}
    state.groupId = id;
  }

  function currentGroup() {
    return (
      state.groups.find((g) => g.id === state.groupId) ||
      state.groups.find((g) => g.id === "Б84") ||
      state.groups[0] ||
      null
    );
  }

  function scheduleUrl(group) {
    if (group?.file) return "./" + String(group.file).replace(/^\.\//, "");
    return "./schedule.json";
  }

  function updateBrand() {
    const g = currentGroup();
    const label = $("#brand-label");
    const btn = $("#btn-group");
    if (label) {
      label.textContent = g ? `расписание · ${g.short || g.id}` : "расписание";
    }
    if (btn) {
      btn.hidden = !g;
      btn.textContent = g ? g.short || g.id : "группа";
    }
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function moscowNow(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
      seconds: Number(get("second")),
      label: new Intl.DateTimeFormat("ru-RU", {
        timeZone: TZ,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  }

  function toMinutes(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function findNearest(lessons, now = moscowNow()) {
    const nowMin = toMinutes(now.time);
    let current = null;
    let next = null;
    for (const les of lessons) {
      if (!les.start || !les.end || !les.date) continue;
      if (les.date < now.date) continue;
      const start = toMinutes(les.start);
      const end = toMinutes(les.end);
      if (les.date === now.date) {
        if (start <= nowMin && nowMin < end) {
          current = les;
          break;
        }
        if (start > nowMin && !next) next = les;
      } else if (les.date > now.date && !next) {
        next = les;
      }
    }
    if (current) return { kind: "now", lesson: current };
    if (next) return { kind: "next", lesson: next };
    return { kind: "done", lesson: null };
  }

  function lessonId(les) {
    return `L-${les.date}-${les.start}-${encodeURIComponent(les.subject).slice(0, 40)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function subjectGroup(name) {
    let raw = String(name || "").trim();
    raw = raw.split(/\s*[—–]\s*/)[0].trim();
    raw = raw.replace(/\s*\([^)]*\)\s*$/u, "").trim();
    return raw || String(name || "").trim() || "Прочее";
  }

  const SUBJECT_PALETTE = [
    "#58a6ff",
    "#3fb950",
    "#d2a8ff",
    "#f778ba",
    "#ffa657",
    "#79c0ff",
    "#e3b341",
    "#ff7b72",
    "#56d364",
    "#a5d6ff",
    "#ff9bce",
    "#39c5cf",
    "#f0883e",
    "#7ee787",
  ];

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function buildColorMap(groupNames) {
    const used = new Set();
    const map = new Map();
    const sorted = [...groupNames].sort((a, b) => a.localeCompare(b, "ru"));
    for (const g of sorted) {
      let idx = hashStr(g) % SUBJECT_PALETTE.length;
      for (let step = 0; step < SUBJECT_PALETTE.length; step++) {
        const c = SUBJECT_PALETTE[(idx + step) % SUBJECT_PALETTE.length];
        if (!used.has(c)) {
          used.add(c);
          map.set(g, c);
          break;
        }
      }
      if (!map.has(g)) map.set(g, SUBJECT_PALETTE[idx]);
    }
    return map;
  }

  function shortenAddress(address) {
    let a = String(address || "").trim().replace(/\s*·\s*$/, "");
    if (!a) return null;
    if (/14[-‑]?я\s+линия/i.test(a)) return "СПб ФИЦ РАН";
    if (/университетский\s+пр/i.test(a)) {
      const n = a.match(/(\d+)/);
      return n ? `Унив. пр. ${n[1]}` : "Унив. пр.";
    }
    // «Матмех, лит. Б» уже коротко
    a = a.replace(/^Матмех\s*,\s*лит\.\s*/i, "Матмех ");
    return a;
  }

  function parseMeta(meta) {
    const text = String(meta || "").trim();
    if (!text) return { room: null, address: null, instructor: null, rest: "", soft: false };

    const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const mainLine = lines[0];
    const extraLines = lines.slice(1);

    if (/аудитори[яи]\s+уточняется/i.test(mainLine) || extraLines.some((l) => /аудитори[яи]\s+уточняется/i.test(l))) {
      const instructorOnly = /^([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.(?:\s*[А-ЯЁ]\.)?)+)\s*$/.exec(mainLine);
      return {
        room: "уточняется",
        address: null,
        instructor: instructorOnly ? instructorOnly[1] : null,
        rest: "",
        soft: true,
      };
    }

    if (/аудитори[яи].{0,40}по\s+подгрупп/i.test(mainLine)) {
      return { room: "по подгруппе", address: null, instructor: null, rest: "", soft: true };
    }

    let room = null;
    let address = null;
    let instructor = null;

    const parts = mainLine.split(/\s*·\s*/);
    const beforeDot = parts[0] || "";
    const afterDot = parts.slice(1).join(" · ");

    const audMatch = /ауд\.\s*([^\s·,;]+)/i.exec(beforeDot);
    if (audMatch) {
      room = audMatch[1].replace(/[.,;]+$/, "");
      const cleaned = beforeDot.replace(/ауд\.\s*[^\s·,;]+/i, "").trim();
      address = cleaned.replace(/^[,;·\s]+|[,;·\s]+$/g, "").trim() || null;
      instructor = afterDot.trim() || null;
    } else {
      const namePattern = /^([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.(?:\s*[А-ЯЁ]\.)?)?(?:\s*;\s*[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.(?:\s*[А-ЯЁ]\.)?)?)*)\s*$/;
      const nameMatch = namePattern.exec(beforeDot.trim());

      if (nameMatch) {
        instructor = nameMatch[1];
        address = afterDot.trim() || null;
      } else {
        address = beforeDot.trim() || null;
        instructor = afterDot.trim() || null;
      }
    }

    const restParts = [];
    for (const line of extraLines) {
      if (/фактическое\s+время/i.test(line)) continue;
      if (/аудитори[яи]\s+уточняется/i.test(line)) {
        room = room || "уточняется";
        continue;
      }
      if (/14[-‑]?я\s+линия|университетский\s+пр|матмех/i.test(line)) {
        if (!address) address = line.replace(/\s*·\s*$/, "").trim();
        continue;
      }
      restParts.push(line);
    }

    if (address && !address.match(/[А-Яа-яЁё]/)) address = null;
    if (instructor && !instructor.match(/[А-Яа-яЁё]/)) instructor = null;

    address = shortenAddress(address);

    return { room, address, instructor, rest: restParts.join(" · ") || "", soft: room === "уточняется" || room === "по подгруппе" };
  }

  function roomChip(room, soft) {
    if (!room) return "";
    const label = soft
      ? room === "уточняется"
        ? "ауд. ?"
        : room
      : `ауд. ${room}`;
    return `<span class="chip chip-room" title="Аудитория">${escapeHtml(label)}</span>`;
  }

  function addressChip(address) {
    if (!address) return "";
    return `<span class="chip chip-address" title="Адрес">${escapeHtml(address)}</span>`;
  }

  function instructorChip(instructor) {
    if (!instructor) return "";
    return `<span class="chip chip-instructor" title="Преподаватель">${escapeHtml(instructor)}</span>`;
  }

  function renderNowHint(nearest) {
    const el = $("#now-hint");
    if (!el) return;
    if (nearest.kind === "done" || !nearest.lesson) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    const les = nearest.lesson;
    const tag =
      nearest.kind === "now"
        ? '<span class="badge badge-now">сейчас</span>'
        : '<span class="badge badge-next">далее</span>';
    el.innerHTML = `${tag} <strong>${escapeHtml(les.subject)}</strong>
      <span class="muted"> · ${escapeHtml(les.time)} · ${escapeHtml(les.dayTitle || "")}</span>`;
  }

  function collectAllGroups(data) {
    const set = new Set();
    for (const w of data.weeks || []) {
      for (const d of w.days || []) {
        for (const pair of d.pairs || []) {
          for (const s of pair.subjects || []) set.add(subjectGroup(s.name));
        }
      }
    }
    for (const s of data.spbuOnly || []) set.add(subjectGroup(s.subject));
    return set;
  }

  function parsePairStart(time) {
    const m = String(time || "").match(/(\d{1,2}):(\d{2})\s*[–\-]/);
    return m ? `${pad(+m[1])}:${m[2]}` : "";
  }

  function parsePairEnd(time) {
    const m = String(time || "").match(/[–\-]\s*(\d{1,2}):(\d{2})/);
    return m ? `${pad(+m[1])}:${m[2]}` : "";
  }

  function overrideForSubject(date, name, meta) {
    const items = (state.overrides && state.overrides.items) || [];
    const n = String(name || "").toLowerCase().replace(/ё/g, "е");
    const blob = `${meta || ""}\n${name || ""}`;
    let best = null;
    for (const it of items) {
      if (it.active === false) continue;
      if (it.dates && it.dates.length && date && !it.dates.includes(date)) continue;
      const keys = it.subjects || [];
      const subjOk =
        !keys.length ||
        keys.some((k) => {
          const key = String(k).toLowerCase();
          if (key === "c++" || key === "си++") {
            return n.includes("c++") || n.includes("программирован");
          }
          return n.includes(key);
        });
      if (!subjOk) continue;
      if (it.place_14) {
        const placeOk =
          /14|линия|васьк|в\.?\s*о/i.test(blob) ||
          /алгоритм|информатик/i.test(n);
        if (!placeOk) continue;
      }
      if (Array.isArray(it.matches) && it.matches.length) {
        const hit = it.matches.some(
          (m) => m.date === date && String(m.name || "").toLowerCase() === n
        );
        if (!hit) continue;
      }
      best = it;
    }
    return best;
  }

  function renderLessonCard({
    id,
    time,
    name,
    meta,
    color,
    sync,
    kind,
    nearestKey,
    nearestKind,
    start,
    end,
    date,
  }) {
    const { room, address, instructor, rest, soft } = parseMeta(meta);
    const ov = overrideForSubject(date, name, meta);
    let cls = "tl-item";
    if (nearestKind === "now" && nearestKey === id) cls += " current";
    if (nearestKind === "next" && nearestKey === id) cls += " next-pair";
    if (sync === "spbu-only") cls += " mismatch spbu-only";
    if (sync === "local-only") cls += " mismatch local-only";
    if (ov?.action === "cancel") cls += " cancelled";
    if (ov?.action === "confirm") cls += " tg-confirm";
    const syncBadge =
      sync === "spbu-only"
        ? '<span class="badge badge-mismatch badge-spbu-only" title="Есть в Timetable SPbU, нет в нашей таблице">только на Timetable</span>'
        : sync === "local-only"
          ? '<span class="badge badge-mismatch badge-local-only" title="Есть в нашей таблице, нет в Timetable SPbU">только в таблице</span>'
          : "";
    const tgBadge =
      ov?.action === "cancel"
        ? `<span class="badge badge-cancel" title="${escapeHtml(ov.note || "отмена из Telegram")}">отмена</span>`
        : ov?.action === "confirm"
          ? `<span class="badge badge-confirm" title="${escapeHtml(ov.note || "подтверждено в Telegram")}">TG ✓</span>`
          : "";
    return `<article class="${cls}" id="${id}" style="--c:${color}"
      data-start="${escapeHtml(start || "")}" data-end="${escapeHtml(end || "")}" data-kind="${kind || "local"}">
      <span class="tl-dot" aria-hidden="true"></span>
      <div class="tl-time">${escapeHtml(time)}${syncBadge ? " " + syncBadge : ""}${tgBadge ? " " + tgBadge : ""}</div>
      <div class="subj">${escapeHtml(name)}</div>
      <div class="tl-chips">
        ${roomChip(room, soft)}
        ${addressChip(address)}
        ${rest ? `<span class="chip">${escapeHtml(rest)}</span>` : ""}
        ${ov?.note ? `<span class="chip">${escapeHtml(ov.note)}</span>` : ""}
      </div>
    </article>`;
  }

  function spbuOnlyForDay(data, date) {
    return (data.spbuOnly || []).filter((x) => x.date === date);
  }

  function renderSchedule(data, nearest) {
    const tabs = $("#week-tabs");
    const main = $("#weeks");
    const colorMap = state.colorMap;
    const nearestWeek = nearest.lesson?.weekId ?? data.weeks[0]?.id ?? 0;
    const nearestDate = nearest.lesson?.date;
    const nearestKey = nearest.lesson ? lessonId(nearest.lesson) : null;
    const today = moscowNow().date;

    tabs.innerHTML = data.weeks
      .map(
        (w) =>
          `<button type="button" class="week-tab${w.id === nearestWeek ? " active" : ""}" data-week="${w.id}">${escapeHtml(w.title)}</button>`
      )
      .join("");

    main.innerHTML = data.weeks
      .map((w) => {
        const days = (w.days || [])
          .map((d) => {
            const nearestDay = d.date === nearestDate || d.date === today;
            const items = (d.pairs || [])
              .map((pair) => {
                const start = parsePairStart(pair.time);
                const end = parsePairEnd(pair.time);
                return (pair.subjects || [])
                  .map((s) => {
                    const id = lessonId({
                      date: d.date,
                      start,
                      subject: s.name,
                    });
                    const group = subjectGroup(s.name);
                    const color = colorMap.get(group) || SUBJECT_PALETTE[0];
                    return renderLessonCard({
                      id,
                      time: pair.time,
                      name: s.name,
                      meta: s.meta,
                      color,
                      sync: s.sync || "ok",
                      kind: "local",
                      nearestKey,
                      nearestKind: nearest.kind,
                      start,
                      end,
                      date: d.date,
                    });
                  })
                  .join("");
              })
              .join("");

            const ghosts = spbuOnlyForDay(data, d.date)
              .map((s) => {
                const id = lessonId({
                  date: s.date,
                  start: s.start,
                  subject: s.subject,
                });
                const group = subjectGroup(s.subject);
                const color = colorMap.get(group) || "#f85149";
                const time = `${s.start}–${s.end || "?"}`;
                return renderLessonCard({
                  id,
                  time,
                  name: s.subject,
                  meta: s.meta,
                  color,
                  sync: "spbu-only",
                  kind: "spbu",
                  nearestKey,
                  nearestKind: nearest.kind,
                  start: s.start,
                  end: s.end,
                  date: s.date,
                });
              })
              .join("");

            return `<section class="tl-day${nearestDay ? " nearest" : ""}" data-date="${d.date}" id="day-${d.date}">
              <div class="tl-day-label"><span>${escapeHtml(d.title)}</span><span class="muted">${escapeHtml(d.date)}</span></div>
              ${items || ""}${ghosts || (items ? "" : '<article class="tl-item" style="--c:var(--border)"><span class="tl-dot"></span><div class="meta-rest">Пар нет</div></article>')}
            </section>`;
          })
          .join("");

        return `<div class="week-panel${w.id === nearestWeek ? " active" : ""}" data-week="${w.id}">
          <div class="timeline" data-week="${w.id}">
            <div class="now-needle" hidden data-label=""><div class="now-beam"></div></div>
            ${days}
          </div>
        </div>`;
      })
      .join("");

    $$(".week-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.week;
        $$(".week-tab").forEach((b) => b.classList.toggle("active", b === btn));
        $$(".week-panel").forEach((p) =>
          p.classList.toggle("active", p.dataset.week === id)
        );
        requestAnimationFrame(() => updateNowNeedle());
      });
    });
  }

  function activeTimeline() {
    return $(".week-panel.active .timeline");
  }

  function updateNowNeedle() {
    const now = moscowNow();
    const timeline = activeTimeline();
    if (!timeline) return;
    const needle = timeline.querySelector(".now-needle");
    if (!needle) return;

    const day = timeline.querySelector(`.tl-day[data-date="${now.date}"]`);
    if (!day) {
      needle.hidden = true;
      return;
    }

    const items = [...day.querySelectorAll(".tl-item[data-start]")].filter(
      (el) => el.dataset.start
    );
    const tlRect = timeline.getBoundingClientRect();
    const dayRect = day.getBoundingClientRect();
    let topPx = dayRect.top - tlRect.top + 28;
    const nowMin = toMinutes(now.time) + now.seconds / 60;

    if (items.length) {
      const spans = items.map((el) => ({
        el,
        start: toMinutes(el.dataset.start),
        end: toMinutes(el.dataset.end) || toMinutes(el.dataset.start) + 90,
      }));
      spans.sort((a, b) => a.start - b.start);

      if (nowMin <= spans[0].start) {
        const r = spans[0].el.getBoundingClientRect();
        topPx = r.top - tlRect.top;
      } else if (nowMin >= spans[spans.length - 1].end) {
        const r = spans[spans.length - 1].el.getBoundingClientRect();
        topPx = r.bottom - tlRect.top;
      } else {
        let placed = false;
        for (const s of spans) {
          if (nowMin >= s.start && nowMin <= s.end) {
            const r = s.el.getBoundingClientRect();
            const frac = (nowMin - s.start) / Math.max(s.end - s.start, 1);
            topPx = r.top - tlRect.top + frac * r.height;
            placed = true;
            break;
          }
        }
        if (!placed) {
          for (let i = 0; i < spans.length - 1; i++) {
            if (nowMin > spans[i].end && nowMin < spans[i + 1].start) {
              const a = spans[i].el.getBoundingClientRect();
              const b = spans[i + 1].el.getBoundingClientRect();
              const frac =
                (nowMin - spans[i].end) /
                Math.max(spans[i + 1].start - spans[i].end, 1);
              topPx = a.bottom - tlRect.top + frac * (b.top - a.bottom);
              break;
            }
          }
        }
      }
    }

    needle.hidden = false;
    needle.style.top = `${Math.max(0, topPx)}px`;
    needle.dataset.label = now.time;
  }

  function weekContainsDate(week, isoDate) {
    const dates = (week.days || [])
      .map((d) => d.date)
      .filter(Boolean)
      .sort();
    if (!dates.length) return false;
    if (dates.includes(isoDate)) return true;
    return dates[0] <= isoDate && isoDate <= dates[dates.length - 1];
  }

  function nearestDayIso(isoDate) {
    const all = [];
    for (const w of state.data?.weeks || []) {
      for (const d of w.days || []) {
        if (d.date) all.push(d.date);
      }
    }
    all.sort();
    if (!all.length) return null;
    if (all.includes(isoDate)) return isoDate;
    let best = all[0];
    let bestDist = Infinity;
    for (const d of all) {
      const dist = Math.abs(Date.parse(d) - Date.parse(isoDate));
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  function jumpToNow(smooth) {
    const now = moscowNow();
    const week =
      (state.data?.weeks || []).find((w) => weekContainsDate(w, now.date)) ||
      (state.data?.weeks || []).find((w) =>
        (w.days || []).some((d) => d.date === nearestDayIso(now.date))
      );
    if (week) {
      const id = String(week.id);
      $$(".week-tab").forEach((b) =>
        b.classList.toggle("active", b.dataset.week === id)
      );
      $$(".week-panel").forEach((p) =>
        p.classList.toggle("active", p.dataset.week === id)
      );
    }
    const scrollDate = nearestDayIso(now.date) || now.date;
    requestAnimationFrame(() => {
      updateNowNeedle();
      const needle = $(".week-panel.active .now-needle");
      const day = document.getElementById(`day-${scrollDate}`);
      const useNeedle =
        needle && !needle.hidden && document.getElementById(`day-${now.date}`);
      const target = useNeedle ? needle : day;
      if (!target) {
        toast("Нет пар рядом с сегодня");
        return;
      }
      target.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "center",
      });
    });
  }

  function applyData(data) {
    state.data = data;
    state.colorMap = buildColorMap(collectAllGroups(data));
    const now = moscowNow();
    state.nearest = findNearest(data.lessons || [], now);
    renderNowHint(state.nearest);
    renderSchedule(data, state.nearest);
    updateBrand();
    const main = $("#app-main");
    if (main) main.hidden = false;
    requestAnimationFrame(() => {
      jumpToNow(false);
      updateNowNeedle();
    });
  }

  function readLocalCache(groupId) {
    const gid = groupId || state.groupId;
    const keys = [cacheKey(gid), ...CACHE_KEYS_LEGACY];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (
          gid &&
          data.groupId &&
          data.groupId !== gid &&
          key.startsWith(CACHE_PREFIX)
        ) {
          continue;
        }
        return data;
      } catch {
        /* ignore broken cache */
      }
    }
    return null;
  }

  function writeLocalCache(data) {
    try {
      const raw = JSON.stringify(data);
      localStorage.setItem(cacheKey(state.groupId || data.groupId), raw);
    } catch (err) {
      console.warn("localStorage full?", err);
    }
  }

  async function loadGroupsCatalog() {
    try {
      const res = await fetch(GROUPS_URL, { cache: "default" });
      if (!res.ok) throw new Error(`groups ${res.status}`);
      const data = await res.json();
      state.groups = data.groups || [];
      return data;
    } catch {
      state.groups = [
        {
          id: "Б84",
          name: "26.Б84-мм",
          short: "Б84",
          spbuId: 459575,
          file: "schedule.json",
        },
      ];
      return { defaultId: "Б84", groups: state.groups };
    }
  }

  function showOnboarding() {
    const root = $("#onboarding");
    const pick = $("#group-pick");
    const main = $("#app-main");
    if (!root || !pick) return;
    document.body.classList.add("onboarding-open");
    if (main) main.hidden = true;
    pick.innerHTML = state.groups
      .map(
        (g) =>
          `<button type="button" class="group-pick-btn" data-id="${escapeHtml(g.id)}">
            <strong>${escapeHtml(g.short || g.id)}</strong>
            <span>${escapeHtml(g.name || "")}</span>
          </button>`
      )
      .join("");
    pick.querySelectorAll(".group-pick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        writeGroupId(btn.dataset.id);
        state.data = null;
        root.hidden = true;
        document.body.classList.remove("onboarding-open");
        startWithGroup();
      });
    });
    root.hidden = false;
    updateBrand();
  }

  async function loadSchedule({ force = false } = {}) {
    const btn = $("#btn-refresh");
    if (btn) btn.disabled = true;
    const group = currentGroup();
    if (!group) {
      if (btn) btn.disabled = false;
      return;
    }

    const cached = readLocalCache(group.id);
    if (cached && !state.data) {
      applyData(cached);
    }

    try {
      const [res, ovRes] = await Promise.all([
        fetch(scheduleUrl(group), { cache: force ? "reload" : "default" }),
        fetch(OVERRIDES_URL, {
          cache: force ? "reload" : "default",
        }).catch(() => null),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      data.groupId = data.groupId || group.id;
      data.groupName = data.groupName || group.name;
      if (ovRes && ovRes.ok) {
        try {
          state.overrides = await ovRes.json();
        } catch {
          state.overrides = { items: [] };
        }
      }
      writeLocalCache(data);
      applyData(data);
      if (force) toast("Расписание обновлено");
    } catch (err) {
      const fallback = readLocalCache(group.id);
      if (fallback) {
        if (!state.data) applyData(fallback);
        toast(force ? "Нет сети — оставлен кэш" : "Офлайн · показан кэш");
      } else {
        toast("Нет данных — открой онлайн один раз");
        console.error(err);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function startWithGroup() {
    updateBrand();
    const cached = readLocalCache(state.groupId);
    if (cached) applyData(cached);
    await loadSchedule();
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("./sw.js?v=26")
      .then((reg) => {
        reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) {
              location.reload();
            }
          });
        });
      })
      .catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("#btn-refresh")?.addEventListener("click", async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      } catch (_) {}
      await loadSchedule({ force: true });
      location.reload();
    });
    $("#fab-now")?.addEventListener("click", () => jumpToNow(true));
    $("#btn-group")?.addEventListener("click", () => showOnboarding());

    registerSW();
    await loadGroupsCatalog();

    const saved = readGroupId();
    const known = state.groups.some((g) => g.id === saved);
    if (!saved || !known) {
      showOnboarding();
    } else {
      writeGroupId(saved);
      const onboard = $("#onboarding");
      if (onboard) onboard.hidden = true;
      document.body.classList.remove("onboarding-open");
      await startWithGroup();
    }

    window.addEventListener("online", () => {
      if (state.groupId) loadSchedule({ force: true });
    });
    window.addEventListener("offline", () => {
      toast("Офлайн — можно смотреть кэш");
    });

    setInterval(() => {
      if (!state.data) return;
      const now = moscowNow();
      state.nearest = findNearest(state.data.lessons || [], now);
      renderNowHint(state.nearest);
      updateNowNeedle();
    }, 15_000);
    window.addEventListener("resize", () => updateNowNeedle());
  });
})();
