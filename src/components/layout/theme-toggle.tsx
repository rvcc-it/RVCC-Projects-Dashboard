"use client";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const opts: { v: Theme; label: string; icon: typeof Sun }[] = [
    { v: "light", label: "Light", icon: Sun },
    { v: "dark", label: "Dark", icon: Moon },
    { v: "system", label: "System", icon: Laptop },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Switch theme" />}>
        <Sun className="size-[18px] scale-100 dark:scale-0" />
        <Moon className="absolute size-[18px] scale-0 dark:scale-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {opts.map((o) => (
          <DropdownMenuItem key={o.v} onClick={() => setTheme(o.v)}>
            <o.icon /> {o.label} {theme === o.v && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
