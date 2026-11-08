"use client";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useStoredValue } from "@/hooks/use-stored-value";

export type Theme = "light" | "dark" | "system";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });
export const useTheme = () => useContext(Ctx);

/**
 * Light/dark/system theme. The no-flash <script> that sets the initial class lives in the (server-rendered)
 * root layout, so no <script> is ever rendered from a client component (React 19 warns about that).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useStoredValue("theme");
  const theme: Theme = stored === "light" || stored === "dark" ? stored : "system";

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: (t: Theme) => setStored(t) }), [theme, setStored]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const THEME_INIT_SCRIPT =
  "(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((t===null||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()";
