"use client";

import * as React from "react";

import {
  formatClockAriaLabel,
  getClockFaceParts,
  resolveClockTimeZone,
  type ClockDisplayFormat,
} from "@/lib/time/clockDisplay";

/** Pill clock: even halo (0-offset blurs) so shadow wraps the shape, not only below. */
const clockShell =
  "rounded-full bg-muted/80 px-2.5 py-1 shadow-[0_0_0_1px_rgba(61,45,33,0.06),0_0_12px_rgba(61,45,33,0.1),0_0_28px_rgba(61,45,33,0.07)] dark:bg-muted/50 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_0_14px_rgba(0,0,0,0.42),0_0_32px_rgba(0,0,0,0.32)]";

const digitBlock =
  "bacup-lcd-dseg inline-flex h-[1.35em] min-w-[0.58em] shrink-0 items-center justify-center sm:h-[1.4em] sm:min-w-[0.62em]";

const digitGlyph =
  "scale-y-[1.14] text-[clamp(1.05rem,2.6vw,1.35rem)] leading-none text-foreground sm:scale-y-[1.12] sm:text-[1.4rem]";

function LcdDigit({ char }: { char: string }) {
  return (
    <span className={`${digitBlock} ${!/\d/.test(char) ? "min-w-[0.45em]" : ""}`} aria-hidden>
      <span className={digitGlyph}>{char}</span>
    </span>
  );
}

function LcdPair({ value }: { value: string }) {
  const chars = value.split("");
  return (
    <span className="inline-flex items-baseline gap-px">
      {chars.map((c, i) => (
        <LcdDigit key={`${i}-${c}`} char={c} />
      ))}
    </span>
  );
}

function LcdColon() {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center justify-center gap-[3px] self-center pb-0.5" aria-hidden>
      <span className="h-[3px] w-[3px] rounded-[1px] bg-foreground/45 sm:h-1 sm:w-1 sm:rounded-sm dark:bg-foreground/50" />
      <span className="h-[3px] w-[3px] rounded-[1px] bg-foreground/45 sm:h-1 sm:w-1 sm:rounded-sm dark:bg-foreground/50" />
    </span>
  );
}

function MeridiemStack({ active }: { active: "AM" | "PM" }) {
  const activeCls = "font-semibold text-red-600 dark:text-red-400";
  const idleCls = "font-medium text-muted-foreground/65 dark:text-muted-foreground/55";
  return (
    <div
      className="ml-1 flex flex-col justify-center gap-0.5 leading-none sm:ml-1.5"
      aria-hidden
    >
      <span className={`text-[9px] tracking-wide sm:text-[10px] ${active === "AM" ? activeCls : idleCls}`}>AM</span>
      <span className={`text-[9px] tracking-wide sm:text-[10px] ${active === "PM" ? activeCls : idleCls}`}>PM</span>
    </div>
  );
}

export function TopbarFlipClock({
  profileTimezone,
  clockDisplayFormat,
}: {
  profileTimezone: string | null | undefined;
  clockDisplayFormat: ClockDisplayFormat;
}) {
  const [now, setNow] = React.useState(() => new Date());
  const [focusEpoch, setFocusEpoch] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const bump = () => setFocusEpoch((e) => e + 1);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const timeZone = React.useMemo(
    () => resolveClockTimeZone("device", profileTimezone ?? null),
    [profileTimezone, now, focusEpoch],
  );

  const parts = React.useMemo(
    () => getClockFaceParts(now, timeZone, clockDisplayFormat),
    [now, timeZone, clockDisplayFormat],
  );

  const label = formatClockAriaLabel(now, timeZone, clockDisplayFormat);
  const showMeridiem = clockDisplayFormat === "12h" && parts.dayPeriod;
  const hourDisplay = parts.hour.padStart(2, "0");

  return (
    <div
      className={`hidden items-center md:flex ${clockShell}`}
      role="timer"
      aria-live="polite"
      aria-label={label}
      title={label}
    >
      <div className="flex items-center">
        <LcdPair value={hourDisplay} />
        <LcdColon />
        <LcdPair value={parts.minute} />
        <LcdColon />
        <LcdPair value={parts.second} />
        {showMeridiem && parts.dayPeriod ? <MeridiemStack active={parts.dayPeriod} /> : null}
      </div>
    </div>
  );
}
