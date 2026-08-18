"use strict";

/* -------------------- Storage -------------------- */
const DB_KEY = "deedTrackerDB_v1";

const DEFAULT_DB = {
  initialized: false,
  firstOpenedAt: null,
  rulesAccepted: false,
  user: null,
  settings: { dateMode: "auto", manualDate: null, startDate: null },
  days: {},
};

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw
      ? { ...DEFAULT_DB, ...JSON.parse(raw) }
      : structuredClone(DEFAULT_DB);
  } catch (e) {
    return structuredClone(DEFAULT_DB);
  }
}
let db = loadDB();

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("saveDB failed:", e);
    warnStorageOnce();
  }
}

// اگر ذخیره‌سازی محلی در دسترس نباشد (حالت خصوصی مرورگر، تنظیمات امنیتی و ...)
// قبلاً این خطا کاملاً بی‌صدا بود و برنامه هر بار "روز اول" نشان می‌داد بدون هیچ توضیحی.
// حالا حداقل یک بار در طول جلسه به کاربر اطلاع می‌دهیم.
let storageWarned = false;
function warnStorageOnce() {
  if (storageWarned) return;
  storageWarned = true;
  toast(
    "ذخیره‌سازی محلی در دسترس نیست؛ روزشمار و اطلاعات بعد از بستن برنامه از بین می‌روند.",
  );
}

// تست سریع سلامت localStorage در همان ابتدای اجرا، پیش از هر ذخیره واقعی
function storageSelfTest() {
  const k = "__deedTrackerProbe__";
  try {
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok;
  } catch (e) {
    return false;
  }
}

/* -------------------- Jalali calendar -------------------- */

// تابع تبدیل اعداد انگلیسی به فارسی
const e2p = (s) => String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const pad = (n) => String(n).padStart(2, "0");

function jalaliKey(j) {
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

function keyToJalali(key) {
  if (!key || typeof key !== "string") return todayJalali();
  const parts = key.split("/").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return todayJalali();
  return { jy: parts[0], jm: parts[1], jd: parts[2] };
}

// الگوریتم دقیق و استاندارد تبدیل میلادی به شمسی
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm =
    days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

// تشخیص روز جمعه
function isFriday(key) {
  if (!key) return false;
  const d = dateFromKey(key);
  return d.getDay() === 5;
}

// الگوریتم دقیق و استاندارد تبدیل شمسی به میلادی
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const md = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gd > md[gm - 1]) {
    gd -= md[gm - 1];
    gm++;
  }
  return { gy, gm, gd };
}

function todayJalali() {
  const d = new Date();
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function nowISO() {
  return new Date().toISOString();
}

function dateFromKey(key) {
  const j = keyToJalali(key);
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  // تنظیم روی ۱۲ ظهر جهت جلوگیری از خطای جابه‌جایی ساعت رسمی
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
}

function addDays(key, n) {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + n);
  return jalaliKey(
    gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()),
  );
}

const MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

function prettyDate(key) {
  const j = keyToJalali(key);
  return e2p(`${j.jd} ${MONTHS[j.jm - 1]} ${j.jy}`);
}

