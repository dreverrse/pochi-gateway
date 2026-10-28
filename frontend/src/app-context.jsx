import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_RANGE, RANGES } from "./utils/range.js";

const UiContext = createContext(null);
const RANGE_KEY = "pochi_ui_range";

function readRange() {
  try {
    const stored = sessionStorage.getItem(RANGE_KEY);
    if (stored && RANGES.some((range) => range.id === stored)) return stored;
  } catch {
    // sessionStorage tidak tersedia.
  }
  return DEFAULT_RANGE;
}

export function UiProvider({ children }) {
  const [range, setRangeState] = useState(readRange);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const setRange = useCallback((value) => {
    setRangeState(value);
    try {
      sessionStorage.setItem(RANGE_KEY, value);
    } catch {
      // Abaikan bila storage diblokir.
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast) => {
      counter.current += 1;
      const id = counter.current;
      const entry = {
        id,
        tone: toast.tone ?? "info",
        title: toast.title ?? "",
        message: toast.message ?? "",
      };
      setToasts((current) => [...current.slice(-3), entry]);
      return id;
    },
    [],
  );

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timers = toasts.map((toast) =>
      setTimeout(() => dismissToast(toast.id), toast.tone === "error" ? 8000 : 5000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  const value = useMemo(
    () => ({ range, setRange, search, setSearch, toasts, pushToast, dismissToast }),
    [range, setRange, search, toasts, pushToast, dismissToast],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi harus dipakai di dalam UiProvider");
  return context;
}
