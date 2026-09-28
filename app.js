/* Б84 schedule PWA */
(function () {
  const TZ = "Europe/Moscow";
  const DATA_URL = "./schedule.json";
  const CACHE_KEY = "b84-schedule-cache-v1";

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

  /** "now" parts in Europe/Moscow */
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

  /** Subject group key: strip type after em/en dash and trailing (...). */
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

  /** Stable unique colors: hash pick, then resolve collisions along the palette. */
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

  /** Pull аудитория out of meta; rest stays as place/teacher text. */
  function parseMeta(meta) {
    const text = String(meta || "").trim();
    if (!text) return { room: null, rest: "", soft: false };

    if (/аудитори[яи]\s+уточняется/i.test(text)) {
      const rest = text
        .replace(/аудитори[яи]\s+уточняется/gi, "")
        .replace(/^[\s·,;]+|[\s·,;]+$/g, "")
        .trim();
      return { room: "уточняется", rest, soft: true };
    }

    if (/аудитори[яи].{0,40}по\s+подгрупп/i.test(text)) {
      const rest = text
        .replace(/аудитори[яи]\s+и\s+преподаватель\s*[—–\-]?\s*по\s+подгрупп\w*/gi, "")
        .replace(/^[\s·,;]+|[\s·,;]+$/g, "")
        .trim();
      return { room: "по подгруппе", rest, soft: true };
    }

    // Require the period: "ауд. 2524" — never match the word "аудитория"
    const aud = /(?:^|[\s·,;])ауд\.\s*([^\s·,;]+)/i.exec(text);
    if (aud) {
      const room = aud[1].replace(/[.,;]+$/, "");
      const rest = text
        .replace(/(?:^|[\s·,;])ауд\.\s*[^\s·,;]+/i, (m) => (m[0] === "а" || m[0] === "А" ? "" : m[0]))
        .replace(/^[\s·,;]+|[\s·,;]+$/g, "")
        .replace(/\s*[·]\s*/g, " · ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { room, rest, soft: false };
    }

    return { room: null, rest: text, soft: false };
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

  function renderHero(nearest, now, colorMap) {
    const hero = $("#hero");
    hero.className = "hero " + nearest.kind;
    hero.style.removeProperty("--c");
    if (nearest.kind === "done") {
      hero.innerHTML = `
        <div class="hero-label">Расписание</div>
        <h2 class="hero-title">Ближайших пар нет</h2>
        <p class="hero-meta">Сегодня ${escapeHtml(now.label)} · ${escapeHtml(TZ)}</p>`;
      return;
    }
    const les = nearest.lesson;
    const group = subjectGroup(les.subject);
    const color = colorMap?.get(group) || SUBJECT_PALETTE[hashStr(group) % SUBJECT_PALETTE.length];
    const { room, rest, soft } = parseMeta(les.meta);
    const badge =
      nearest.kind === "now"
        ? '<span class="badge badge-now">сейчас</span>'
        : '<span class="badge badge-next">далее</span>';
    const label = nearest.kind === "now" ? "Идёт пара" : "Ближайшая пара";
    hero.style.setProperty("--c", color);
    hero.innerHTML = `
      <div class="hero-label">${label} ${badge}</div>
      <h2 class="hero-title">${escapeHtml(les.subject)}</h2>
      <p class="hero-meta">${escapeHtml(les.dayTitle)}${rest ? " · " + escapeHtml(rest) : ""}</p>
      <div class="hero-time">${escapeHtml(les.time)} · ${escapeHtml(les.weekTitle)}</div>
      <div class="hero-chips">
        <span class="chip"><span class="chip-dot" style="background:${color}"></span>${escapeHtml(group)}</span>
        ${roomChip(room, soft)}
      </div>
      <div style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="jump-nearest">Перейти к паре</button>
      </div>`;
    $("#jump-nearest")?.addEventListener("click", () => jumpToNearest(true));
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
    return set;
  }

  function renderSchedule(data, nearest, colorMap) {
    const tabs = $("#week-tabs");
    const main = $("#weeks");
    const nearestWeek = nearest.lesson?.weekId ?? data.weeks[0]?.id ?? 0;
    const nearestDate = nearest.lesson?.date;
    const nearestKey = nearest.lesson ? lessonId(nearest.lesson) : null;

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
            const nearestDay = d.date === nearestDate;
            const items = (d.pairs || [])
              .map((pair) => {
                const m = pair.time.match(/(\d{1,2}):(\d{2})\s*[–\-]/);
                const start = m ? `${pad(+m[1])}:${m[2]}` : "";
                return (pair.subjects || [])
                  .map((s) => {
                    const id = lessonId({
                      date: d.date,
                      start,
                      subject: s.name,
                    });
                    const group = subjectGroup(s.name);
                    const color = colorMap.get(group) || SUBJECT_PALETTE[0];
                    const { room, rest, soft } = parseMeta(s.meta);
                    let cls = "tl-item";
                    if (nearest.kind === "now" && nearestKey === id) cls += " current";
                    if (nearest.kind === "next" && nearestKey === id) cls += " next-pair";
                    return `<article class="${cls}" id="${id}" style="--c:${color}">
                      <span class="tl-dot" aria-hidden="true"></span>
                      <div class="tl-time">${escapeHtml(pair.time)}</div>
                      <div class="subj">${escapeHtml(s.name)}</div>
                      <div class="tl-chips">
                        ${roomChip(room, soft)}
                        ${rest ? `<span class="chip">${escapeHtml(rest)}</span>` : ""}
                      </div>
                    </article>`;
                  })
                  .join("");
              })
              .join("");

            return `<section class="tl-day${nearestDay ? " nearest" : ""}" data-date="${d.date}" id="day-${d.date}">
              <div class="tl-day-label"><span>${escapeHtml(d.title)}</span><span class="muted">${escapeHtml(d.date)}</span></div>
              ${items || '<article class="tl-item" style="--c:var(--border)"><span class="tl-dot"></span><div class="meta-rest">Пар нет</div></article>'}
            </section>`;
          })
          .join("");

        return `<div class="week-panel${w.id === nearestWeek ? " active" : ""}" data-week="${w.id}">
          <div class="timeline">${days}</div>
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
      });
    });
  }

  function jumpToNearest(smooth) {
    const n = state.nearest;
    if (!n?.lesson) return;
    const weekId = String(n.lesson.weekId);
    $$(".week-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.week === weekId)
    );
    $$(".week-panel").forEach((p) =>
      p.classList.toggle("active", p.dataset.week === weekId)
    );
    const el = document.getElementById(lessonId(n.lesson));
    if (el) {
      el.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "center" });
    }
  }

  function updateStatus(extra = "") {
    const now = moscowNow();
    const updated = state.data?.updatedAt
      ? new Date(state.data.updatedAt).toLocaleString("ru-RU", { timeZone: TZ })
      : "—";
    $("#status-line").innerHTML = `
      <span>Сейчас: ${escapeHtml(now.label)}</span>
      <span>Данные: ${escapeHtml(updated)}</span>
      ${extra}`;
  }

  function applyData(data) {
    state.data = data;
    state.colorMap = buildColorMap(collectAllGroups(data));
    const now = moscowNow();
    state.nearest = findNearest(data.lessons || [], now);
    renderHero(state.nearest, now, state.colorMap);
    renderSchedule(data, state.nearest, state.colorMap);
    updateStatus(
      state.nearest.kind === "now"
        ? '<span class="ok">открыта текущая пара</span>'
        : state.nearest.kind === "next"
          ? '<span class="ok">открыта ближайшая пара</span>'
          : ""
    );
    requestAnimationFrame(() => jumpToNearest(false));
  }

  async function loadSchedule({ force = false } = {}) {
    const btn = $("#btn-refresh");
    if (btn) btn.disabled = true;
    try {
      const url = force ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
      const res = await fetch(url, { cache: force ? "no-store" : "default" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      applyData(data);
      if (force) toast("Расписание обновлено");
    } catch (err) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        applyData(JSON.parse(cached));
        updateStatus(`<span class="err">офлайн · кэш (${escapeHtml(String(err.message))})</span>`);
        toast("Нет сети — показан кэш");
      } else {
        $("#hero").innerHTML = `<div class="hero-label">Ошибка</div>
          <h2 class="hero-title">Не удалось загрузить расписание</h2>
          <p class="hero-meta">${escapeHtml(String(err.message))}</p>`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#btn-refresh")?.addEventListener("click", () => loadSchedule({ force: true }));
    loadSchedule();
    registerSW();
    setInterval(() => {
      if (!state.data) return;
      const now = moscowNow();
      state.nearest = findNearest(state.data.lessons || [], now);
      renderHero(state.nearest, now, state.colorMap);
      updateStatus();
    }, 60_000);
  });
})();
