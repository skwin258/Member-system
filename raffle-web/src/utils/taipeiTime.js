export function parseUtcLike(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(raw)) {
    const normalized = raw.replace(" ", "T") + (raw.includes("T") || raw.includes(" ") ? "Z" : "T00:00:00Z");
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTaipeiDateTime(value) {
  const d = parseUtcLike(value);
  if (!d) return String(value || "").replace("T", " ").replace(/\.\d+Z?$/, "").replace("Z", "");

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);

  const pick = (type) => parts.find((x) => x.type === type)?.value || "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function formatTaipeiDate(value) {
  const s = formatTaipeiDateTime(value);
  return s ? s.slice(0, 10) : "";
}

export function getTaipeiTodayYmd() {
  return formatTaipeiDateTime(new Date()).slice(0, 10);
}
