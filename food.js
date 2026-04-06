import {
  db,
  COL,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  query,
  where,
  runTransaction,
  onSnapshot,
} from "./firebase.js";
import { $, $$, showToast, setLoading } from "./utils.js";

let inventoryUnsubscribe = null;

/** อ่าน quantity จาก DocumentSnapshot อย่างปลอดภัย (กัน data() ว่าง / เอกสารเก่า) */
function stockQuantityFromSnapshot(invSnap) {
  if (!invSnap || typeof invSnap.data !== "function") return 0;
  const raw = invSnap.data();
  if (raw == null || typeof raw !== "object") return 0;
  return Number(raw.quantity ?? 0);
}

async function renderInventoryTableFromSnapshot(inventorySnap) {
  const tbody = $("#inventoryTableBody");
  if (!tbody) return;
  try {
    const foods = await getDocs(collection(db, COL.feedItems));
    const fMap = new Map();
    foods.forEach((d) => fMap.set(d.id, d.data().name));
    const rows = [];
    inventorySnap.forEach((d) => {
      const inv = d.data();
      if (!inv) return;
      const feedKey = inv.feedItemId ?? d.id;
      rows.push(
        `<tr>
          <td>${fMap.get(feedKey) || feedKey}</td>
          <td>${inv.quantity ?? 0}</td>
        </tr>`
      );
    });
    tbody.innerHTML =
      rows.join("") || "<tr><td colspan='2'>ยังไม่มีข้อมูลสต็อก</td></tr>";
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='2'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

export async function loadFeedingToday() {
  const tbody = $("#feedingTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='4'>กำลังโหลด...</td></tr>";
  try {
    const today = new Date().toISOString().slice(0, 10);
    const qFeed = query(
      collection(db, COL.feedingLogs),
      where("date", "==", today)
    );
    const snap = await getDocs(qFeed);
    const [animals, types, foods] = await Promise.all([
      getDocs(collection(db, COL.animals)),
      getDocs(collection(db, COL.animalTypes)),
      getDocs(collection(db, COL.feedItems)),
    ]);
    const typeMap = new Map();
    types.forEach((d) => typeMap.set(d.id, d.data().name));
    const aMap = new Map();
    animals.forEach((d) =>
      aMap.set(d.id, typeMap.get(d.data().typeId) || d.data().name || d.id)
    );
    const fMap = new Map();
    foods.forEach((d) => fMap.set(d.id, d.data().name));

    const rows = [];
    snap.forEach((d) => {
      const f = d.data();
      rows.push(
        `<tr>
          <td>${f.time || ""}</td>
          <td>${aMap.get(f.animalId) || ""}</td>
          <td>${fMap.get(f.feedItemId) || ""}</td>
          <td>${f.amount || ""}</td>
        </tr>`
      );
    });
    tbody.innerHTML =
      rows.join("") || "<tr><td colspan='4'>ยังไม่มีข้อมูลวันนี้</td></tr>";
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='4'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

export async function loadInventory() {
  const tbody = $("#inventoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='2'>กำลังโหลด...</td></tr>";
  try {
    const snap = await getDocs(collection(db, COL.inventory));
    await renderInventoryTableFromSnapshot(snap);
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='2'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

export async function loadPurchaseRequests() {
  const tbody = $("#purchaseTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='4'>กำลังโหลด...</td></tr>";
  try {
    const snap = await getDocs(collection(db, COL.purchaseRequests));
    const foods = await getDocs(collection(db, COL.feedItems));
    const fMap = new Map();
    foods.forEach((d) => fMap.set(d.id, d.data().name));
    const rows = [];
    snap.forEach((d) => {
      const p = d.data();
      const st = p.status || "รอดำเนินการ";
      const pending = st === "รอดำเนินการ";
      const actions = pending
        ? `<button type="button" class="btn-small" data-pr-approve="${d.id}">อนุมัติ</button>
            <button type="button" class="btn-small btn-danger" data-pr-reject="${d.id}">ปฏิเสธ</button>`
        : `<span class="hint">—</span>`;
      rows.push(
        `<tr>
          <td>${fMap.get(p.feedItemId) || p.feedItemId}</td>
          <td>${p.quantity}</td>
          <td>${st}</td>
          <td>${actions}</td>
        </tr>`
      );
    });
    tbody.innerHTML =
      rows.join("") || "<tr><td colspan='4'>ยังไม่มีคำร้อง</td></tr>";
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='4'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

export function cleanupFood() {
  if (inventoryUnsubscribe) {
    inventoryUnsubscribe();
    inventoryUnsubscribe = null;
  }
}

export function initFood() {
  cleanupFood();

  inventoryUnsubscribe = onSnapshot(
    collection(db, COL.inventory),
    (snap) => {
      renderInventoryTableFromSnapshot(snap);
    },
    (err) => console.error("inventory snapshot", err)
  );

  const foodTabs = $$('#section-food .tab-button');
  foodTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      foodTabs.forEach((t) => t.classList.toggle("active", t === tab));
      const target = tab.dataset.food;
      $$("#section-food .food-panel").forEach((p) =>
        p.classList.toggle("active", p.id === `food-${target}`)
      );
    });
  });

  // ── โหลดสัตว์ + คำนาม แล้วกรองตามประเภทที่เลือก ──
  (async () => {
    const animalSel = $("#feedingAnimalSelect");
    const nounSel   = $("#feedingNounSelect");
    if (!animalSel || !nounSel) return;

    try {
      const [animalsSnap, nounsSnap] = await Promise.all([
        getDocs(collection(db, COL.animals)),
        getDocs(collection(db, COL.nouns)),
      ]);

      // map: animalId → typeId
      const animalTypeMap = new Map();
      animalsSnap.forEach((d) => {
        animalTypeMap.set(d.id, d.data().typeId || null);
      });

      // คำนามทั้งหมด เรียงตามชื่อ
      const allNouns = [];
      nounsSnap.forEach((d) => allNouns.push({ id: d.id, ...d.data() }));
      allNouns.sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));

      function updateNouns() {
        const typeId = animalTypeMap.get(animalSel.value) || null;

        // ถ้ายังไม่ได้เลือกสัตว์ → แสดงทั้งหมด
        // ถ้าเลือกแล้ว → แสดงเฉพาะคำนามที่ typeId ตรงกัน
        const filtered = typeId
          ? allNouns.filter((n) => n.animals.includes(typeId))
          : allNouns;

        nounSel.innerHTML =
          '<option value="">— ไม่ระบุ —</option>' +
          filtered
            .map((n) => `<option value="${n.id}">${n.name || n.id}</option>`)
            .join("");
      }

      animalSel.addEventListener("change", updateNouns);
      updateNouns(); // เรียกครั้งแรกเผื่อมีค่าอยู่แล้ว
    } catch (err) {
      console.error("loadNouns for feedingForm", err);
    }
  })();

  $("#feedingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      animalId:   $("#feedingAnimalSelect").value,
      nounId:     $("#feedingNounSelect")?.value || null,   // ← เพิ่ม nounId
      feedItemId: $("#feedingItemSelect").value,
      date:       $("#feedingDate").value,
      time:       new Date().toTimeString().slice(0, 5),
      amount:     Number($("#feedingAmount").value || 0),
      createdAt:  new Date().toISOString(),
    };
    if (!payload.animalId || !payload.feedItemId || !payload.date) {
      showToast("กรุณากรอกข้อมูลให้ครบ", { error: true });
      return;
    }
    if (payload.amount <= 0) {
      showToast("กรุณากรอกปริมาณมากกว่า 0", { error: true });
      return;
    }
    const btn = $("#feedingForm button[type='submit']");
    try {
      setLoading(btn, true);
      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, COL.inventory, payload.feedItemId);
        const invSnap = await transaction.get(invRef);
        const current = stockQuantityFromSnapshot(invSnap);
        if (current < payload.amount) {
          const err = new Error("สต็อกไม่พอ");
          err.code = "insufficient-stock";
          throw err;
        }
        const logRef = doc(collection(db, COL.feedingLogs));
        transaction.set(
          invRef,
          { feedItemId: payload.feedItemId, quantity: current - payload.amount },
          { merge: true }
        );
        transaction.set(logRef, payload);
      });

      showToast("บันทึกการให้อาหารแล้ว (หักสต็อกแล้ว)");
      $("#feedingForm").reset();
      loadFeedingToday();
    } catch (err) {
      console.error(err);
      if (err?.code === "insufficient-stock") {
        showToast("สต็อกอาหารไม่พอ กรุณาตรวจสอบสต็อกหรือปรับปรุงก่อน", { error: true });
      } else {
        showToast("บันทึกไม่สำเร็จ", { error: true });
      }
    } finally {
      setLoading(btn, false);
    }
  });

  $("#inventoryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedItemId = $("#inventoryItemSelect").value;
    const quantity = Number($("#inventoryQuantity").value || 0);
    if (!feedItemId) {
      showToast("กรุณาเลือกรายการอาหาร", { error: true });
      return;
    }
    const btn = $("#inventoryForm button[type='submit']");
    try {
      setLoading(btn, true);
      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, COL.inventory, feedItemId);
        transaction.set(invRef, { feedItemId, quantity }, { merge: true });
      });
      showToast("อัปเดตสต็อกสำเร็จ");
    } catch (err) {
      console.error(err);
      showToast("อัปเดตไม่สำเร็จ", { error: true });
    } finally {
      setLoading(btn, false);
    }
  });

  $("#purchaseForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      feedItemId: $("#purchaseItemSelect").value,
      quantity:   Number($("#purchaseQuantity").value || 0),
      note:       $("#purchaseNote").value.trim(),
      status:     "รอดำเนินการ",
      createdAt:  new Date().toISOString(),
      createdBy:  window.currentUserProfile?.id || null,
    };
    if (!payload.feedItemId || !payload.quantity) {
      showToast("กรุณากรอกข้อมูลให้ครบ", { error: true });
      return;
    }
    const btn = $("#purchaseForm button[type='submit']");
    try {
      setLoading(btn, true);
      await addDoc(collection(db, COL.purchaseRequests), payload);
      showToast("สร้างคำร้องจัดซื้อแล้ว");
      $("#purchaseForm").reset();
      loadPurchaseRequests();
    } catch (err) {
      console.error(err);
      showToast("สร้างคำร้องไม่สำเร็จ", { error: true });
    } finally {
      setLoading(btn, false);
    }
  });

  $("#purchaseTableBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const approveId = btn.dataset.prApprove;
    const rejectId  = btn.dataset.prReject;
    try {
      if (approveId) {
        await updateDoc(doc(db, COL.purchaseRequests, approveId), {
          status: "กำลังจัดส่ง",
          approvedAt: new Date().toISOString(),
        });
        showToast("อนุมัติแล้ว — สถานะ: กำลังจัดส่ง");
      } else if (rejectId) {
        await updateDoc(doc(db, COL.purchaseRequests, rejectId), {
          status: "ปฏิเสธ",
        });
        showToast("ปฏิเสธคำร้องแล้ว");
      }
      loadPurchaseRequests();
    } catch (err) {
      console.error(err);
      showToast("อัปเดตคำร้องไม่สำเร็จ", { error: true });
    }
  });
}