import {
  db,
  COL,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "./firebase.js";
import { $, $$, showToast, setLoading, escapeHtml } from "./utils.js";

/** รายการคำนาม { id, name, typeId } */
let healthNounsCache = [];

function initHealthModeTabs() {
  const tabs = $$("#section-health .health-mode-tabs .tab-button");
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      const mode = tab.dataset.healthMode;
      $$("#section-health .health-panel").forEach((p) =>
        p.classList.toggle("active", p.id === `health-panel-${mode}`)
      );
    });
  });
}

function fillSelectFromSnap(sel, snap, { labelKey = "name" } = {}) {
  if (!sel) return;
  const opts = ['<option value="">-- เลือก --</option>'];
  snap.forEach((d) => {
    const data = d.data();
    opts.push(
      `<option value="${d.id}">${escapeHtml(data[labelKey] || d.id)}</option>`
    );
  });
  sel.innerHTML = opts.join("");
}

/** เติมรายการคำนามจากข้อมูลอ้างอิงทั้งหมด — ถ้าเลือกประเภทแล้วจะเรียงให้ตรงประเภทก่อน (◇ = ผูกประเภทอื่นในข้อมูลอ้างอิง) */
function refillHealthNounSelect(selectEl, typeId) {
  if (!selectEl) return;
  const prev = selectEl.value;
  const opts = ['<option value="">-- เลือกคำนาม --</option>'];
  let list = [...healthNounsCache];
  if (typeId) {
    const isMatch = (n) => !n.typeId || n.typeId === typeId;
    const match = list.filter(isMatch);
    const other = list.filter((n) => !isMatch(n));
    list = [...match, ...other];
  }
  list.forEach(({ id, name, typeId: nt }) => {
    const mark =
      typeId && nt && nt !== typeId ? "◇ " : "";
    opts.push(
      `<option value="${id}">${mark}${escapeHtml(name)}</option>`
    );
  });
  selectEl.innerHTML = opts.join("");
  if (prev && [...selectEl.options].some((o) => o.value === prev)) {
    selectEl.value = prev;
  }
}

let healthSelectListenersWired = false;

/** โหลดประเภท + คำนาม และเติม dropdown (เรียกหลังแก้ข้อมูลอ้างอิงได้) */
export async function populateHealthReferenceSelects() {
  const [typesSnap, nounsSnap] = await Promise.all([
    getDocs(collection(db, COL.animalTypes)),
    getDocs(collection(db, COL.nouns)),
  ]);
  healthNounsCache = [];
  nounsSnap.forEach((d) => {
    const n = d.data();
    healthNounsCache.push({
      id: d.id,
      name: n.name || "",
      typeId: n.typeId || "",
    });
  });
  healthNounsCache.sort((a, b) => a.name.localeCompare(b.name, "th"));

  fillSelectFromSnap($("#healthAnnualTypeSelect"), typesSnap);
  fillSelectFromSnap($("#healthIllnessTypeSelect"), typesSnap);

  refillHealthNounSelect(
    $("#healthAnnualNounSelect"),
    $("#healthAnnualTypeSelect")?.value || ""
  );
  refillHealthNounSelect(
    $("#healthIllnessNounSelect"),
    $("#healthIllnessTypeSelect")?.value || ""
  );

  if (!healthSelectListenersWired) {
    healthSelectListenersWired = true;
    $("#healthAnnualTypeSelect")?.addEventListener("change", () => {
      refillHealthNounSelect(
        $("#healthAnnualNounSelect"),
        $("#healthAnnualTypeSelect").value
      );
    });
    $("#healthIllnessTypeSelect")?.addEventListener("change", () => {
      refillHealthNounSelect(
        $("#healthIllnessNounSelect"),
        $("#healthIllnessTypeSelect").value
      );
    });
    $("#healthAnnualNounSelect")?.addEventListener("change", () => {
      const nSel = $("#healthAnnualNounSelect");
      const tSel = $("#healthAnnualTypeSelect");
      const n = healthNounsCache.find((x) => x.id === nSel.value);
      if (n?.typeId && tSel) {
        tSel.value = n.typeId;
        refillHealthNounSelect(nSel, n.typeId);
        nSel.value = n.id;
      }
    });
    $("#healthIllnessNounSelect")?.addEventListener("change", () => {
      const nSel = $("#healthIllnessNounSelect");
      const tSel = $("#healthIllnessTypeSelect");
      const n = healthNounsCache.find((x) => x.id === nSel.value);
      if (n?.typeId && tSel) {
        tSel.value = n.typeId;
        refillHealthNounSelect(nSel, n.typeId);
        nSel.value = n.id;
      }
    });
  }
}

function subjectFromHealthRecord(h, typeMap, nounMap, animalLabelMap) {
  if (h.typeId && h.nounId) {
    const t = typeMap.get(h.typeId) || "";
    const n = nounMap.get(h.nounId) || "";
    return `${t} · ${n}`.trim() || "—";
  }
  if (h.animalId) {
    return animalLabelMap.get(h.animalId) || "—";
  }
  return "—";
}

