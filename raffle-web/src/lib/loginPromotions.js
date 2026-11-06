export const LOGIN_PLACEMENT = 'login_popup';
export const MAX_PNG_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = [137,80,78,71,13,10,26,10];

export function validatePng(bytes, size) {
  if (!size || size > MAX_PNG_BYTES) throw new Error('請選擇 8 MB 以內的 PNG 圖片');
  if (!PNG_SIGNATURE.every((value, i) => bytes[i] === value)) throw new Error('檔案格式必須是 PNG');
}

export function resolvePromotionImage(value, base) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, base);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function orderedLoginPromotions(items, base, enabledOnly = true) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.placement === LOGIN_PLACEMENT && (!enabledOnly || Number(item.enabled) === 1))
    .map(item => ({...item, imageUrl: resolvePromotionImage(item.cover_image_url, base)}))
    .filter(item => item.imageUrl)
    .sort((a,b) => (Number(a.sort || 0)-Number(b.sort || 0)) || Number(a.id)-Number(b.id));
}

export async function loginSessionKey(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return 'sk-login-promotions:' + Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