/* -------------------- Activity definitions -------------------- */
const A = (
  id,
  title,
  required = false,
  points = 0,
  condition = null,
  type = "normal",
  secondaryPoints = 0,
) => ({
  id,
  title,
  required,
  points,
  condition,
  type,
  secondaryPoints,
});
const ACTIVITIES = {
  prayers: {
    title: "نماز",
    groups: [
      {
        title: "فرایض",
        items: [
          A("fajr", "صبح", true, 10),
          A("dhuhr", "ظهر", true, 10),
          A("asr", "عصر", true, 10),
          A("maghrib", "مغرب", true, 10),
          A("isha", "عشا", true, 10),
        ],
      },
      {
        title: "سنن و نوافل",
        items: [
          A("tahajjud", "تهجد", false, 20),
          A("ishraq", "اشراق", false, 10),
          A("awwabin", "اوابین", false, 10),
          A("wuduTahiyyah", "تحیة‌الوضو", false, 5),
          A("mosqueTahiyyah", "تحیة‌المسجد", false, 5),
        ],
      },
    ],
  },
  adhkar: {
    title: "ذکر و دعا",
    groups: [
      {
        title: "صبح",
        items: [
          A("morningDua", "دعا", false, 5),
          A("morningIstighfar", "۱۰۰ مرتبه استغفار", false, 5),
          A("morningSalawat", "۱۰۰ مرتبه درود", false, 5),
          A("morningThirdKalima", "۱۰۰ مرتبه کلمه سوم", false, 5),
          A("morningThirdKalima", "اذکار صبح", false, 5),
        ],
      },
      {
        title: "شام",
        items: [
          A("eveningDua", "دعا", false, 2),
          A("eveningIstighfar", "۱۰۰ مرتبه استغفار", false, 2),
          A("eveningSalawat", "۱۰۰ مرتبه درود", false, 2),
          A("eveningThirdKalima", "۱۰۰ مرتبه کلمه سوم", false, 2),
          A("morningThirdKalima", "اذکار شام", false, 2),
        ],
      },
    ],
  },
  quran: {
    title: "تلاوت قرآن مجید",
    groups: [
      {
        title: "تلاوت روزانه",
        exclusive: true,
        items: [
          A("hizb", "یک حزب", false, 2),
          A("halfJuz", "نیم جزء", false, 3),
          A("threeHizb", "سه حزب", false, 5),
          A("oneJuz", "یک جزء", false, 6),
        ],
      },
      {
        title: "تلاوت سوره‌ها",
        items: [
          A("yasin", "صبح : یس", true, 2),
          A("mulk", "بعد از غروب : ملک", false, 2),
          A("sajdah", "بعد از عشا : واقعه", false, 2),
          A("kahf", "کهف", false, 5, (key) => isFriday(key)),
        ],
      },
    ],
  },

  cultural: {
    title: "فرهنگی",
    items: [
      A("religiousAudio", "استماع فایل‌های صوتی دینی", false, 2),

      A("hadithTeaching", "تعلیم حدیث در محل کار/محل سکونت", false, 3),

      A(
        "fikriSession",
        "جلسه فکری/اصلاحی/تفسیر/تاریخی/علمی",
        false,
        2, // امتیاز شرکت
        null,
        "dual",
        5, // امتیاز برگزاری
      ),

      A(
        "tablighSession",
        "مجالس جماعت تبلیغ",
        false,
        2, // امتیاز شرکت
        null,
        "dual",
        5, // امتیاز برگزاری
      ),

      A(
        "scholarsMeeting",
        "ملاقات با علما",
        false,
        5, // امتیاز شرکت
        null,
        "dual",
        10, // امتیاز برگزاری
      ),
    ],
  },
  religiousSkills: {
    title: "کسب مهارت دینی",
    items: [A("reading", "روخوانی", false, 3), A("tajweed", "تجوید", false, 4)],
  },
  writingSkills: {
    title: "کسب مهارت‌های ادبی",
    items: [
      A("writing", "نویسندگی و ویراستاری", false, 4),
      A("publicSpeaking", "فن بیان", false, 4),
    ],
  },
  character: {
    title: "اصلاح تزکیه و اخلاق",
    items: [
      A("patienceGratitude", "تمرین صبر و شکر", true, 2),
      A("ethicsTaqwa", "تمرین تقوا", true, 2),
      A("tawakkulRida", "تمرین توکل و رضا", true, 2),
      A("honestyTrust", "تمرین صداقت و امانت", true, 2),
      A("contentmentCertainty", "تمرین قناعت", true, 2),
      A("sinAvoidance", "تمرین پرهیز از گناه", true, 3),
      A("guardSenses", "حفظ نگاه، زبان و ...", true, 3),
      A("envyShowoff", "پرهیز از حسد و ریا", true, 2),
      A("lyingBackbiting", "پرهیز از دروغ و غیبت", true, 3),
      A("angerGrudge", "پرهیز از خشم و کینه", true, 2),
    ],
  },
  islamicCustoms: {
    title: "آداب اسلامی",
    items: [
      A("parentsRights", "رعایت حقوق والدین", true, 3),
      A("silatRahim", "صله رحم", false, 3),
      A("visitSick", "عیادت بیماران", false, 3),
      A("shareJoySorrow", "مشارکت در شادی و غم", false, 3),
    ],
  },
  financial: {
    title: "مالی",
    items: [
      A("work", "فعالیت شغلی و کاری", true, 4),
      A("charity", "انفاق از درآمد ماهانه", false, 4),
      A("technicalSkill", "کسب مهارت فنی", false, 3),
    ],
  },
  sports: {
    title: "ورزش و مهارت",
    items: [
      A("walking", "پیاده‌روی", true, 3),
      A("mountain", "کوهنوردی", false, 5),
      A("purposefulCamp", "اردوهای هدفمند", false, 8),
      A("healthyFun", "تفریحات گروهی سالم", false, 3),
    ],
  },
  dailyReview: {
    title: "محاسبه روزانه",
    items: [
      A("sleepReview", "محاسبه اعمال جدول قبل از خواب", true, 4),
      A("deathRepentance", "یاد مرگ و توبه از گناهان قبل از خواب", true, 4),
    ],
  },
};

/* -------------------- Day data -------------------- */
function blankDay() {
  return {
    statuses: {},
    study: [],
    notes: "",
    updatedAt: nowISO(),
  };
}
function ensureDay(key) {
  if (!db.days[key]) db.days[key] = blankDay();
  return db.days[key];
}
function allActivityItems() {
  const out = [];
  for (const [key, sec] of Object.entries(ACTIVITIES)) {
    if (sec.groups)
      sec.groups.forEach((g) =>
        g.items.forEach((x) => out.push({ ...x, section: key })),
      );
    else sec.items.forEach((x) => out.push({ ...x, section: key }));
  }
  return out;
}
function statusOf(day, id) {
  return day.statuses[id] || "x";
}
function setStatus(day, id, value) {
  day.statuses[id] = value;
  day.updatedAt = nowISO();
}

