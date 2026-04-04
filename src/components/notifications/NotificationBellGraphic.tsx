"use client";

import * as React from "react";

const SIZES = { topbar: 22, default: 20, compact: 16 } as const;

/**
 * Filled “cartoon” bell (yellow body, light band, clapper) — no heavy outline stroke.
 * Red badge with “!” when `showBadge`. Rings side-to-side when `showBadge` and motion allowed.
 */
export function NotificationBellGraphic({
  variant,
  showBadge,
  className = "",
}: {
  variant: keyof typeof SIZES;
  showBadge: boolean;
  className?: string;
}) {
  const px = SIZES[variant];
  const ring = showBadge;
  const uid = React.useId().replace(/:/g, "");
  const gidBody = `bacup-bell-body-${uid}`;

  return (
    <span
      className={[
        "inline-flex shrink-0 select-none items-center justify-center",
        ring ? "motion-safe:bacup-bell-ring-anim" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gidBody} x1="8" y1="6" x2="26" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE047" />
            <stop offset="0.45" stopColor="#FACC15" />
            <stop offset="1" stopColor="#EAB308" />
          </linearGradient>
        </defs>

        {/* Top loop */}
        <path
          d="M16 3.25c-1.35 0-2.35 0.85-2.35 2.05v0.45c0 0.5 0.35 0.9 0.8 1.05 0.45-0.1 0.95-0.15 1.55-0.15s1.1 0.05 1.55 0.15c0.45-0.15 0.8-0.55 0.8-1.05V5.3c0-1.2-1-2.05-2.35-2.05Z"
          fill="#D97706"
        />

        {/* Bell dome + skirt */}
        <path
          d="M16 7.5c-4.65 0-8.25 3.35-8.25 8.1 0 2.85-0.85 4.35-1.65 5.15-0.25 0.25-0.4 0.55-0.4 0.9v0.35c0 0.55 0.45 1 1 1h17.6c0.55 0 1-0.45 1-1v-0.35c0-0.35-0.15-0.65-0.4-0.9-0.8-0.8-1.65-2.3-1.65-5.15 0-4.75-3.6-8.1-8.25-8.1Z"
          fill={`url(#${gidBody})`}
        />

        {/* Light band */}
        <path
          d="M8.2 19.25h15.6a0.9 0.9 0 0 1 0.9 0.9v1.35a0.9 0.9 0 0 1-0.9 0.9H8.2a0.9 0.9 0 0 1-0.9-0.9v-1.35a0.9 0.9 0 0 1 0.9-0.9Z"
          fill="#E0F2FE"
        />
        <path d="M8.2 20.5h15.6v1.1H8.2v-1.1Z" fill="#BAE6FD" fillOpacity="0.55" />

        {/* Rim lip */}
        <path
          d="M6.75 22.6c0 0.35 0.2 0.65 0.5 0.85l0.35 0.2c1.85 1 4 1.55 8.4 1.55s6.55-0.55 8.4-1.55l0.35-0.2c0.3-0.2 0.5-0.5 0.5-0.85v-0.35H6.75v0.35Z"
          fill="#CA8A04"
        />

        {/* Clapper */}
        <circle cx="16" cy="26.25" r="2.15" fill="#EA580C" />
        <circle cx="16" cy="26.25" r="1.1" fill="#FDBA74" fillOpacity="0.65" />

        {showBadge ? (
          <g>
            <circle cx="25" cy="8.5" r="5.6" fill="#EF4444" />
            <circle cx="25" cy="8.5" r="4.9" fill="#F87171" fillOpacity="0.35" />
            <text
              x="25"
              y="9.35"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="9"
              fontWeight="700"
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
              style={{ userSelect: "none" }}
            >
              !
            </text>
          </g>
        ) : null}
      </svg>
    </span>
  );
}
