/* Schedule PWA */
(function () {
  const TZ = "Europe/Moscow";
  const DATA_URL = "./schedule.json";
  const CACHE_KEY = "schedule-cache-v3";
  const CACHE_KEYS_LEGACY = ["schedule-cache-v2", "schedule-cache-v1", "b84-schedule-cache-v1"];
  const SPBU_GROUP = 459575;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    data: null,
    nearest: null,
    colorMap: null,
  };

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

  function parseMeta(meta) {
    const text = String(meta || "").trim();
    if (!text) return { room: null, address: null, instructor: null, rest: "", soft: false };

    const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    const mainLine = lines[0];
    const extraLines = lines.slice(1);

    if (/аудитори[яи]\s+уточняется/i.test(mainLine)) {
      const rest = [
        mainLine.replace(/аудитори[яи]\s+уточняется/gi, "").replace(/^[\s·,;]+|[\s·,;]+$/g, "").trim(),
        ...extraLines
      ].filter(Boolean).join(" · ");
      return { room: "уточняется", address: null, instructor: null, rest, soft: true };
    }

    if (/аудитори[яи].{0,40}по\s+подгрупп/i.test(mainLine)) {
      const rest = [
        mainLine.replace(/аудитори[яи]\s+и\s+преподаватель\s*[—–\-]?\s*по\s+подгрупп\w*/gi, "").replace(/^[\s·,;]+|[\s·,;]+$/g, "").trim(),
        ...extraLines
      ].filter(Boolean).join(" · ");
      return { room: "по подгруппе", address: null, instructor: null, rest, soft: true };
    }

    let room = null;
    let address = null;
    let instructor = null;
    let remaining = mainLine;

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

    if (address && !address.match(/[А-Яа-яЁё]/)) address = null;
    if (instructor && !instructor.match(/[А-Яа-яЁё]/)) instructor = null;

    const restParts = extraLines.filter(
      (line) => !/фактическое\s+время/i.test(line)
    );
    remaining = restParts.join(" · ") || "";

    return { room, address, instructor, rest: remaining, soft: false };
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
  }) {
    const { room, address, instructor, rest, soft } = parseMeta(meta);
    let cls = "tl-item";
    if (nearestKind === "now" && nearestKey === id) cls += " current";
    if (nearestKind === "next" && nearestKey === id) cls += " next-pair";
    if (sync === "spbu-only") cls += " mismatch spbu-only";
    const syncBadge =
      sync === "spbu-only"
        ? '<span class="badge badge-mismatch" title="Есть в Timetable Б84, нет в нашем файле">Timetable</span>'
        : "";
    return `<article class="${cls}" id="${id}" style="--c:${color}"
      data-start="${escapeHtml(start || "")}" data-end="${escapeHtml(end || "")}" data-kind="${kind || "local"}">
      <span class="tl-dot" aria-hidden="true"></span>
      <div class="tl-time">${escapeHtml(time)}${syncBadge ? " " + syncBadge : ""}</div>
      <div class="subj">${escapeHtml(name)}</div>
      <div class="tl-chips">
        ${roomChip(room, soft)}
        ${addressChip(address)}
        ${instructorChip(instructor)}
        ${rest ? `<span class="chip">${escapeHtml(rest)}</span>` : ""}
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

  function jumpToNow(smooth) {
    const now = moscowNow();
    // open week containing today
    const week = (state.data?.weeks || []).find((w) =>
      (w.days || []).some((d) => d.date === now.date)
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
    requestAnimationFrame(() => {
      updateNowNeedle();
      const needle = $(".week-panel.active .now-needle");
      const day = document.getElementById(`day-${now.date}`);
      const target = needle && !needle.hidden ? needle : day;
      target?.scrollIntoView({
        behavior: smooth ? "smooth" : "instant",
        block: "center",
      });
    });
  }

  function updateStatus(extra = "") {
    const now = moscowNow();
    const updated = state.data?.updatedAt
      ? new Date(state.data.updatedAt).toLocaleString("ru-RU", { timeZone: TZ })
      : "—";
    const sync = state.data?.syncStats;
    const syncTxt = sync
      ? `<span title="пары из Timetable Б84, которых нет у нас">Timetable ∆: ${sync.spbuOnly || 0}</span>`
      : "";
    $("#status-line").innerHTML = `
      <span>Сейчас: ${escapeHtml(now.label)}</span>
      <span>Данные: ${escapeHtml(updated)}</span>
      ${syncTxt}
      ${extra}`;
  }

  function applyData(data) {
    state.data = data;
    state.colorMap = buildColorMap(collectAllGroups(data));
    const now = moscowNow();
    state.nearest = findNearest(data.lessons || [], now);
    renderNowHint(state.nearest);
    renderSchedule(data, state.nearest);
    updateStatus();
    requestAnimationFrame(() => {
      jumpToNow(false);
      updateNowNeedle();
    });
  }

  function readLocalCache() {
    if (state.data) return state.data;
    for (const key of [CACHE_KEY, ...CACHE_KEYS_LEGACY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        return JSON.parse(raw);
      } catch {
        /* ignore broken cache */
      }
    }
    return null;
  }

  function writeLocalCache(data) {
    try {
      const raw = JSON.stringify(data);
      localStorage.setItem(CACHE_KEY, raw);
      // keep legacy key so older builds still see data
      localStorage.setItem("schedule-cache-v1", raw);
    } catch (err) {
      console.warn("localStorage full?", err);
    }
  }

  async function tryLiveSpbuEnrich(data) {
    if (!navigator.onLine) return data;
    try {
      const now = moscowNow();
      const d = new Date(`${now.date}T12:00:00+03:00`);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const a = mon.toISOString().slice(0, 10);
      const b = sun.toISOString().slice(0, 10);
      const url = `https://timetable.spbu.ru/api/v1/groups/${SPBU_GROUP}/events/${a}/${b}`;
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return data;
      return data;
    } catch {
      return data;
    }
  }

  async function loadSchedule({ force = false } = {}) {
    const btn = $("#btn-refresh");
    if (btn) btn.disabled = true;

    // Seed UI from memory/localStorage before network (works fully offline)
    const cached = readLocalCache();
    if (cached && !state.data) {
      applyData(cached);
      updateStatus('<span class="ok">из кэша</span>');
    }

    try {
      // Never bust with ?t= — breaks Cache API match offline
      const res = await fetch(DATA_URL, {
        cache: force ? "reload" : "default",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      data = await tryLiveSpbuEnrich(data);
      writeLocalCache(data);
      applyData(data);
      if (force) toast("Расписание обновлено");
      else updateStatus('<span class="ok">онлайн</span>');
    } catch (err) {
      const fallback = readLocalCache();
      if (fallback) {
        // Keep current view if already showing the same cache
        if (!state.data) applyData(fallback);
        updateStatus(
          `<span class="err">офлайн · кэш</span>`
        );
        toast(force ? "Нет сети — оставлен кэш" : "Офлайн · показан кэш");
      } else {
        updateStatus(
          `<span class="err">${escapeHtml(String(err.message))}</span>`
        );
        toast("Нет данных офлайн — открой приложение онлайн один раз");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js?v=7").then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#btn-refresh")?.addEventListener("click", () => loadSchedule({ force: true }));
    $("#btn-now")?.addEventListener("click", () => jumpToNow(true));
    $("#fab-now")?.addEventListener("click", () => jumpToNow(true));

    // Immediate offline paint, then try network
    const cached = readLocalCache();
    if (cached) applyData(cached);
    loadSchedule();
    registerSW();

    window.addEventListener("online", () => loadSchedule({ force: true }));
    window.addEventListener("offline", () => {
      updateStatus('<span class="err">офлайн</span>');
      toast("Офлайн — можно смотреть кэш");
    });

    setInterval(() => {
      if (!state.data) return;
      const now = moscowNow();
      state.nearest = findNearest(state.data.lessons || [], now);
      renderNowHint(state.nearest);
      updateStatus(navigator.onLine ? "" : '<span class="err">офлайн</span>');
      updateNowNeedle();
    }, 15_000);
    window.addEventListener("resize", () => updateNowNeedle());
  });
})();