function checkExclusiveGroup(day, group) {
  const selected = group.items.find((item) => statusOf(day, item.id) === "y");

  return {
    done: !!selected,
    selected,
  };
}
/* -------------------- Scoring -------------------- */
function scoreDay(day) {
  const dailyQuranGroup = ACTIVITIES.quran.groups.find(
    (g) => g.exclusive && g.title === "تلاوت روزانه",
  );
  const dailyQuranStatus = checkExclusiveGroup(day, dailyQuranGroup);
  let positive = 0,
    requiredMisses = 0,
    done = 0,
    optionalDone = 0,
    applicable = 0;

  allActivityItems(currentKey).forEach((a) => {
    const isDailyQuran = dailyQuranGroup?.items.some(
      (item) => item.id === a.id,
    );

    if (isDailyQuran) return;
    if (a.condition && !a.condition(currentKey)) return;

    const s = statusOf(day, a.id);

    const isFaraid = ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(a.id);

    if (isFaraid) {
      let pts = 0;
      if (s === "congregation") pts = 20;
      else if (s === "individual") pts = 10;
      else if (s === "qada") pts = 5;

      if (s !== "x") {
        done++;
        positive += pts;
        applicable++;
      } else {
        applicable++;
        if (a.required) requiredMisses++;
      }
    } else {
      if (a.type === "dual") {
        if (s === "participate") {
          positive += a.points;
          done++;
          applicable++;
          if (!a.required) optionalDone++;
        } else if (s === "organize") {
          positive += a.secondaryPoints;
          done++;
          applicable++;
          if (!a.required) optionalDone++;
        } else if (s === "x") {
          applicable++;
          if (a.required) requiredMisses++;
        }
      } else {
        if (s === "y") {
          positive += a.points;
          done++;
          applicable++;
          if (!a.required) optionalDone++;
        } else if (s === "x") {
          applicable++;
          if (a.required) requiredMisses++;
        }
      }
    }
  });

  if (dailyQuranGroup) {
    if (dailyQuranStatus.done) {
      done++;
      positive += dailyQuranStatus.selected.points;
      applicable++;
    } else {
      requiredMisses++;
      applicable++;
    }
  }

  const studyPoints =
    Math.floor(day.study.reduce((n, r) => n + (Number(r.pages) || 0), 0) / 10) *
    2;
  if (studyPoints > 0) positive += studyPoints;

  const notesPoints = day.notes.trim().length >= 20 ? 2 : 0;
  positive += notesPoints;

  return {
    positive,
    requiredMisses,
    done,
    optionalDone,
    studyPoints,
    notesPoints,
  };
}
function startKey() {
  const k = db.settings.startDate;
  // اگر تاریخ شروع خراب، نامعتبر یا خالی بود، به‌صورت خودکار امروز را مبنا قرار بده تا عدد روز به هم نریزد
  if (!k || !validJalaliKey(k)) {
    db.settings.startDate = jalaliKey(todayJalali());
    saveDB();
  }
  return db.settings.startDate;
}
function dayNumber(key) {
  const a = dateFromKey(startKey()),
    b = dateFromKey(key);
  return Math.floor((b - a) / 86400000) + 1;
}
function updateAutomaticDate() {
  if (db.settings.dateMode === "auto") {
    const today = jalaliKey(todayJalali());
    if (!db.settings.startDate) db.settings.startDate = today;
  }
}

