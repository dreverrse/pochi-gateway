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

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage tidak tersedia.
  }
}
