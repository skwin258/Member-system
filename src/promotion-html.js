import sanitizeHtml from "sanitize-html";

export function sanitizePromotionHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "u", "s"],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http"] },
    allowProtocolRelative: false,
  });
}
