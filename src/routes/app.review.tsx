import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

function View() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t("applicant_nav.review")} />;
}

export const Route = createFileRoute("/app/review")({ component: View });