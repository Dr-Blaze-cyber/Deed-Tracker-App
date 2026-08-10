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
  localStorage.setItem(DB_KEY, JSON.stringify(db));
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
const A = (id, title, required = false, points = 0) => ({
  id,
  title,
  required,
  points,
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
          A("ishraq", "اشراق", false, 3),
          A("awwabin", "اوابین", false, 3),
          A("tahajjud", "تهجد", false, 5),
          A("wuduTahiyyah", "تحیة‌الوضو", false, 2),
          A("mosqueTahiyyah", "تحیة‌المسجد", false, 2),
        ],
      },
    ],
  },
  adhkar: {
    title: "ادعیه و اذکار صبح و شام",
    groups: [
      {
        title: "صبح",
        items: [
          A("morningDua", "دعا", true, 2),
          A("morningIstighfar", "۱۰۰ مرتبه استغفار", true, 2),
          A("morningSalawat", "۱۰۰ مرتبه درود", true, 2),
          A("morningThirdKalima", "۱۰۰ مرتبه کلمه سوم", true, 2),
          A("morningMunajat", "مناجات مقبول", false, 2),
        ],
      },
      {
        title: "شام",
        items: [
          A("eveningDua", "دعا", true, 2),
          A("eveningIstighfar", "۱۰۰ مرتبه استغفار", true, 2),
          A("eveningSalawat", "۱۰۰ مرتبه درود", true, 2),
          A("eveningThirdKalima", "۱۰۰ مرتبه کلمه سوم", true, 2),
          A("eveningMunajat", "مناجات مقبول", false, 2),
        ],
      },
    ],
  },
  quran: {
    title: "تلاوت قرآن مجید",
    groups: [
      {
        title: "ختم قرآن",
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
          A("yasin", "یس", false, 2),
          A("mulk", "ملک", false, 2),
          A("sajdah", "سجده", false, 2),
          A("kahf", "کهف", false, 2),
        ],
      },
    ],
  },
  meetings: {
    title: "مجالستی",
    items: [
      A("fikriForm", "تشکیل جلسه فکری/اصلاحی", false, 4),
      A("fikriAttend", "شرکت در جلسه فکری/اصلاحی", false, 3),
      A("sirahForm", "تشکیل جلسه سیرت، تفسیر یا تاریخ", false, 4),
      A("sirahAttend", "شرکت در جلسه سیرت، تفسیر یا تاریخ", false, 3),
      A(
        "tablighCenter",
        "شرکت در تشکیل یا شب‌نشینی مرکز جماعت تبلیغ",
        false,
        4,
      ),
    ],
  },
  cultural: {
    title: "فرهنگی",
    items: [
      A("scholarsMonthly", "ملاقات ماهانه با علمای منطقه", false, 5),
      A("scholarsGroup", "برگزاری دیدارهای جمعی با علما", false, 4),
      A("piousFriends", "همنشینی با دوستان اهل فضل", false, 3),
      A("religiousAudio", "استماع فایل‌های صوتی دینی", false, 2),
      A("reformBookStudy", "مدارسه کتاب فکری/اصلاحی", false, 4),
      A("groupBookTalk", "مذاکره گروهی کتاب فکری", false, 4),
    ],
  },
  religiousSkills: {
    title: "کسب مهارت دینی",
    items: [
      A("reading", "روخوانی", false, 3),
      A("fluentReading", "روان‌خوانی", false, 3),
      A("tajweed", "تجوید", false, 4),
    ],
  },
  writingSkills: {
    title: "کسب مهارت‌های نوشتاری",
    items: [
      A("editing", "ویراستاری", false, 3),
      A("writing", "نویسندگی", false, 4),
      A("literature", "مطالعه کتاب و مقالات ادبی", false, 3),
    ],
  },
  speakingSkills: {
    title: "کسب مهارت گفتاری",
    items: [
      A("management", "مدیریت", false, 3),
      A("psychology", "روانشناسی", false, 3),
      A("publicSpeaking", "فن بیان", false, 4),
    ],
  },
  character: {
    title: "اصلاح تزکیه و اخلاق",
    items: [
      A("patienceGratitude", "کسب صبر و شکر", true, 2),
      A("ethicsTaqwa", "کسب اخلاق و تقوی", true, 2),
      A("tawakkulRida", "کسب توکل و رضا", true, 2),
      A("honestyTrust", "کسب صداقت و حفظ امانت", true, 2),
      A("contentmentCertainty", "کسب قناعت و یقین", false, 2),
      A("sinAvoidance", "تمرین ترک گناه", true, 3),
      A("guardSenses", "حفظ نگاه، گوش، زبان و فکر", true, 3),
      A("envyShowoff", "ترک حسد و ریا", true, 2),
      A("lyingBackbiting", "ترک دروغ و غیبت", true, 3),
      A("angerGrudge", "ترک خشم و کینه", false, 2),
    ],
  },
  islamicCustoms: {
    title: "آداب و رسوم اسلامی",
    items: [
      A("parentsRights", "رعایت حقوق والدین", true, 3),
      A("relativesNeighbors", "رعایت حقوق خویشاوند و همسایه", true, 3),
      A("tradeManners", "ترویج آداب معاملات و معاشرات اسلامی", false, 2),
      A("familyRelations", "تلاش در جهت تقویت روابط اقوام با یکدیگر", false, 2),
      A("silatRahim", "صله رحم", false, 3),
      A(
        "removeInnovationsFuneralWedding",
        "رفع بدعات در تعزیت و عروسی",
        false,
        2,
      ),
      A("islamicWedding", "مشارکت در برگزاری عروسی‌های اسلامی", false, 2),
      A("communityInnovations", "تلاشی در جهت رفع بدعات جامعه", false, 3),
    ],
  },
  social: {
    title: "اجتماعی",
    items: [
      A("visitSick", "عیادت بیماران", false, 3),
      A("shareJoySorrow", "مشارکت در شادی و غم", false, 3),
      A("socialServices", "مشارکت در خدمات اجتماعی", false, 4),
      A("socialProblems", "حرکت در جهت رفع معضلات اجتماعی", false, 4),
    ],
  },
  financial: {
    title: "مالی",
    items: [
      A("work", "فعالیت شغلی و کاری", true, 4),
      A("entrepreneurship", "اشتغالزایی و کارآفرینی", false, 4),
      A("charity", "انفاق از درآمد ماهانه", false, 4),
      A("technicalSkill", "کسب مهارت فنی", false, 3),
    ],
  },
  sports: {
    title: "ورزش و مهارت",
    items: [
      A("walking", "پیاده‌روی", false, 3),
      A("mountain", "کوهنوردی", false, 5),
      A("purposefulCamp", "اردوهای هدفمند", false, 4),
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

/* -------------------- Scoring -------------------- */
function scoreDay(day) {
  let positive = 0,
    requiredMisses = 0,
    done = 0,
    optionalDone = 0,
    applicable = 0;
  allActivityItems().forEach((a) => {
    const s = statusOf(day, a.id);
    if (s === "y") {
      positive += a.points;
      done++;
      applicable++;
      if (!a.required) optionalDone++;
    } else if (s === "x") {
      applicable++;
      if (a.required) requiredMisses++;
    }
  });
  const studyPoints = Math.min(
    10,
    Math.floor(day.study.reduce((n, r) => n + (Number(r.pages) || 0), 0) / 10),
  );
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
function toggleHTML(a, day) {
  const s = statusOf(day, a.id);
  const next = s === "y" ? "x" : s === "x" ? "y" : "x";
  return `<button class="toggle ${next === "y" ? "done" : ""}" onclick="toggleActivity('${a.id}')">${next === "y" ? "✓" : "×"}</button>`;
}
function activityRow(a, day) {
  return `<div class="activity">
   <div class="activity-info">
    <div class="activity-title">${esc(a.title)}</div>
    <div class="activity-meta">${a.required ? "اجباری" : "اختیاری"} · ${e2p(a.points)} امتیاز</div>
   </div>${toggleHTML(a, day)}
 </div>`;
}
function sectionHTML(key, day) {
  const sec = ACTIVITIES[key];
  let body = "";
  if (sec.groups) {
    body = `<div class="subgrid">${sec.groups
      .map(
        (g) => `
   <div class="subcard">
    <div class="subcard-title">${esc(g.title)}</div>
    ${g.items.map((a) => activityRow(a, day)).join("")}
   </div>`,
      )
      .join("")}</div>`;
  } else {
    body = sec.items.map((a) => activityRow(a, day)).join("");
  }
  return `<section class="section"><div class="section-head"><h2 class="section-title">${esc(sec.title)}</h2></div><div class="section-body">${body}</div></section>`;
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
   <div class="section-head"><h2 class="section-title">۴. برنامه مطالعاتی</h2><button class="btn btn-light" onclick="addStudy()">＋ افزودن کتاب</button></div>
   <div class="section-body">${rows}</div>
 </section>`;
}
function notesHTML(day) {
  return `<section class="section">
  <div class="section-head"><h2 class="section-title">۱۶. توضیحات فرد</h2></div>
  <div class="section-body">
   <textarea class="notes" placeholder="نقاط قوت و ضعف فردی، علل و عوامل آن و سایر توضیحات روزانه..." onchange="updateNotes(this.value)">${esc(day.notes)}</textarea>
   <div class="activity-meta" style="margin-top:7px">تکمیل معنادار یادداشت روزانه: ۲ امتیاز اختیاری</div>
  </div>
 </section>`;
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
  const maxRequired = allActivityItems()
    .filter((a) => a.required)
    .reduce((n, a) => n + a.points, 0);
  const pct = maxRequired
    ? Math.min(100, Math.round((sc.positive / maxRequired) * 100))
    : 0;

  // بررسی وضعیت اسکرول صفحه
  const isScrolled = window.scrollY > 40 ? "scrolled" : "";

  document.getElementById("app").innerHTML = `
  <header class="app-header">
   <div class="app-title">Deed Tracker</div>
   <div class="app-subtitle">ثبت و پیگیری اعمال، عبادات، مهارت‌ها و فعالیت‌های روزانه</div>
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
    <div class="progress-row">
     <span>امتیاز مثبت امروز</span>
     <strong class="score">${e2p(sc.positive)}</strong>
    </div>
    <div class="progress">
     <span style="width:${pct}%"></span>
    </div>
    <div class="progress-row" style="margin-top:8px;color:var(--muted)">
     <span>✓ اجباری: ${e2p(sc.done)} --- اختیاری : ${e2p(sc.optionalDone)}</span>
     <span>کاستی: ${e2p(sc.requiredMisses)}</span>
    </div>
   </div>
  </div>

  ${sectionHTML("prayers", day)}
  ${sectionHTML("adhkar", day)}
  ${sectionHTML("quran", day)}
  ${studyHTML(day)}
  ${sectionHTML("meetings", day)}
  ${sectionHTML("cultural", day)}
  ${sectionHTML("religiousSkills", day)}
  ${sectionHTML("writingSkills", day)}
  ${sectionHTML("speakingSkills", day)}
  ${sectionHTML("character", day)}
  ${sectionHTML("islamicCustoms", day)}
  ${sectionHTML("social", day)}
  ${sectionHTML("financial", day)}
  ${sectionHTML("sports", day)}
  ${sectionHTML("dailyReview", day)}
  ${notesHTML(day)}

  <div class="footer-actions">
   <button class="btn btn-light" onclick="settingsModal()">تنظیمات و اطلاعات کاربر</button>
   <button class="btn btn-light" onclick="summaryModal()">گزارش روز</button>
  </div>`;
  saveDB();
}

function toggleActivity(id) {
  const d = ensureDay(currentKey);
  const s = statusOf(d, id);
  const nextStatus = s === "y" ? "x" : "y";

  if (nextStatus === "y") {
    let isExclusive = false;
    let groupItems = [];

    // جستجو برای پیدا کردن گروه و بررسی انحصاری بودن آن
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

    // خاموش کردن سایر گزینه‌های هم‌گروه
    if (isExclusive) {
      groupItems.forEach((item) => {
        if (item.id !== id) setStatus(d, item.id, "x");
      });
    }
  }

  setStatus(d, id, nextStatus);
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

/* -------------------- First launch -------------------- */
function firstLaunch() {
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
