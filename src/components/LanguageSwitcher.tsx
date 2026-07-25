import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, dirFor } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const change = (code: string) => {
    void i18n.changeLanguage(code);
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
      document.documentElement.dir = dirFor(code);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("nav.language")}>
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="ms-2">
            {SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage)?.label ?? "English"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => change(l.code)}>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}