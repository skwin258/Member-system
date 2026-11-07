import { API_BASE } from "../config";

const defaultBanners = [1, 2, 3, 4].map(slot => ({
  slot, image_url: `/img/BANNER${slot}.png`, link_url: "",
}));

export function homeBannersWithDefaults(items = []) {
  const merged = new Map(defaultBanners.map(banner => [banner.slot, banner]));
  for (const item of items) {
    merged.set(item.slot, { link_url: "", ...merged.get(item.slot), ...item });
  }
  return [...merged.values()]
    .filter(item => !item.deleted && item.image_url)
    .sort((a, b) => (a.sort ?? a.slot) - (b.sort ?? b.slot));
}

export function bannerImage(url) {
  return url.startsWith("/r2/") ? API_BASE + url : url;
}
