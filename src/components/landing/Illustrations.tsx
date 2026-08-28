// Landing-page artwork.
//
// Drawn here rather than photographed, and that is a decision rather than a
// shortcut.
//
// A stock photograph of a distressed person with a suitcase is the default for
// products in this space, and it is the wrong call twice over. It is
// exploitative — someone else's worst week, licensed by the month. And the
// people who will read this page *are* the people in that photograph; being
// shown to yourself as an object of pity is not an invitation to sign up.
//
// There is a practical argument too. A hero photograph is a few hundred
// kilobytes; every illustration in this file is a couple of kilobytes of
// inline markup, and a good share of the people arriving here are on mobile
// data on a mid-range Android.
//
// One rule that is easy to get wrong: never draw a mark in literal white on a
// brand fill. This ramp inverts between themes — brand-600 is a dark blue in
// light mode and a *light* blue in dark — so white-on-brand is legible in one
// theme and nearly invisible in the other. Marks use `--color-surface-raised`,
// which flips with the theme and therefore stays readable on both.
//
// House rules for everything below:
//   * Colour comes from the brand tokens, so both themes work without a second
//     set of assets and nothing is hardcoded to one background.
//   * No faces, no figures, no flags. Abstractions of the *work* — papers put
//     in order, a conversation, a lock — never depictions of the person.
//   * Decorative, so `aria-hidden`. Everything they convey is written in the
//     copy beside them; a screen reader loses nothing by skipping them.

type ArtProps = { className?: string };

const wrap = (className?: string) =>
  ["h-auto w-full select-none", className].filter(Boolean).join(" ");

/**
 * Overlapping speech shapes at different depths — a conversation already in
 * progress, which is the honest claim: the community exists before you arrive.
 */
export function CommunityArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 320 200" role="presentation" aria-hidden="true" className={wrap(className)}>
      <defs>
        <linearGradient id="ca-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity=".95" />
          <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity=".95" />
        </linearGradient>
      </defs>

      {/* furthest back, faintest */}
      <rect
        x="30"
        y="20"
        width="150"
        height="62"
        rx="18"
        fill="var(--color-brand-200)"
        opacity=".55"
      />
      <rect
        x="46"
        y="40"
        width="86"
        height="7"
        rx="3.5"
        fill="var(--color-brand-400)"
        opacity=".7"
      />
      <rect
        x="46"
        y="55"
        width="58"
        height="7"
        rx="3.5"
        fill="var(--color-brand-400)"
        opacity=".45"
      />

      {/* middle */}
      <rect x="140" y="66" width="156" height="70" rx="18" fill="url(#ca-a)" />
      <rect
        x="158"
        y="88"
        width="98"
        height="7"
        rx="3.5"
        fill="var(--color-surface-raised)"
        opacity=".85"
      />
      <rect
        x="158"
        y="104"
        width="66"
        height="7"
        rx="3.5"
        fill="var(--color-surface-raised)"
        opacity=".55"
      />

      {/* front */}
      <rect
        x="22"
        y="112"
        width="140"
        height="64"
        rx="18"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <rect
        x="40"
        y="132"
        width="80"
        height="7"
        rx="3.5"
        fill="var(--color-brand-500)"
        opacity=".8"
      />
      <rect
        x="40"
        y="148"
        width="52"
        height="7"
        rx="3.5"
        fill="var(--color-muted-foreground)"
        opacity=".4"
      />

      {/* the people, as marks not figures */}
      <circle cx="272" cy="40" r="11" fill="var(--color-brand-300)" />
      <circle cx="248" cy="40" r="11" fill="var(--color-brand-200)" />
      <circle cx="296" cy="40" r="11" fill="var(--color-brand-400)" />
    </svg>
  );
}

/**
 * Loose pages becoming an ordered column. The whole promise of the case side
 * of the product in one shape.
 */
