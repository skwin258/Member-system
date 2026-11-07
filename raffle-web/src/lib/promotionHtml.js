import DOMPurify from "dompurify";

export function sanitizePromotionHtml(html, options = {}) {
  return DOMPurify.sanitize(String(html || ""), {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ["style"],
    FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea"],
    ...options,
  });
}
