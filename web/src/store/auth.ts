"use client";

import localforage from "localforage";

export const AUTH_KEY_STORAGE_KEY = "chatgpt2api_auth_key";
export const AUTH_ROLE_STORAGE_KEY = "chatgpt2api_auth_role";

export type AuthRole = "admin" | "guest";

const authStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "auth",
});

export async function getStoredAuthKey() {
  if (typeof window === "undefined") {
    return "";
  }
  const value = await authStorage.getItem<string>(AUTH_KEY_STORAGE_KEY);
  return String(value || "").trim();
}

export async function getStoredAuthSession(): Promise<{ authKey: string; role: AuthRole | null }> {
  if (typeof window === "undefined") {
    return { authKey: "", role: null };
  }

  const [authKey, storedRole] = await Promise.all([
    authStorage.getItem<string>(AUTH_KEY_STORAGE_KEY),
    authStorage.getItem<AuthRole>(AUTH_ROLE_STORAGE_KEY),
  ]);
  const normalizedAuthKey = String(authKey || "").trim();
  const normalizedRole = storedRole === "admin" || storedRole === "guest" ? storedRole : "";
  return {
    authKey: normalizedAuthKey,
    role: normalizedAuthKey ? (normalizedRole || "admin") : null,
  };
}

export async function setStoredAuthKey(authKey: string) {
  await setStoredAuthSession(authKey, "admin");
}

export async function setStoredAuthSession(authKey: string, role: AuthRole) {
  const normalizedAuthKey = String(authKey || "").trim();
  if (!normalizedAuthKey) {
    await clearStoredAuthKey();
    return;
  }

  await Promise.all([
    authStorage.setItem(AUTH_KEY_STORAGE_KEY, normalizedAuthKey),
    authStorage.setItem(AUTH_ROLE_STORAGE_KEY, role),
  ]);
}

export async function clearStoredAuthKey() {
  if (typeof window === "undefined") {
    return;
  }
  await Promise.all([
    authStorage.removeItem(AUTH_KEY_STORAGE_KEY),
    authStorage.removeItem(AUTH_ROLE_STORAGE_KEY),
  ]);
}