export function StoryArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 320 200" role="presentation" aria-hidden="true" className={wrap(className)}>
      {/* scattered, left */}
      <g opacity=".75">
        <rect
          x="16"
          y="46"
          width="70"
          height="90"
          rx="8"
          fill="var(--color-surface-raised)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          transform="rotate(-13 51 91)"
        />
        <rect
          x="34"
          y="30"
          width="70"
          height="90"
          rx="8"
          fill="var(--color-surface-raised)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          transform="rotate(7 69 75)"
        />
      </g>

      {/* the arrow of the work itself */}
      <path
        d="M120 100 H166"
        stroke="var(--color-brand-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 7"
        opacity=".8"
      />
      <path
        d="M160 93 l8 7 -8 7"
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ordered, right: a timeline */}
      <line x1="196" y1="36" x2="196" y2="164" stroke="var(--color-brand-200)" strokeWidth="2.5" />
      {[46, 84, 122, 156].map((y, i) => (
        <g key={y}>
          <circle
            cx="196"
            cy={y}
            r="6.5"
            fill={i === 3 ? "var(--color-brand-300)" : "var(--color-brand-500)"}
          />
          <rect
            x="214"
            y={y - 9}
            width={[86, 68, 92, 54][i]}
            height="7"
            rx="3.5"
            fill="var(--color-muted-foreground)"
            opacity=".35"
          />
          <rect
            x="214"
            y={y + 2}
            width={[54, 40, 62, 34][i]}
            height="6"
            rx="3"
            fill="var(--color-muted-foreground)"
            opacity=".2"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * A lock with the key on the reader's side of it. The point is not that the
 * data is locked — it is that the person holding the key is you.
 */
export function ControlArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 320 200" role="presentation" aria-hidden="true" className={wrap(className)}>
      <defs>
        <linearGradient id="co-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="var(--color-brand-700)" />
        </linearGradient>
      </defs>

      <rect x="104" y="86" width="112" height="86" rx="16" fill="url(#co-a)" />
      <path
        d="M128 86 v-18 a32 32 0 0 1 64 0 v18"
        fill="none"
        stroke="var(--color-brand-400)"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <circle cx="160" cy="122" r="10" fill="var(--color-surface-raised)" opacity=".95" />
      <rect
        x="155.5"
        y="128"
        width="9"
        height="20"
        rx="4.5"
        fill="var(--color-surface-raised)"
        opacity=".95"
      />

      {/* three switches: what you share is granular, and reversible */}
      {[44, 78, 112].map((y, i) => (
        <g key={y}>
          <rect
            x="18"
            y={y}
            width="52"
            height="26"
            rx="13"
            fill={i < 2 ? "var(--color-brand-200)" : "var(--color-surface-sunken)"}
            stroke="var(--color-border)"
            strokeWidth="1.5"
          />
          <circle
            cx={i < 2 ? 57 : 31}
            cy={y + 13}
            r="9"
            fill={i < 2 ? "var(--color-brand-600)" : "var(--color-border-strong)"}
          />
        </g>
      ))}

      {/* and it can be taken back */}
      <path
        d="M250 132 a30 30 0 1 0 -12 -24"
        fill="none"
        stroke="var(--color-brand-400)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M232 100 l6 10 12 -4"
        fill="none"
        stroke="var(--color-brand-400)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A slot on a calendar, and two seats. An appointment, not an oracle. */
export function LawyerArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 320 200" role="presentation" aria-hidden="true" className={wrap(className)}>
      <rect
        x="24"
        y="34"
        width="164"
        height="140"
        rx="16"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <path d="M24 62 h164" stroke="var(--color-border)" strokeWidth="1.5" />
      <circle cx="46" cy="48" r="4" fill="var(--color-brand-400)" />
      <circle cx="62" cy="48" r="4" fill="var(--color-brand-200)" />

      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => {
          const chosen = r === 2 && c === 2;
          return (
            <rect
              key={`${r}-${c}`}
              x={42 + c * 27}
              y={78 + r * 23}
              width="20"
              height="14"
              rx="5"
              fill={chosen ? "var(--color-brand-600)" : "var(--color-surface-sunken)"}
              stroke={chosen ? "none" : "var(--color-border)"}
              strokeWidth="1"
            />
          );
        }),
      )}

      {/* two seats, facing */}
      <rect x="214" y="96" width="34" height="44" rx="10" fill="var(--color-brand-200)" />
      <rect x="262" y="96" width="34" height="44" rx="10" fill="var(--color-brand-400)" />
      <path
        d="M256 118 h-2 M258 118 h6"
        stroke="var(--color-brand-600)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A shield built from separate panes — privacy as several decisions, not one. */
export function PrivacyArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 320 200" role="presentation" aria-hidden="true" className={wrap(className)}>
      <path
        d="M160 24 L246 54 v58 c0 38 -38 58 -86 72 c-48 -14 -86 -34 -86 -72 V54 Z"
        fill="var(--color-brand-100)"
        stroke="var(--color-brand-300)"
        strokeWidth="2"
      />
      <path
        d="M160 24 L246 54 v58 c0 38 -38 58 -86 72 Z"
        fill="var(--color-brand-200)"
        opacity=".7"
      />
      <path d="M160 24 v160" stroke="var(--color-brand-300)" strokeWidth="1.5" opacity=".8" />
      <path d="M74 96 h172" stroke="var(--color-brand-300)" strokeWidth="1.5" opacity=".8" />
      <circle
        cx="160"
        cy="104"
        r="24"
        fill="var(--color-surface-raised)"
        stroke="var(--color-brand-400)"
        strokeWidth="2"
      />
      <path
        d="M149 104 l8 8 15 -16"
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A wide, quiet band for the how-it-works section: a path with three marks on
 * it. Long, uneven, and it does arrive somewhere.
 */
export function JourneyArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 900 120" role="presentation" aria-hidden="true" className={wrap(className)}>
      <path
        d="M20 84 C 140 84, 150 30, 260 30 S 400 92, 520 92 S 680 26, 800 26 L 880 26"
        fill="none"
        stroke="var(--color-brand-200)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M20 84 C 140 84, 150 30, 260 30 S 400 92, 520 92"
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[
        [260, 30],
        [520, 92],
        [800, 26],
      ].map(([cx, cy], i) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy={cy}
            r="14"
            fill="var(--color-surface-raised)"
            stroke={i < 2 ? "var(--color-brand-500)" : "var(--color-brand-300)"}
            strokeWidth="3"
          />
          <circle
            cx={cx}
            cy={cy}
            r="5"
            fill={i < 2 ? "var(--color-brand-500)" : "var(--color-brand-300)"}
          />
        </g>
      ))}
    </svg>
  );
}
