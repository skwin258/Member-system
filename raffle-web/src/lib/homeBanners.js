import { API_BASE } from "../config";

const defaultBanners = [1, 2, 3, 4].map(slot => ({
  slot, image_url: `/img/BANNER${slot}.png`, link_url: "",
}));

export function homeBannersWithDefaults(items = []) {
  return defaultBanners.map(banner => ({
    ...banner, ...items.find(item => item.slot === banner.slot),
  }));
}

export function bannerImage(url) {
  return url.startsWith("/r2/") ? API_BASE + url : url;
}
