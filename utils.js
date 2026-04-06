export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** กันข้อความใน HTML template */
export function escapeHtml(text) {
  const s = String(text ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showToast(message, { error = false } = {}) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = message;
  t.classList.toggle("error", !!error);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

export function setLoading(el, loading) {
  if (!el) return;
  if (loading) {
    el.dataset.originalText = el.textContent;
    el.textContent = "กำลังบันทึก...";
    el.disabled = true;
  } else {
    if (el.dataset.originalText) el.textContent = el.dataset.originalText;
    el.disabled = false;
  }
}

