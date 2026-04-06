import {
  db,
  COL,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "./firebase.js";
import { $, $$, showToast, setLoading, escapeHtml } from "./utils.js";

const ENTITY_LABELS = {
  animalTypes: "ประเภทสัตว์",
  nouns: "คำนาม (สายพันธุ์)",
  enclosures: "กรง / โซน",
  feedItems: "อาหาร",
  departments: "หน่วยงาน",
};

function applyMasterFormUi(entity) {
  const nameSpan = $("#masterNameLabelSpan");
  const nameInp = $("#masterName");
  const descSpan = $("#masterDescriptionLabelSpan");
  const descTa = $("#masterDescription");
  const nounWrap = $("#masterNounTypeWrap");
  if (entity === "nouns") {
    nounWrap?.classList.remove("hidden");
    if (nameSpan) nameSpan.textContent = "ชื่อสายพันธุ์ (คำนาม)";
    if (nameInp) {
      nameInp.placeholder =
        "เช่น สิงโตแอฟริกา, เสือโคร่ง, ช้างศรีลังกา";
    }
    if (descSpan) descSpan.textContent = "รายละเอียดสายพันธุ์ (ไม่บังคับ)";
    if (descTa) {
      descTa.placeholder =
        "เช่น ลักษณะเด่น ถิ่นกำเนิด หมายเหตุ";
    }
  } else {
    nounWrap?.classList.add("hidden");
    const nt = $("#masterNounTypeSelect");
    if (nt) nt.value = "";
    if (nameSpan) nameSpan.textContent = "ชื่อรายการ";
    if (nameInp) nameInp.placeholder = "ชื่อรายการ...";
    if (descSpan) descSpan.textContent = "รายละเอียดเพิ่มเติม (ไม่บังคับ)";
    if (descTa) descTa.placeholder = "เช่น อาหารหลัก ถิ่นอาศัย...";
  }
}

function formatMasterDate(iso) {
  if (!iso) return "ไม่ระบุวันที่";
  try {
    const d = new Date(iso);
    return (
      "เพิ่มเมื่อ " +
      d.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );
  } catch {
    return "";
  }
}

function setMasterSubmitLabel() {
  const btn = $("#masterSubmitBtn");
  if (!btn) return;
  btn.textContent = $("#masterId").value ? "บันทึกการแก้ไข" : "+ เพิ่ม";
}

export async function loadMasterData(entity) {
  const list = $("#masterCardList");
  const titleEl = $("#masterListTitle");
  if (!list) return;
  list.innerHTML = '<p class="hint master-loading">กำลังโหลด...</p>';
  if (titleEl) {
    titleEl.textContent = `รายการ${ENTITY_LABELS[entity] || ""}`;
  }
  try {
    const [snap, typesSnap] = await Promise.all([
      getDocs(query(collection(db, COL[entity]), orderBy("name"))),
      entity === "nouns"
        ? getDocs(collection(db, COL.animalTypes))
        : Promise.resolve(null),
    ]);
    const typeMap = new Map();
    if (entity === "nouns" && typesSnap) {
      typesSnap.forEach((docSnap) =>
        typeMap.set(docSnap.id, docSnap.data().name || "")
      );
    }
    const rows = [];
    snap.forEach((d) => {
      const data = d.data();
      const desc = (data.description || "").trim();
      const typeLine =
        entity === "nouns" && data.typeId
          ? `${escapeHtml(typeMap.get(data.typeId) || "ประเภท?")} · `
          : "";
      rows.push(
        `<article class="master-card" data-entity="${entity}">
          <div class="master-card-body">
            <div class="master-card-title">${escapeHtml(data.name || "")}</div>
            <div class="master-card-meta">${typeLine}${formatMasterDate(data.createdAt)}</div>
            ${
              desc
                ? `<div class="master-card-desc">${escapeHtml(desc)}</div>`
                : ""
            }
          </div>
          <div class="master-card-actions">
            <button type="button" class="btn-icon" title="แก้ไข" data-edit="${d.id}" data-entity="${entity}" aria-label="แก้ไข">✎</button>
            <button type="button" class="btn-icon btn-icon-danger" title="ลบ" data-del="${d.id}" data-entity="${entity}" aria-label="ลบ">×</button>
          </div>
        </article>`
      );
    });
    list.innerHTML =
      rows.join("") ||
      '<p class="hint master-empty">ยังไม่มีข้อมูล — ใช้ฟอร์มด้านซ้ายเพื่อเพิ่ม</p>';
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="hint master-empty">โหลดข้อมูลไม่สำเร็จ</p>';
  }
}

export async function populateMasterSelects() {
  const [typesSnap, enclSnap, usersSnap, feedSnap, deptSnap] =
    await Promise.all([
      getDocs(collection(db, COL.animalTypes)),
      getDocs(collection(db, COL.enclosures)),
      getDocs(collection(db, COL.appUsers)),
      getDocs(collection(db, COL.feedItems)),
      getDocs(collection(db, COL.departments)),
    ]);

  const typesMap = new Map();
  typesSnap.forEach((d) => typesMap.set(d.id, d.data().name));

  function fillSelect(sel, snap, { labelKey = "name" } = {}) {
    if (!sel) return;
    const opts = ['<option value="">-- เลือก --</option>'];
    snap.forEach((d) => {
      const data = d.data();
      opts.push(
        `<option value="${d.id}">${data[labelKey] || data.email || d.id}</option>`
      );
    });
    sel.innerHTML = opts.join("");
  }

  fillSelect($("#animalTypeSelect"), typesSnap);
  fillSelect($("#masterNounTypeSelect"), typesSnap);
  fillSelect($("#animalEnclosureSelect"), enclSnap);
  fillSelect($("#animalCaretakerSelect"), usersSnap, {
    labelKey: "displayName",
  });
  const animalsSnap = await getDocs(collection(db, COL.animals));
  function fillAnimalByTypeSelect(sel, animalsSnapshot) {
    if (!sel) return;
    const opts = ['<option value="">-- เลือก --</option>'];
    animalsSnapshot.forEach((d) => {
      const a = d.data();
      const typeName = typesMap.get(a.typeId) || a.name || d.id;
      opts.push(`<option value="${d.id}">${typeName}</option>`);
    });
    sel.innerHTML = opts.join("");
  }

  fillAnimalByTypeSelect($("#feedingAnimalSelect"), animalsSnap);
  fillSelect($("#feedingItemSelect"), feedSnap);
  fillSelect($("#inventoryItemSelect"), feedSnap);
  fillSelect($("#purchaseItemSelect"), feedSnap);
  fillSelect($("#userDepartmentSelect"), deptSnap);
}

export function initMasterData() {
  const pills = $$(".master-entity-pills .master-pill");
  const form = $("#masterForm");
  const resetBtn = $("#masterReset");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.toggle("active", p === pill));
      const entity = pill.dataset.master;
      $("#masterEntity").value = entity;
      $("#masterId").value = "";
      $("#masterName").value = "";
      $("#masterDescription").value = "";
      const pnt = $("#masterNounTypeSelect");
      if (pnt) pnt.value = "";
      applyMasterFormUi(entity);
      setMasterSubmitLabel();
      loadMasterData(entity);
      populateMasterSelects();
    });
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entity = $("#masterEntity").value;
      const id = $("#masterId").value;
      const name = $("#masterName").value.trim();
      const description = $("#masterDescription").value.trim();
      if (!name) {
        showToast(
          entity === "nouns"
            ? "กรุณากรอกชื่อสายพันธุ์ / คำนาม"
            : "กรุณากรอกชื่อ",
          { error: true }
        );
        return;
      }
      const nounTypeId = $("#masterNounTypeSelect")?.value || "";
      if (entity === "nouns" && !nounTypeId) {
        showToast("กรุณาเลือกประเภทสัตว์ที่เชื่อมกับคำนาม", { error: true });
        return;
      }
      const btn = $("#masterSubmitBtn");
      try {
        setLoading(btn, true);
        if (id) {
          const patch =
            entity === "nouns"
              ? { name, description, typeId: nounTypeId }
              : { name, description };
          await updateDoc(doc(db, COL[entity], id), patch);
        } else {
          const docPayload =
            entity === "nouns"
              ? {
                  name,
                  description,
                  typeId: nounTypeId,
                  createdAt: new Date().toISOString(),
                }
              : {
                  name,
                  description,
                  createdAt: new Date().toISOString(),
                };
          await addDoc(collection(db, COL[entity]), docPayload);
        }
        showToast("บันทึกข้อมูลสำเร็จ");
        $("#masterId").value = "";
        $("#masterName").value = "";
        $("#masterDescription").value = "";
        const psnt = $("#masterNounTypeSelect");
        if (psnt) psnt.value = "";
        setMasterSubmitLabel();
        applyMasterFormUi(entity);
        loadMasterData(entity);
        populateMasterSelects();
      } catch (err) {
        console.error("masterData save error", err);
        showToast(
          "บันทึกไม่สำเร็จ: " + (err.code || err.message || "ไม่ทราบสาเหตุ"),
          { error: true }
        );
      } finally {
        setLoading(btn, false);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      $("#masterId").value = "";
      $("#masterName").value = "";
      $("#masterDescription").value = "";
      const rnt = $("#masterNounTypeSelect");
      if (rnt) rnt.value = "";
      setMasterSubmitLabel();
      applyMasterFormUi($("#masterEntity").value || "animalTypes");
    });
  }

  $("#masterCardList").addEventListener("click", async (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    const entity = target.dataset.entity;
    const id = target.dataset.edit || target.dataset.del;
    if (!id || !entity) return;
    if (target.dataset.edit) {
      const snap = await getDoc(doc(db, COL[entity], id));
      if (!snap.exists) return;
      const data = snap.data();
      $("#masterEntity").value = entity;
      $("#masterId").value = id;
      $("#masterName").value = data.name || "";
      $("#masterDescription").value = data.description || "";
      const nt = $("#masterNounTypeSelect");
      if (nt) nt.value = data.typeId || "";
      pills.forEach((p) =>
        p.classList.toggle("active", p.dataset.master === entity)
      );
      applyMasterFormUi(entity);
      setMasterSubmitLabel();
      loadMasterData(entity);
    } else if (target.dataset.del) {
      if (!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
      try {
        await deleteDoc(doc(db, COL[entity], id));
        loadMasterData(entity);
        populateMasterSelects();
      } catch (err) {
        console.error(err);
        showToast("ลบไม่สำเร็จ", { error: true });
      }
    }
  });

  const defaultPill = pills[0];
  defaultPill?.click();
}
