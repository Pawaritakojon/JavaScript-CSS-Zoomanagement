import {
  auth,
  db,
  COL,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  collection,
  getDocs,
  query,
  where,
} from "./firebase.js";
import { $, $$, showToast, setLoading } from "./utils.js";
import {
  initMasterData,
  loadMasterData,
  populateMasterSelects,
} from "./masterData.js";
import { initAnimals, loadAnimals } from "./animals.js";
import {
  initHealth,
  loadHealthRecords,
  populateHealthReferenceSelects,
} from "./health.js";
import {
  initFood,
  loadFeedingToday,
  loadInventory,
  loadPurchaseRequests,
} from "./food.js";
import { initUsers, loadUsers } from "./users.js";
import { loadDashboard, loadReports, loadTodayTasks } from "./dashboard.js";

window.currentUserProfile = null;

/** ไม่มีฟิลด์ role หรือว่าง → พนักงานใหม่ (เห็นเฉพาะหน้าผู้ใช้จนกว่าจะได้รับตำแหน่ง) */
function normalizeRole(role) {
  if (role === undefined || role === null || String(role).trim() === "") {
    return "pending";
  }
  return role;
}

async function loadCurrentUserProfile(user) {
  if (!user?.email) return null;
  const q = query(collection(db, COL.appUsers), where("email", "==", user.email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

function applyRolePermissions() {
  const loggedIn = !!auth.currentUser;
  const normalizedRole = normalizeRole(window.currentUserProfile?.role);

  document.body.classList.toggle("user-role-pending", normalizedRole === "pending");

  const appShell = $("#appShell");
  if (appShell) {
    appShell.classList.toggle("app-shell--logged-out", !loggedIn);
  }

  // กำหนดว่าบทบาทนี้ “อนุญาตให้เห็น” เมนูส่วนไหน
  const allowed = {
    admin: ["dashboard", "animal-hub", "health", "food", "reports", "users"],
    keeper: ["dashboard", "animal-hub", "reports", "users"],
    food: ["dashboard", "food", "users"],
    vet: ["health", "users"],
    pending: ["users"],
  }[normalizedRole];

  const allowedSections = new Set(allowed || ["dashboard"]);
  const target =
    normalizedRole === "vet"
      ? "health"
      : normalizedRole === "food"
        ? "dashboard"
        : normalizedRole === "pending"
          ? "users"
          : "dashboard";

  // ซ่อน/แสดงเมนูด้านซ้าย
  $$(".nav-item").forEach((btn) => {
    const sec = btn.dataset.section;
    if (sec === "login") {
      btn.classList.toggle("hidden-role", loggedIn);
      return;
    }
    if (!loggedIn) {
      btn.classList.add("hidden-role");
      return;
    }
    const shouldHide = !allowedSections.has(sec);
    btn.classList.toggle("hidden-role", shouldHide);
  });

  // เปิด/ปิดหน้า section
  $$(".section").forEach((s) => {
    if (!s.id.startsWith("section-")) return;
    const sec = s.id.replace("section-", "");
    const isAllowed = allowedSections.has(sec);
    s.classList.toggle("hidden-role", !isAllowed);
    s.classList.toggle("active", isAllowed && sec === target);
  });

  return target;
}

function initNavigation() {
  const navButtons = $$(".nav-item");
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      navButtons.forEach((b) => b.classList.toggle("active", b === btn));
      $$(".section").forEach((s) =>
        s.classList.toggle("active", s.id === `section-${section}`)
      );
    });
  });
}

async function refreshAllData() {
  const role = normalizeRole(window.currentUserProfile?.role);
  if (role === "pending") {
    await loadUsers();
    return;
  }
  await Promise.all([
    populateMasterSelects(),
    populateHealthReferenceSelects(),
    loadMasterData("animalTypes"),
    loadAnimals(),
    loadHealthRecords(),
    loadFeedingToday(),
    loadInventory(),
    loadPurchaseRequests(),
    loadUsers(),
    loadDashboard(),
    loadReports(),
    loadTodayTasks(),
  ]);
}

function initAuth() {
  const loginForm = $("#loginForm");
  // เก็บ session ไว้ใน browser (local persistence)
  setPersistence(auth, browserLocalPersistence).catch(console.error);

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#loginEmail").value.trim();
      const pass = $("#loginPassword").value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      try {
        setLoading(submitBtn, true);
        await signInWithEmailAndPassword(auth, email, pass);
        showToast("เข้าสู่ระบบสำเร็จ");
      } catch (err) {
        console.error(err);
        showToast("เข้าสู่ระบบไม่สำเร็จ: " + (err.code || err.message), {
          error: true,
        });
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }

  onAuthStateChanged(auth, async (user) => {
    const info = $("#currentUserInfo");
     const topUser = $("#topUserName");
     const logoutBtn = $("#logoutBtn");
    if (!user) {
      window.currentUserProfile = null;
      document.body.classList.remove("user-role-pending");
      const shellOut = $("#appShell");
      if (shellOut) shellOut.classList.add("app-shell--logged-out");
      if (info) info.textContent = "ยังไม่ได้เข้าสู่ระบบ";
      if (topUser) topUser.textContent = "";
      if (logoutBtn) logoutBtn.style.display = "none";
      $$(".nav-item").forEach((b) =>
        b.classList.toggle("active", b.dataset.section === "login")
      );
      $$(".section").forEach((s) =>
        s.classList.toggle("active", s.id === "section-login")
      );
      return;
    }
    let profile = await loadCurrentUserProfile(user);
    if (profile) {
      profile = {
        ...profile,
        role: normalizeRole(profile.role),
      };
    } else {
      profile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        role: "pending",
      };
    }
    window.currentUserProfile = profile;
    const shellIn = $("#appShell");
    if (shellIn) shellIn.classList.remove("app-shell--logged-out");
    const roleDisplay =
      profile.role === "pending"
        ? "รอกำหนดตำแหน่ง"
        : profile.role;
    if (info) {
      info.textContent = `${profile.displayName || user.email} (${roleDisplay})`;
    }
    if (topUser) {
      topUser.textContent =
        window.currentUserProfile.displayName || user.email;
    }
    if (logoutBtn) {
      logoutBtn.style.display = "inline-flex";
    }
    const target = applyRolePermissions();
    // ปรับ active ให้ตรงกับ role ที่ได้รับอนุญาต
    $$(".nav-item").forEach((b) =>
      b.classList.toggle("active", b.dataset.section === target)
    );
    refreshAllData();
  });

  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        showToast("ออกจากระบบแล้ว");
      } catch (err) {
        console.error(err);
        showToast("ออกจากระบบไม่สำเร็จ", { error: true });
      }
    });
  }
}

function initAnimalHubTabs() {
  const hubBtns = $$("#section-animal-hub .hub-main-tabs .hub-tab");
  if (!hubBtns.length) return;
  hubBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      hubBtns.forEach((b) => b.classList.toggle("active", b === btn));
      const key = btn.dataset.hub;
      $$("#section-animal-hub .hub-panel").forEach((p) =>
        p.classList.toggle("active", p.id === `hub-${key}`)
      );
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initAuth();
  initAnimalHubTabs();
  initMasterData();
  initAnimals();
  initHealth();
  initFood();
  initUsers();
});