/* -------------------- UI helpers -------------------- */
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}
function openModal(html) {
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function toggleDualActivity(id, type) {
  const d = ensureDay(currentKey);
  const current = statusOf(d, id);

  // اگر همان گزینه دوباره زده شد، غیرفعال شود
  if (current === type) {
    setStatus(d, id, "x");
  } else {
    // فقط یکی از دو وضعیت می‌تواند فعال باشد
    setStatus(d, id, type);
  }

  saveDB();
  render();
}
function toggleHTML(a, day) {
  const s = statusOf(day, a.id);
  let label = "×";
  let cls = "";
  let styleAttr = "";
  if (a.type === "dual") {
    const s = statusOf(day, a.id);

    let companyLabel = "شرکت";
    let organizeLabel = "برگزاری";

    const companyActive = s === "participate";
    const organizeActive = s === "organize";

    return `
    <div class="dual-toggle">
      <button
        class="dual-option ${companyActive ? "active" : ""}"
        onclick="toggleDualActivity('${a.id}', 'participate')"
      >
        شرکت
      </button>

      <button
        class="dual-option ${organizeActive ? "active" : ""}"
        onclick="toggleDualActivity('${a.id}', 'organize')"
      >
        برگزاری
      </button>
    </div>
  `;
  }
  const isFaraid = ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(a.id);

  if (isFaraid) {
    if (s === "congregation") {
      label = "✓";
      cls = "done"; // جماعت (تیک سبز/معمولی با بک‌گراند استاندارد)
    } else if (s === "individual") {
      label = "✓";
      cls = "done";
      styleAttr = "color: #ffc107;"; // فردی (تیک زرد رنگ)
    } else if (s === "qada") {
      label = "✓";
      cls = "done";
      styleAttr = "color: #ff3b3b;"; // قضا (تیک قرمز رنگ)
    } else {
      label = "×";
      cls = ""; // نخوانده
    }
  } else {
    label = s === "y" ? "✓" : "×";
    cls = s === "y" ? "done" : "";
  }

  return `<button class="toggle ${cls}" style="${styleAttr}" onclick="toggleActivity('${a.id}')">${label}</button>`;
}

function activityRow(a, day, group = null) {
  const isFaraid = ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(a.id);
  const isExclusive = group?.exclusive === true;

  const s = statusOf(day, a.id);

  // فعالیت دوحالته
  if (a.type === "dual") {
    const participateActive = s === "participate";
    const organizeActive = s === "organize";

    return `
      <div class="activity">
        <div class="activity-info">
          <div class="activity-title">${esc(a.title)}</div>

          <div class="activity-meta">
            ${
              participateActive
                ? `شرکت · ${e2p(a.points)} امتیاز`
                : organizeActive
                  ? `برگزاری · ${e2p(a.secondaryPoints)} امتیاز`
                  : "شرکت یا برگزاری"
            }
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;">

          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">
              شرکت
            </div>
            <button
              class="toggle ${participateActive ? "done" : ""}"
              onclick="toggleDualActivity('${a.id}', 'participate')"
            >
              ${participateActive ? "✓" : "×"}
            </button>
          </div>

          <div style="text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">
              برگزاری
            </div>
            <button
              class="toggle ${organizeActive ? "done" : ""}"
              onclick="toggleDualActivity('${a.id}', 'organize')"
            >
              ${organizeActive ? "✓" : "×"}
            </button>
          </div>

        </div>
      </div>
    `;
  }

  let metaText;

  if (isFaraid) {
    metaText = a.required ? "اجباری" : "اختیاری";
  } else if (isExclusive) {
    metaText = `${e2p(a.points)} امتیاز`;
  } else {
    metaText = `${a.required ? "اجباری" : "اختیاری"} · ${e2p(a.points)} امتیاز`;
  }

  return `
    <div class="activity">
      <div class="activity-info">
        <div class="activity-title">${esc(a.title)}</div>
        <div class="activity-meta">${metaText}</div>
      </div>

      ${toggleHTML(a, day)}
    </div>
  `;
}

function sectionHTML(key, day) {
  const sec = ACTIVITIES[key];
  let body = "";
  if (sec.groups) {
    body = `<div class="subgrid">${sec.groups
      .map((g) => {
        const visibleItems = g.items.filter(
          (a) => !a.condition || a.condition(currentKey),
        );

        if (!visibleItems.length) return "";

        return `
   <div class="subcard">
    <div class="subcard-title">
  ${esc(g.title)}
  ${
    g.exclusive
      ? `<span style="font-size:11px;color:var(--red);margin-right:8px;font-weight:700;">حداقل یک گزینه اجباری</span>`
      : ""
  }
</div>
    ${visibleItems.map((a) => activityRow(a, day, g)).join("")}
   </div>`;
      })
      .join("")}</div>`;
  } else {
    const visibleItems = sec.items.filter(
      (a) => !a.condition || a.condition(currentKey),
    );

    body = visibleItems.map((a) => activityRow(a, day)).join("");
  }

  let prayerGuide = "";
  if (key === "prayers") {
    prayerGuide = `<div style="margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.03);border-radius:8px;display:flex;justify-content:space-around;font-size:11px;color:var(--muted);flex-wrap:wrap;gap:6px;align-items:center;">
     <span><b>راهنما:</b></span>
     <span><span style="color:#28a745;font-weight:bold;">✓</span> جماعت (۲۰)</span>
     <span><span style="color:#ffc107;font-weight:bold;">✓</span> فرادی (۱۰)</span>
     <span><span style="color:#ff3b3b;font-weight:bold;">✓</span> قضا (۵)</span>
     <span><span style="color:inherit;font-weight:bold;">×</span> نخوانده</span>
    </div>`;
  }

  return `<section class="section"><div class="section-head"><h2 class="section-title">${esc(sec.title)}</h2></div><div class="section-body">${prayerGuide}${body}</div></section>`;
}

/* -------------------- Study UI -------------------- */
function studyHTML(day) {
  const rows = day.study.length
    ? day.study
        .map(
          (r, i) => `
  <div class="study-row">
   <input value="${esc(r.book)}" placeholder="اسم کتاب" onchange="updateStudy(${i},'book',this.value)">
   <input type="number" min="0" value="${Number(r.pages) || 0}" placeholder="صفحه" onchange="updateStudy(${i},'pages',this.value)">
   <button class="icon-btn" onclick="removeStudy(${i})">−</button>
  </div>`,
        )
        .join("")
    : `<div class="empty">هنوز کتابی برای این روز ثبت نشده است.</div>`;
  return `<section class="section">
   <div class="section-head"><h2 class="section-title"> برنامه مطالعاتی (هر 10 صفحه 2 امتیاز)</h2><button class="btn btn-light" onclick="addStudy()">＋ افزودن کتاب</button></div>
   <div class="section-body">${rows}</div>
 </section>`;
}
function notesHTML(day) {
  return `<section class="section">
  <div class="section-head"><h2 class="section-title">۱۶. توضیحات فرد</h2></div>
  <div class="section-body">
   <textarea id="dailyNotesInput" class="notes" placeholder="نقاط قوت و ضعف فردی، علل و عوامل آن و سایر توضیحات روزانه...">${esc(day.notes)}</textarea>
   <button class="btn btn-primary" style="margin-top:10px; width:100%;" onclick="saveNotesFromInput()">ثبت یادداشت و اعمال امتیاز</button>
   <div class="activity-meta" style="margin-top:7px">تکمیل معنادار یادداشت روزانه (حداقل ۲۰ کاراکتر): ۲ امتیاز اختیاری</div>
  </div>
 </section>`;
}
function saveNotesFromInput() {
  const textarea = document.getElementById("dailyNotesInput");
  if (textarea) {
    ensureDay(currentKey).notes = textarea.value;
    saveDB();
    render();
    toast("یادداشت ثبت و امتیاز اعمال شد.");
  }
}

/* -------------------- Main page -------------------- */
let currentKey = null;
function render() {
  updateAutomaticDate();
  if (!currentKey)
    currentKey =
      db.settings.dateMode === "auto"
        ? jalaliKey(todayJalali())
        : db.settings.manualDate || jalaliKey(todayJalali());

  const day = ensureDay(currentKey),
    sc = scoreDay(day);
  const dn = dayNumber(currentKey);
  const todayKey = jalaliKey(todayJalali());
  const isToday = currentKey === todayKey;
  const MAX_SCORE = 330;
  const SUCCESS_SCORE = 145;

  const pct = Math.min(100, Math.round((sc.positive / MAX_SCORE) * 100));

  const checkpointPct = 100 - (SUCCESS_SCORE / MAX_SCORE) * 100;
  const isSuccessful = sc.positive >= SUCCESS_SCORE;

  // بررسی وضعیت اسکرول صفحه
  const isScrolled = window.scrollY > 40 ? "scrolled" : "";

  document.getElementById("app").innerHTML = `
  <header class="app-header">
   <div class="app-title">محاسبه اعمال</div>
   <div class="app-subtitle">ای آنکه با تلاش در پی آبادانی دنیای رو به ویرانی هستی، آیا برای عمر ویران شده نیز آبادانی‌ای هست؟</div>
  </header>

  <div id="stickyHeader" class="sticky-header ${isScrolled}">
   <div class="day-bar">
    <div class="day-number">روز ${e2p(dn)}</div>
    <div class="today-date">${prettyDate(currentKey)}</div>
    <div class="day-actions">
     <button class="btn btn-light" onclick="changeDay(-1)">روز قبل</button>
     <button class="btn btn-primary" onclick="goToday()">امروز</button>
     <button class="btn btn-light" onclick="changeDay(1)">روز بعد</button>
    </div>
   </div>

   <div class="progress-card">
    <div class="progress-row1">
     <strong class="score"> امتیاز مثبت امروز : ${e2p(sc.positive)}</strong>
    </div>
    <div class="progress-wrapper">
  <div class="progress">
    <span style="width:${pct}%"></span>
  </div>

  <div
    class="progress-checkpoint ${isSuccessful ? "passed" : ""}"
    style="left:${checkpointPct}%"
  >
    <div class="checkpoint-line"></div>
      <div class="checkpoint-label">
        ${e2p(SUCCESS_SCORE)}
      </div>
    </div>
  </div>
    <div class="progress-row" style="margin-top:8px;color:var(--muted)">
     <span>انجام شده ✓ اجباری: ${e2p(sc.done)} --- اختیاری : ${e2p(sc.optionalDone)}</span>
     <span>×کاستی: ${e2p(sc.requiredMisses)}</span>
    </div>
   </div>
  </div>
    
   </div>
   </div>
  </div>

  ${sectionHTML("prayers", day)}
  ${sectionHTML("adhkar", day)}
  ${sectionHTML("quran", day)}
  ${studyHTML(day)}
  ${sectionHTML("cultural", day)}
  ${sectionHTML("religiousSkills", day)}
  ${sectionHTML("writingSkills", day)}
  ${sectionHTML("character", day)}
  ${sectionHTML("islamicCustoms", day)}
  ${sectionHTML("financial", day)}
  ${sectionHTML("sports", day)}
  ${sectionHTML("dailyReview", day)}
  ${notesHTML(day)}

  <div class="footer-actions">
 <button class="btn btn-light" onclick="settingsModal()">تنظیمات و اطلاعات کاربر</button>
 <button class="btn btn-light" onclick="summaryModal()">گزارش روز</button>
 <button class="btn btn-light" onclick="monthlySummaryModal()">گزارش ماهانه</button>
</div>`;
  saveDB();
}

function toggleActivity(id) {
  const d = ensureDay(currentKey);
  const s = statusOf(d, id);
  const item = allActivityItems().find((x) => x.id === id);

  if (!item) return;

  const isFaraid = ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(id);

  if (isFaraid) {
    let next = "x";
    if (s === "x") next = "congregation";
    else if (s === "congregation") next = "individual";
    else if (s === "individual") next = "qada";
    else next = "x";
    setStatus(d, id, next);
  } else if (item.section === "quran") {
    let isExclusive = false;
    let groupItems = [];

    for (const secKey in ACTIVITIES) {
      const sec = ACTIVITIES[secKey];
      if (sec.groups) {
        for (const g of sec.groups) {
          if (g.exclusive && g.items.some((x) => x.id === id)) {
            isExclusive = true;
            groupItems = g.items;
            break;
          }
        }
      }
      if (isExclusive) break;
    }

    if (isExclusive) {
      const nextStatus = s === "y" ? "x" : "y";
      if (nextStatus === "y") {
        groupItems.forEach((it) => {
          if (it.id !== id) setStatus(d, it.id, "x");
        });
      }
      setStatus(d, id, nextStatus);
    } else {
      setStatus(d, id, s === "y" ? "x" : "y");
    }
  } else {
    setStatus(d, id, s === "y" ? "x" : "y");
  }

  saveDB();
  render();
}

function changeDay(n) {
  currentKey = addDays(currentKey, n);
  render();
}
function goToday() {
  currentKey = jalaliKey(todayJalali());
  render();
}
function addStudy() {
  const d = ensureDay(currentKey);
  d.study.push({ book: "", pages: 0 });
  saveDB();
  render();
}
function updateStudy(i, k, v) {
  const d = ensureDay(currentKey);
  d.study[i][k] = k === "pages" ? Math.max(0, Number(v) || 0) : v;
  saveDB();
  render();
}
function removeStudy(i) {
  const d = ensureDay(currentKey);
  d.study.splice(i, 1);
  saveDB();
  render();
}
function updateNotes(v) {
  ensureDay(currentKey).notes = v;
  saveDB();
  render();
}

/* -------------------- Onboarding -------------------- */
function rulesModal() {
  openModal(`<h2>قوانین و شرایط استفاده</h2>
 <ul>
  <li>اطلاعات واردشده در این نسخه روی دستگاه شما ذخیره می‌شود.</li>
  <li>ثبت فعالیت‌ها بر عهده کاربر است و برنامه صرفاً ابزار ثبت و محاسبه است.</li>
  <li>فعالیت‌های اجباری در صورت انجام‌نشدن به‌عنوان کاستی/سستی ثبت می‌شوند.</li>
  <li>فعالیت‌های اختیاری در صورت انجام امتیاز مثبت دارند و انجام‌نشدن جریمه ندارد.</li>
 </ul>
 <button class="btn btn-primary" style="width:100%" onclick="acceptRules()">تأیید و ادامه</button>`);
}
function acceptRules() {
  db.rulesAccepted = true;
  saveDB();
  userModal();
}
function userModal() {
  const u = db.user || {};
  openModal(`<h2>اطلاعات کاربری</h2>
 <div class="form-grid">
  <div class="form-field"><label>نام</label><input id="firstName" value="${esc(u.firstName || "")}" placeholder="نام"></div>
  <div class="form-field"><label>نام خانوادگی</label><input id="lastName" value="${esc(u.lastName || "")}" placeholder="نام خانوادگی"></div>
  <div class="form-field"><label>شماره تماس</label><input id="phone" inputmode="tel" value="${esc(u.phone || "")}" placeholder="شماره تماس"></div>
  <div class="form-field"><label>محل سکونت</label><input id="residence" value="${esc(u.residence || "")}" placeholder="محل سکونت"></div>
  <div class="form-field"><label>تحصیلات</label><input id="education" value="${esc(u.education || "")}" placeholder="تحصیلات"></div>
  <div class="form-field"><label>شغل</label><input id="occupation" value="${esc(u.occupation || "")}" placeholder="شغل"></div>
 </div>
 <button class="btn btn-primary" style="width:100%;margin-top:15px" onclick="saveUser()">ذخیره و ورود به برنامه</button>`);
}
function saveUser() {
  const fields = [
    "firstName",
    "lastName",
    "phone",
    "residence",
    "education",
    "occupation",
  ];
  const u = {};
  fields.forEach((id) => (u[id] = document.getElementById(id).value.trim()));
  if (!u.firstName || !u.lastName) {
    toast("نام و نام خانوادگی را وارد کنید.");
    return;
  }
  db.user = u;
  db.initialized = true;
  db.firstOpenedAt = db.firstOpenedAt || nowISO();
  if (!db.settings.startDate) db.settings.startDate = jalaliKey(todayJalali());
  saveDB();
  closeModal();
  currentKey = jalaliKey(todayJalali());
  render();
}

/* -------------------- Settings -------------------- */
/* -------------------- Settings -------------------- */
function settingsModal() {
  const s = db.settings;
  openModal(`<h2>تنظیمات</h2>
 <p><b>تاریخ ثبت اولین ورود:</b> ${db.firstOpenedAt ? new Date(db.firstOpenedAt).toLocaleString("fa-IR") : "—"}</p>
 <p><b>روش تاریخ:</b></p>
 <div class="choice-row">
  <button class="choice ${s.dateMode === "auto" ? "selected" : ""}" onclick="setDateMode('auto')">خودکار از سیستم</button>
  <button class="choice ${s.dateMode === "manual" ? "selected" : ""}" onclick="setDateMode('manual')">ثبت دستی</button>
 </div>
 <div style="margin-top:14px">
  <label style="font-size:12px;font-weight:800">تاریخ شروع شمارنده</label>
  <input id="startDateInput" value="${esc(s.startDate || jalaliKey(todayJalali()))}" placeholder="۱۴۰۵/۰۵/۱۸">
  <button class="btn btn-light" style="margin-top:8px;width:100%" onclick="saveStartDate()">ذخیره تاریخ شروع</button>
 </div>
 <div style="margin-top:14px">
  <button class="btn btn-light" style="width:100%" onclick="userModal()">ویرایش اطلاعات کاربری</button>
 </div>
 ${
   s.dateMode === "manual"
     ? `<div style="margin-top:14px">
  <label style="font-size:12px;font-weight:800">تاریخ دستی فعلی</label>
  <input id="manualDateInput" value="${esc(s.manualDate || jalaliKey(todayJalali()))}" placeholder="۱۴۰۵/۰۵/۱۸">
  <button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="saveManualDate()">اعمال تاریخ</button>
 </div>`
     : ""
 }
 <div style="margin-top:14px">
  <button class="btn btn-danger" style="width:100%" onclick="resetAllData()">پاک‌سازی کامل اطلاعات و شروع مجدد</button>
 </div>`);
}

function setDateMode(mode) {
  db.settings.dateMode = mode;
  if (mode === "auto") db.settings.manualDate = null;
  saveDB();
  settingsModal();
  render();
}
// پشتیبانی قوی‌تر از اعداد فارسی و عربی برای جلوگیری از خطای محاسبه روزها
function normalizePersianDigits(s) {
  return String(s)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function validJalaliKey(v) {
  if (!v || typeof v !== "string") return null;
  const clean = v
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .trim()
    .replace(/-/g, "/");
  const m = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const j = { jy: +m[1], jm: +m[2], jd: +m[3] };
  if (j.jm < 1 || j.jm > 12 || j.jd < 1 || j.jd > 31) return null;
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

function saveStartDate() {
  const k = validJalaliKey(document.getElementById("startDateInput").value);
  if (!k) {
    toast("فرمت تاریخ صحیح نیست.");
    return;
  }
  db.settings.startDate = k;
  saveDB();
  closeModal();
  render();
}
function saveManualDate() {
  const k = validJalaliKey(document.getElementById("manualDateInput").value);
  if (!k) {
    toast("فرمت تاریخ صحیح نیست.");
    return;
  }
  db.settings.manualDate = k;
  currentKey = k;
  saveDB();
  closeModal();
  render();
}

/* -------------------- Reset Btn -------------------- */
function resetAllData() {
  if (
    confirm(
      "آیا از پاک‌سازی کامل اطلاعات و شروع مجدد از روز اول مطمئن هستید؟ (همه چیز حذف خواهد شد)",
    )
  ) {
    try {
      localStorage.clear();
      localStorage.removeItem("deedTrackerDB_v1");
    } catch (e) {
      console.error(e);
    }

    // پاک‌سازی دیتابیس در حافظه موقت برنامه
    db = structuredClone(DEFAULT_DB);
    db.firstOpenedAt = nowISO();
    db.settings.startDate = jalaliKey(todayJalali());
    saveDB();

    // رفرش اجباری صفحه و دور زدن کش مرورگر با افزودن پارامتر زمانی
    window.location.replace(window.location.pathname + "?reset=" + Date.now());
  }
}

/* -------------------- Scroll Behavior -------------------- */
window.addEventListener("scroll", () => {
  const sticky = document.getElementById("stickyHeader");
  if (sticky) {
    if (window.scrollY > 40) sticky.classList.add("scrolled");
    else sticky.classList.remove("scrolled");
  }
});

/* -------------------- Summary Of Day -------------------- */
function summaryModal() {
  const d = ensureDay(currentKey),
    sc = scoreDay(d);
  const required = allActivityItems().filter((a) => a.required);
  const misses = required.filter((a) => statusOf(d, a.id) === "x");

  openModal(`<h2>گزارش ${prettyDate(currentKey)}</h2>
 <div class="summary-list">
  <div class="summary-item full-width">
   <span>جمع کل امتیازات مثبت</span>
   <b>${e2p(sc.positive)} امتیاز</b>
  </div>
  <div class="summary-item"><span>فعالیت انجام‌شده</span><b>${e2p(sc.done)}</b></div>
  <div class="summary-item"><span>اختیاری انجام‌شده</span><b>${e2p(sc.optionalDone)}</b></div>
  <div class="summary-item"><span>کاستی / سستی</span><b>${e2p(sc.requiredMisses)}</b></div>
  <div class="summary-item"><span>امتیاز مطالعه</span><b>${e2p(sc.studyPoints)}</b></div>
  <div class="summary-item"><span>امتیاز توضیحات</span><b>${e2p(sc.notesPoints)}</b></div>
 </div>
 <h3 style="color:var(--red);margin-top:16px;font-size:14px;">کاستی‌های اجباری (${e2p(misses.length)})</h3>
 ${misses.length ? `<ul style="max-height: 140px; overflow-y: auto; padding-right: 15px; margin: 5px 0 0; font-size: 13px;">${misses.map((a) => `<li>${esc(a.title)} — ${e2p(a.points)} امتیاز</li>`).join("")}</ul>` : `<p style="color:var(--green);font-weight:800;font-size:13px;margin-top:6px;">هیچ فعالیت اجباری ثبت‌نشده‌ای وجود ندارد.</p>`}`);
}

function monthlySummaryModal() {
  const currentDate = keyToJalali(currentKey);
  const year = currentDate.jy;
  const month = currentDate.jm;

  const monthKeys = Object.keys(db.days).filter((key) => {
    const j = keyToJalali(key);
    return j.jy === year && j.jm === month;
  });

  const activities = allActivityItems();

  const stats = {};

  activities.forEach((a) => {
    stats[a.id] = {
      activity: a,
      count: 0,
      participate: 0,
      organize: 0,
      congregation: 0,
      individual: 0,
      qada: 0,
      points: 0,
    };
  });

  let totalPoints = 0;
  let activeDays = 0;

  monthKeys.forEach((key) => {
    const day = db.days[key];
    if (!day) return;

    const dayScore = scoreDay(day);
    totalPoints += dayScore.positive;

    if (Object.values(day.statuses || {}).some((status) => status !== "x")) {
      activeDays++;
    }

    activities.forEach((a) => {
      const s = statusOf(day, a.id);

      if (s === "participate") {
        stats[a.id].participate++;
        stats[a.id].count++;
        stats[a.id].points += a.points;
      } else if (s === "organize") {
        stats[a.id].organize++;
        stats[a.id].count++;
        stats[a.id].points += a.secondaryPoints;
      } else if (s === "congregation") {
        stats[a.id].congregation++;
        stats[a.id].count++;
        stats[a.id].points += 20;
      } else if (s === "individual") {
        stats[a.id].individual++;
        stats[a.id].count++;
        stats[a.id].points += 10;
      } else if (s === "qada") {
        stats[a.id].qada++;
        stats[a.id].count++;
        stats[a.id].points += 5;
      } else if (s === "y") {
        stats[a.id].count++;
        stats[a.id].points += a.points;
      }
    });
  });

  const monthName = MONTHS[month - 1];

  const rows = activities
    .filter((a) => stats[a.id].count > 0)
    .map((a) => {
      const st = stats[a.id];

      let detail = "";

      if (a.type === "dual") {
        detail = `
          شرکت: ${e2p(st.participate)}
          <br>
          برگزاری: ${e2p(st.organize)}
        `;
      } else if (["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(a.id)) {
        detail = `
          جماعت: ${e2p(st.congregation)}
          <br>
          فردی: ${e2p(st.individual)}
          <br>
          قضا: ${e2p(st.qada)}
        `;
      } else {
        detail = `تعداد انجام: ${e2p(st.count)}`;
      }

      return `
        <div class="summary-item" style="display:block;">
          <div style="font-weight:800;margin-bottom:5px;">
            ${esc(a.title)}
          </div>

          <div style="font-size:12px;color:var(--muted);line-height:1.8;">
            ${detail}
          </div>

          <div style="margin-top:5px;font-weight:700;">
            ${e2p(st.points)} امتیاز
          </div>
        </div>
      `;
    })
    .join("");

  openModal(`
    <h2>گزارش ماهانه</h2>

    <div style="
      margin-bottom:15px;
      padding:12px;
      background:rgba(0,0,0,0.04);
      border-radius:10px;
      line-height:2;
    ">
      <div>
        <b>ماه:</b>
        ${esc(monthName)} ${e2p(year)}
      </div>

      <div>
        <b>روزهای دارای فعالیت:</b>
        ${e2p(activeDays)}
      </div>

      <div>
        <b>مجموع امتیاز ماه:</b>
        ${e2p(totalPoints)}
      </div>
    </div>

    <h3 style="
      color:var(--red);
      margin-top:10px;
      font-size:14px;
    ">
      فعالیت‌های انجام‌شده
    </h3>

    <div class="summary-list" style="
      max-height:420px;
      overflow-y:auto;
    ">
      ${
        rows ||
        `<div class="empty">
          در این ماه فعالیتی ثبت نشده است.
        </div>`
      }
    </div>
  `);
}

/* -------------------- First launch -------------------- */
function firstLaunch() {
  if (!storageSelfTest()) warnStorageOnce();
  if (!db.firstOpenedAt) {
    db.firstOpenedAt = nowISO();
    saveDB();
  }
  if (!db.initialized) {
    if (!db.rulesAccepted) rulesModal();
    else userModal();
    return;
  }
  render();
}

/* Update auto date whenever app returns to foreground / opens */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && db.initialized && db.settings.dateMode === "auto") {
    const today = jalaliKey(todayJalali());
    currentKey = today;
    render();
  }
});
window.addEventListener("focus", () => {
  if (db.initialized && db.settings.dateMode === "auto") {
    currentKey = jalaliKey(todayJalali());
    render();
  }
});

firstLaunch();