export async function loadHealthRecords() {
  const tbody = $("#healthTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>กำลังโหลด...</td></tr>";
  try {
    const snap = await getDocs(
      query(
        collection(db, COL.healthRecords),
        orderBy("date", "desc"),
        limit(25)
      )
    );
    const [animals, types, nouns] = await Promise.all([
      getDocs(collection(db, COL.animals)),
      getDocs(collection(db, COL.animalTypes)),
      getDocs(collection(db, COL.nouns)),
    ]);
    const typeMap = new Map();
    types.forEach((d) => typeMap.set(d.id, d.data().name));
    const nounMap = new Map();
    nouns.forEach((d) => nounMap.set(d.id, d.data().name));
    const animalLabelMap = new Map();
    animals.forEach((d) =>
      animalLabelMap.set(
        d.id,
        typeMap.get(d.data().typeId) || d.data().name || d.id
      )
    );

    const rows = [];
    snap.forEach((d) => {
      const h = d.data();
      const kind = h.recordKind === "annual" ? "ตรวจประจำปี" : "ป่วย / พิเศษ";
      const statusCell =
        h.recordKind === "annual"
          ? h.annualResult || h.status || "-"
          : h.status || "-";
      const next =
        h.nextCheckDate || h.nextAnnualDate || "-";
      const subj = subjectFromHealthRecord(h, typeMap, nounMap, animalLabelMap);
      rows.push(
        `<tr>
          <td>${h.date || ""}</td>
          <td>${escapeHtml(subj)}</td>
          <td>${kind}</td>
          <td>${escapeHtml(String(statusCell))}</td>
          <td>${next}</td>
        </tr>`
      );
    });
    tbody.innerHTML =
      rows.join("") || "<tr><td colspan='5'>ยังไม่มีข้อมูล</td></tr>";

    const alerts = [];
    const today = new Date().toISOString().slice(0, 10);
    snap.forEach((d) => {
      const h = d.data();
      const who = subjectFromHealthRecord(h, typeMap, nounMap, animalLabelMap);
      if (h.recordKind !== "annual") {
        if (h.status === "ฉุกเฉิน" || h.status === "ป่วย") {
          alerts.push(`${who} (${h.status})`);
        }
      } else if (h.annualResult === "ไม่ผ่าน" || h.annualResult === "ติดตาม") {
        alerts.push(`ตรวจปี ${h.year || ""}: ${who} — ${h.annualResult}`);
      }
      const nextD = h.nextCheckDate || h.nextAnnualDate;
      if (nextD && nextD <= today) {
        alerts.push(`ถึงกำหนดตรวจ: ${who} (${nextD})`);
      }
    });
    const el = $("#healthAlerts");
    if (el) el.textContent = alerts.join(" | ") || "";
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='5'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

function wireAnnualForm() {
  const form = $("#healthAnnualForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = $("#healthAnnualTypeSelect").value;
    const nounId = $("#healthAnnualNounSelect").value;
    const year = Number($("#healthAnnualYear").value || 0);
    const date = $("#healthAnnualDate").value;
    const nextAnnual = $("#healthAnnualNext").value || null;
    const payload = {
      recordKind: "annual",
      typeId,
      nounId,
      year,
      date,
      annualResult: $("#healthAnnualResult").value,
      note: $("#healthAnnualNote").value.trim(),
      nextAnnualDate: nextAnnual,
      nextCheckDate: nextAnnual,
      status: `ประจำปี ${year}: ${$("#healthAnnualResult").value}`,
      createdAt: new Date().toISOString(),
    };
    if (!typeId || !nounId || !date || !year) {
      showToast("กรุณาเลือกประเภทสัตว์ คำนาม ปี และวันที่ตรวจ", { error: true });
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    try {
      setLoading(btn, true);
      await addDoc(collection(db, COL.healthRecords), payload);
      showToast("บันทึกตรวจประจำปีสำเร็จ");
      const preserveType = typeId;
      form.reset();
      syncAnnualDefaults();
      if ($("#healthAnnualTypeSelect")) $("#healthAnnualTypeSelect").value = preserveType;
      refillHealthNounSelect($("#healthAnnualNounSelect"), preserveType);
      loadHealthRecords();
    } catch (err) {
      console.error(err);
      showToast("บันทึกไม่สำเร็จ", { error: true });
    } finally {
      setLoading(btn, false);
    }
  });
}

function syncAnnualDefaults() {
  const y = $("#healthAnnualYear");
  if (y && !y.value) y.value = String(new Date().getFullYear());
  const d = $("#healthAnnualDate");
  if (d && !d.value) d.value = new Date().toISOString().slice(0, 10);
}

function wireIllnessForm() {
  const form = $("#healthIllnessForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = $("#healthIllnessTypeSelect").value;
    const nounId = $("#healthIllnessNounSelect").value;
    const payload = {
      recordKind: "illness",
      typeId,
      nounId,
      date: $("#healthIllnessDate").value,
      status: $("#healthIllnessStatus").value,
      note: $("#healthIllnessNote").value.trim(),
      treatment: $("#healthIllnessTreatment").value.trim(),
      nextCheckDate: $("#healthIllnessNextCheck").value || null,
      createdAt: new Date().toISOString(),
    };
    if (!typeId || !nounId || !payload.date) {
      showToast("กรุณาเลือกประเภทสัตว์ คำนาม และวันที่", { error: true });
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    try {
      setLoading(btn, true);
      await addDoc(collection(db, COL.healthRecords), payload);
      showToast("บันทึกการดูแลพิเศษสำเร็จ");
      const preserveType = typeId;
      form.reset();
      const dd = $("#healthIllnessDate");
      if (dd) dd.value = new Date().toISOString().slice(0, 10);
      if ($("#healthIllnessTypeSelect")) $("#healthIllnessTypeSelect").value = preserveType;
      refillHealthNounSelect($("#healthIllnessNounSelect"), preserveType);
      loadHealthRecords();
    } catch (err) {
      console.error(err);
      showToast("บันทึกไม่สำเร็จ", { error: true });
    } finally {
      setLoading(btn, false);
    }
  });
}

export function initHealth() {
  initHealthModeTabs();
  syncAnnualDefaults();
  const illnessDate = $("#healthIllnessDate");
  if (illnessDate && !illnessDate.value) {
    illnessDate.value = new Date().toISOString().slice(0, 10);
  }
  populateHealthReferenceSelects().catch(console.error);
  wireAnnualForm();
  wireIllnessForm();
}
