import { cn } from "@/lib/utils";

/**
 * The CaseMap mark.
 *
 * One definition so the header, the sidebar and the landing preview cannot
 * drift apart. The asset is the icon cropped out of public/logo.png with its
 * dark outer glow removed — left in, that glow composited as grey fringing
 * against the app's white surfaces.
 *
 * `alt=""` on purpose: every placement sits directly beside the word
 * "CaseMap", so announcing it again would just repeat the name. If you ever
 * use it on its own, pass a real label instead.
 */
export function BrandMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt={alt}
      width={32}
      height={32}
      draggable={false}
      className={cn("h-8 w-8 shrink-0 select-none object-contain", className)}
    />
  );
}
