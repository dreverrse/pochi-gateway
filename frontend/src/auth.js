const STORAGE_KEY = "pochi_admin_token";

export function getAdminToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // sessionStorage tidak tersedia.
  }
}

/**
 * Login sekali-jalan lewat URL: `/#token=...`. Hash tidak pernah dikirim ke
 * server, jadi token tidak masuk access log. Setelah disimpan, hash langsung
 * diganti ke rute biasa supaya tidak tertinggal di address bar/riwayat.
 */
export function bootstrapTokenFromHash() {
  const match = /^#(?:token|key)=([^&]+)$/.exec(window.location.hash);
  if (!match) return;
  let value = "";
  try {
    value = decodeURIComponent(match[1]).trim();
  } catch {
    value = "";
  }
  if (value) setAdminToken(value);
  try {
    const { pathname, search } = window.location;
    history.replaceState(null, "", `${pathname}${search}#/chat`);
  } catch {
    window.location.hash = "#/chat";
  }
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage tidak tersedia.
  }
}
