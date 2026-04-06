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
} from "./firebase.js";
import { $, showToast, setLoading } from "./utils.js";
import { populateMasterSelects } from "./masterData.js";

export async function loadUsers() {
  const tbody = $("#usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>กำลังโหลด...</td></tr>";
  try {
    const [snap, deptSnap] = await Promise.all([
      getDocs(collection(db, COL.appUsers)),
      getDocs(collection(db, COL.departments)),
    ]);
    const deptMap = new Map();
    deptSnap.forEach((d) => deptMap.set(d.id, d.data().name));
    const readOnly = window.currentUserProfile?.role === "pending";
    const rows = [];
    snap.forEach((d) => {
      const u = d.data();
      const roleCell =
        !u.role || String(u.role).trim() === ""
          ? "รอกำหนดตำแหน่ง"
          : u.role;
      const actions = readOnly
        ? "<td>—</td>"
        : `<td>
            <button type="button" class="btn-small" data-user-edit="${d.id}">แก้ไข</button>
            <button type="button" class="btn-small btn-danger" data-user-del="${d.id}">ลบ</button>
          </td>`;
      rows.push(
        `<tr>
          <td>${u.email}</td>
          <td>${u.displayName}</td>
          <td>${deptMap.get(u.departmentId) || ""}</td>
          <td>${roleCell}</td>
          ${actions}
        </tr>`
      );
    });
    tbody.innerHTML = rows.join("") || "<tr><td colspan='5'>ยังไม่มีผู้ใช้</td></tr>";
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='5'>โหลดข้อมูลไม่สำเร็จ</td></tr>";
  }
}

export function initUsers() {
  const form = $("#userForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#userId").value;
    const payload = {
      email: $("#userEmail").value.trim(),
      displayName: $("#userDisplayName").value.trim(),
      role: $("#userRole").value,
      departmentId: $("#userDepartmentSelect")?.value || null,
    };
    if (!payload.email || !payload.displayName) {
      showToast("กรุณากรอกอีเมลและชื่อ", { error: true });
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    try {
      setLoading(btn, true);
      if (id) {
        await updateDoc(doc(db, COL.appUsers, id), payload);
      } else {
        await addDoc(collection(db, COL.appUsers), payload);
      }
      showToast("บันทึกผู้ใช้สำเร็จ");
      $("#userId").value = "";
      form.reset();
      loadUsers();
      populateMasterSelects();
    } catch (err) {
      console.error(err);
      showToast("บันทึกไม่สำเร็จ", { error: true });
    } finally {
      setLoading(btn, false);
    }
  });

  $("#usersTableBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const editId = btn.dataset.userEdit;
    const delId = btn.dataset.userDel;
    if (editId) {
      const snap = await getDoc(doc(db, COL.appUsers, editId));
      if (!snap.exists) return;
      const u = snap.data();
      $("#userId").value = editId;
      $("#userEmail").value = u.email || "";
      $("#userDisplayName").value = u.displayName || "";
      $("#userRole").value =
        u.role && String(u.role).trim() !== "" ? u.role : "pending";
      const deptSel = $("#userDepartmentSelect");
      if (deptSel) deptSel.value = u.departmentId || "";
    } else if (delId) {
      if (!confirm("ต้องการลบผู้ใช้นี้ใช่หรือไม่?")) return;
      try {
        await deleteDoc(doc(db, COL.appUsers, delId));
        loadUsers();
      } catch (err) {
        console.error(err);
        showToast("ลบไม่สำเร็จ", { error: true });
      }
    }
  });
}

