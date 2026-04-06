import {
  db,
  COL,
  collection,
  getDocs,
  query,
  where,
} from "./firebase.js";
import { $, escapeHtml } from "./utils.js";

// ─── State ───────────────────────────────────────────────
let dashboardHealthYearWired = false;
let dashAnnualHealthCache = null;

// ─── Constants ───────────────────────────────────────────
const USER_ROLE_ORDER = ["pending", "admin", "vet", "keeper", "food"];
const USER_ROLE_LABELS = {
  pending: "รอกำหนดตำแหน่ง",
  admin: "ผู้บริหาร / แอดมิน",
  vet: "สัตวแพทย์",
  keeper: "เจ้าหน้าที่ดูแลสัตว์",
  food: "คลังอาหาร",
};

// ─── Helpers ─────────────────────────────────────────────

/** นาทีนับจากเที่ยงคืน → "HH:mm" */
function minutesToClock(totalMins) {
  const day = 24 * 60;
  const m = ((totalMins % day) + day) % day;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** ดึงจำนวน docs จาก QuerySnapshot แบบ safe */
function snapSize(snap) {
  return typeof snap.size === "number" ? snap.size : snap.docs?.length ?? 0;
}

// ─── Renderers ───────────────────────────────────────────

function renderDashboardByType(animalsSnap, typesSnap) {
  const grid = $("#dashboardByTypeGrid");
  if (!grid) return;

  const counts = new Map();
  typesSnap.forEach((d) => counts.set(d.id, 0));

  let unknown = 0;
  animalsSnap.forEach((d) => {
    const id = d.data().typeId;
    if (counts.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    else unknown += 1;
  });

  const items = [];
  typesSnap.forEach((d) => {
    items.push({ name: d.data().name || d.id, count: counts.get(d.id) ?? 0 });
  });
  if (unknown) items.push({ name: "ไม่ระบุประเภท", count: unknown });
  items.sort((a, b) => a.name.localeCompare(b.name, "th"));

  if (!items.length) {
    grid.innerHTML = '<p class="hint">ยังไม่มีประเภทสัตว์หรือสัตว์ในระบบ</p>';
    return;
  }

  const total = items.reduce((sum, it) => sum + it.count, 0);

  grid.innerHTML = `
    <p class="dashboard-type-summary">
      สัตว์ทั้งหมด <strong>${total}</strong> ตัว — แยกเป็น ${items.length} ประเภท
    </p>
    <div class="dashboard-type-chips-row">
      ${items
        .map(
          (it) => `
          <div class="dashboard-type-chip ${it.count === 0 ? "chip-empty" : ""}">
            <span class="dashboard-type-name">${escapeHtml(it.name)}</span>
            <span class="dashboard-type-badge">${it.count} ตัว</span>
          </div>`
        )
        .join("")}
    </div>`;
}

function fillDashboardAnnualHealthList(year, healthSnap, typesMap, nounMap) {
  const list = $("#dashboardAnnualHealthList");
  if (!list) return;

  // เก็บเฉพาะ record ล่าสุดของแต่ละคู่ typeId|nounId
  const byKey = new Map();
  healthSnap.forEach((d) => {
    const h = d.data();
    if (h.recordKind !== "annual") return;
    if (Number(h.year) !== year) return;
    if (!h.typeId || !h.nounId) return;
    const key = `${h.typeId}|${h.nounId}`;
    const prev = byKey.get(key);
    const dStr = h.date || "";
    if (!prev || dStr > (prev.date || "")) byKey.set(key, { ...h, date: dStr });
  });

  const items = [...byKey.values()].sort((a, b) => {
    const la = `${typesMap.get(a.typeId) || ""} · ${nounMap.get(a.nounId) || ""}`;
    const lb = `${typesMap.get(b.typeId) || ""} · ${nounMap.get(b.nounId) || ""}`;
    return la.localeCompare(lb, "th");
  });

  if (!items.length) {
    list.innerHTML = '<p class="hint">ยังไม่มีบันทึกตรวจประจำปีในปีนี้</p>';
    return;
  }

  list.innerHTML = items
    .map((h) => {
      const label = `${typesMap.get(h.typeId) || "?"} · ${nounMap.get(h.nounId) || "?"}`;
      const res = h.annualResult || "—";
      const cls =
        res === "ผ่าน" ? "health-pass" :
        res === "ไม่ผ่าน" ? "health-fail" :
        "health-watch";
      return `
        <div class="dashboard-annual-row ${cls}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(res)}</strong>
        </div>`;
    })
    .join("");
}

function renderDashboardUsersByRole(usersSnap) {
  const grid = $("#dashboardUserRoleGrid");
  const hint = $("#dashboardUsersTotalHint");
  const statTotal = $("#statTotalUsers");
  const total = snapSize(usersSnap);

  if (statTotal) statTotal.textContent = String(total);
  if (hint) hint.textContent = `ทั้งหมด ${total} คน`;
  if (!grid) return;

  const counts = new Map(USER_ROLE_ORDER.map((k) => [k, 0]));
  let other = 0;

  usersSnap.forEach((d) => {
    const raw = d.data().role;
    const r = !raw || String(raw).trim() === "" ? "pending" : raw;
    if (counts.has(r)) counts.set(r, counts.get(r) + 1);
    else other += 1;
  });

  const items = USER_ROLE_ORDER.map((key) => ({
    name: USER_ROLE_LABELS[key],
    count: counts.get(key) ?? 0,
  }));
  if (other) items.push({ name: "อื่น ๆ / ไม่ระบุบทบาท", count: other });

  grid.innerHTML = items
    .map(
      (it) => `
      <div class="dashboard-type-chip dashboard-role-chip">
        <span class="dashboard-type-count" aria-label="จำนวน">${it.count}</span>
        <span class="dashboard-type-name">${escapeHtml(it.name)}</span>
        <span class="dashboard-type-unit">คน</span>
      </div>`
    )
    .join("");
}

// ─── Year dropdown (wire ครั้งเดียวต่อ element) ──────────
function setupDashboardHealthYear() {
  const sel = $("#dashboardHealthYearSelect");
  if (!sel || dashboardHealthYearWired) return;
  dashboardHealthYearWired = true;
  sel.addEventListener("change", () => {
    const y = Number(sel.value);
    if (!dashAnnualHealthCache || !Number.isFinite(y)) return;
    const { healthSnap, typesMap, nounMap } = dashAnnualHealthCache;
    fillDashboardAnnualHealthList(y, healthSnap, typesMap, nounMap);
  });
}

// ─── Public API ──────────────────────────────────────────

export async function loadDashboard() {
  const totalEl   = $("#statTotalAnimals");
  const typesEl   = $("#statAnimalTypes");
  const pendEl    = $("#statPendingPurchases");
  const healthEl  = $("#statHealthRecords");
  const greetEl   = $("#dashboardGreeting");

  // Greeting
  const profile = window.currentUserProfile;
  if (greetEl) {
    const name = profile?.displayName || profile?.email || "";
    greetEl.textContent = name
      ? `สวัสดี ${name} — นี่คือสรุปสถานะหลักของระบบวันนี้`
      : "สรุปสถานะหลักของระบบ (เข้าสู่ระบบเพื่อแสดงชื่อ)";
  }

  // ── ข้อมูลหลัก (parallel) ──
  try {
    const [animals, types, nounsSnap, healthSnap] = await Promise.all([
      getDocs(collection(db, COL.animals)),
      getDocs(collection(db, COL.animalTypes)),
      getDocs(collection(db, COL.nouns)),
      getDocs(collection(db, COL.healthRecords)),
    ]);

    if (totalEl)  totalEl.textContent  = String(snapSize(animals));
    if (typesEl)  typesEl.textContent  = String(snapSize(types));
    if (healthEl) healthEl.textContent = String(snapSize(healthSnap));

    renderDashboardByType(animals, types);

    // Build maps
    const typesMap = new Map();
    types.forEach((d) => typesMap.set(d.id, d.data().name));
    const nounMap = new Map();
    nounsSnap.forEach((d) => nounMap.set(d.id, d.data().name));

    dashAnnualHealthCache = { healthSnap, typesMap, nounMap };

    // Year dropdown
    const cy = new Date().getFullYear();
    const years = new Set([cy]);
    healthSnap.forEach((d) => {
      const h = d.data();
      if (h.recordKind === "annual" && h.year != null) {
        const y = Number(h.year);
        if (Number.isFinite(y)) years.add(y);
      }
    });

    const yearSel = $("#dashboardHealthYearSelect");
    if (yearSel) {
      yearSel.innerHTML = [...years]
        .sort((a, b) => b - a)
        .map((y) => `<option value="${y}">${y}</option>`)
        .join("");
      yearSel.value = String(cy);
    }

    setupDashboardHealthYear();
    fillDashboardAnnualHealthList(cy, healthSnap, typesMap, nounMap);
  } catch (err) {
    console.error("dashboard main", err);
    if (healthEl) healthEl.textContent = "?";
    const grid = $("#dashboardByTypeGrid");
    if (grid) grid.innerHTML = '<p class="hint">โหลดข้อมูลไม่สำเร็จ</p>';
    const ann = $("#dashboardAnnualHealthList");
    if (ann) ann.innerHTML = '<p class="hint">โหลดผลตรวจประจำปีไม่สำเร็จ</p>';
  }

  // ── คำร้องจัดซื้อ (แยก try เพราะ Firestore rules อาจต่างกัน) ──
  try {
    const pendingSnap = await getDocs(
      query(collection(db, COL.purchaseRequests), where("status", "==", "รอดำเนินการ"))
    );
    if (pendEl) pendEl.textContent = String(snapSize(pendingSnap));
  } catch (err) {
    console.warn("dashboard pending purchases", err);
    if (pendEl) pendEl.textContent = "—";
  }

  // ── ผู้ใช้งาน ──
  try {
    const usersSnap = await getDocs(collection(db, COL.appUsers));
    renderDashboardUsersByRole(usersSnap);
  } catch (err) {
    console.warn("dashboard appUsers", err);
    if ($("#statTotalUsers")) $("#statTotalUsers").textContent = "—";
    if ($("#dashboardUsersTotalHint")) $("#dashboardUsersTotalHint").textContent = "โหลดจำนวนผู้ใช้ไม่สำเร็จ";
    const grid = $("#dashboardUserRoleGrid");
    if (grid) grid.innerHTML = '<p class="hint">ไม่มีสิทธิ์อ่านข้อมูลผู้ใช้ — ตรวจ Firestore rules</p>';
  }
}

export async function loadReports() {
  // ✅ ครอบด้วย try/catch และดึงข้อมูลแบบ parallel
  try {
    const [animalsSnap, healthSnap, feedingSnap, typesSnap, foods] = await Promise.all([
      getDocs(collection(db, COL.animals)),
      getDocs(collection(db, COL.healthRecords)),
      getDocs(collection(db, COL.feedingLogs)),
      getDocs(collection(db, COL.animalTypes)),
      getDocs(collection(db, COL.feedItems)),
    ]);

    const typesMap = new Map();
    typesSnap.forEach((d) => typesMap.set(d.id, d.data().name));

    // สัตว์แยกตามประเภท
    const byType = new Map();
    animalsSnap.forEach((d) => {
      const name = typesMap.get(d.data().typeId) || "ไม่ระบุ";
      byType.set(name, (byType.get(name) || 0) + 1);
    });
    const rType = $("#reportAnimalsByType");
    if (rType) {
      rType.innerHTML = [...byType.entries()]
        .map(([name, count]) => `<li>${escapeHtml(name)}: ${count} ตัว</li>`)
        .join("") || "<li>ไม่มีข้อมูล</li>";
    }

    // สถานะสุขภาพ
    const healthStatus = new Map();
    healthSnap.forEach((d) => {
      const h = d.data();
      const label =
        h.recordKind === "annual"
          ? `ประจำปี: ${h.annualResult || "-"}`
          : h.status || "ไม่ระบุ";
      healthStatus.set(label, (healthStatus.get(label) || 0) + 1);
    });
    const rHealth = $("#reportHealthStatus");
    if (rHealth) {
      rHealth.innerHTML = [...healthStatus.entries()]
        .map(([status, count]) => `<li>${escapeHtml(status)}: ${count} รายการ</li>`)
        .join("") || "<li>ไม่มีข้อมูล</li>";
    }

    // ✅ ฟิลเตอร์ 30 วันใน client (ควรย้ายไป Firestore query ในอนาคต)
    const fMap = new Map();
    foods.forEach((d) => fMap.set(d.id, d.data().name));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    const foodUsage = new Map();
    feedingSnap.forEach((d) => {
      const f = d.data();
      if (!f.date) return;
      if (new Date(f.date) < cutoff) return;
      const label = fMap.get(f.feedItemId) || "ไม่ระบุ";
      foodUsage.set(label, (foodUsage.get(label) || 0) + (f.amount || 0));
    });
    const rFood = $("#reportFoodUsage");
    if (rFood) {
      rFood.innerHTML = [...foodUsage.entries()]
        .map(([name, amount]) => `<li>${escapeHtml(name)}: ${amount} หน่วย (30 วัน)</li>`)
        .join("") || "<li>ไม่มีข้อมูลในช่วง 30 วันที่ผ่านมา</li>";
    }

    // สรุปรวม
    const rSum = $("#reportSummary");
    if (rSum) {
      rSum.innerHTML = `
        <li>สัตว์ทั้งหมด: ${snapSize(animalsSnap)} ตัว</li>
        <li>บันทึกสุขภาพ: ${snapSize(healthSnap)} รายการ</li>
        <li>บันทึกให้อาหาร: ${snapSize(feedingSnap)} รายการ</li>
      `;
    }
  } catch (err) {
    console.error("loadReports", err);
    ["#reportAnimalsByType", "#reportHealthStatus", "#reportFoodUsage", "#reportSummary"].forEach(
      (id) => {
        const el = $(id);
        if (el) el.innerHTML = "<li>โหลดข้อมูลไม่สำเร็จ</li>";
      }
    );
  }
}

export async function loadTodayTasks() {
  const tbody = $("#todayTasksBody");
  const hint  = $("#todayTasksHint");
  if (!tbody) return;

  if (hint) {
    hint.textContent = new Date().toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const profile = window.currentUserProfile;
  if (!profile) {
    tbody.innerHTML = "<tr><td colspan='3'>กรุณาเข้าสู่ระบบเพื่อดูตารางการทำงาน</td></tr>";
    return;
  }

  try {
    const [animalsSnap, typesSnap] = await Promise.all([
      getDocs(collection(db, COL.animals)),
      getDocs(collection(db, COL.animalTypes)),
    ]);

    const typesMap = new Map();
    typesSnap.forEach((d) => typesMap.set(d.id, d.data().name));

    const myAnimals = [];
    animalsSnap.forEach((d) => {
      const a = d.data();
      if (a.caretakerId === profile.id) myAnimals.push({ id: d.id, ...a });
    });

    if (!myAnimals.length) {
      tbody.innerHTML = "<tr><td colspan='3'>วันนี้ยังไม่มีงานที่มอบหมาย</td></tr>";
      return;
    }

    // รวมกลุ่มตามประเภทสัตว์
    const typeNames = [...new Set(
      myAnimals.map((a) => typesMap.get(a.typeId) || a.typeId || "ไม่ระบุ")
    )].sort((a, b) => a.localeCompare(b, "th"));

    // ⚠️ เวลาคำนวณจาก index — ควรเปลี่ยนเป็น schedule จริงในอนาคต
    tbody.innerHTML = typeNames
      .map((typeName, i) => `
        <tr>
          <td>${minutesToClock(10 * 60 + i * 90)}</td>
          <td>ให้อาหาร</td>
          <td>${escapeHtml(typeName)}</td>
        </tr>`)
      .join("");
  } catch (err) {
    console.error("loadTodayTasks", err);
    tbody.innerHTML = "<tr><td colspan='3'>โหลดตารางการทำงานไม่สำเร็จ</td></tr>";
  }
}