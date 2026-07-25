import { useTranslation } from "react-i18next";

export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="reading-column py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t("placeholder.coming_soon")}</p>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {t("placeholder.coming_soon_body")}
      </p>
    </div>
  );
}