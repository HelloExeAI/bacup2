"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { notificationSoundSrc, type NotificationSoundId } from "@/lib/notifications/notificationSounds";
import { useNotificationSoundStore } from "@/store/notificationSoundStore";

/** Matches `ThemeToggle` / bell — no border, hover wash only. */
const topbarIconBtnBase =
  "inline-flex h-10 shrink-0 items-center justify-center overflow-visible rounded-md bg-transparent text-foreground transition-[transform,colors] hover:bg-muted/60 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const topbarIconOnlyClass = `${topbarIconBtnBase} w-10`;

/** Icon + LCD countdown in one control so digits sit tight next to the glyph (no 40px box dead space). */
const topbarIconWithTimeClass = `${topbarIconBtnBase} w-auto min-w-10 gap-0.5 px-1.5 sm:gap-1 sm:px-2`;

const PRESETS_MIN = [1, 5, 10, 25, 60] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function formatRemaining(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** DSEG7 numerals only (no ghost), matching the top bar clock. */
function LcdTimeField({
  label,
  value,
  onValueChange,
  maxLen = 2,
}: {
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  maxLen?: number;
}) {
  return (
    <label className="min-w-0 flex-1 space-y-1">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <div className="flex h-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50 dark:bg-muted/35 focus-within:ring-2 focus-within:ring-foreground/15">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          maxLength={maxLen}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, maxLen);
            onValueChange(raw);
          }}
          className="bacup-lcd-dseg w-full min-w-0 border-0 bg-transparent px-1 text-center text-[1.15rem] font-bold leading-none tracking-tight text-foreground outline-none focus:ring-0 sm:text-[1.25rem]"
        />
      </div>
    </label>
  );
}

function useAlarmLoop(active: boolean, soundId: NotificationSoundId) {
  const ref = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (!active) {
      const a = ref.current;
      if (a) {
        a.pause();
        a.src = "";
        ref.current = null;
      }
      return;
    }

    const effective: NotificationSoundId = soundId === "none" ? "notif_1" : soundId;
    const src = notificationSoundSrc(effective);
    if (!src) return;

    const audio = new Audio(src);
    audio.loop = true;
    ref.current = audio;
    void audio.play().catch(() => {
      /* autoplay policy */
    });

    return () => {
      audio.pause();
      audio.src = "";
      if (ref.current === audio) ref.current = null;
    };
  }, [active, soundId]);
}

export function TopbarTimer() {
  const preferenceSound = useNotificationSoundStore((s) => s.soundId);

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [hoursStr, setHoursStr] = React.useState("0");
  const [minutesStr, setMinutesStr] = React.useState("5");
  const [secondsStr, setSecondsStr] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [endAt, setEndAt] = React.useState<number | null>(null);
  const [remainingSec, setRemainingSec] = React.useState(0);
  const [alarmOpen, setAlarmOpen] = React.useState(false);
  const [alarmNote, setAlarmNote] = React.useState("");
  const noteRef = React.useRef(note);
  noteRef.current = note;

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const running = endAt != null && !alarmOpen;

  useAlarmLoop(alarmOpen, preferenceSound);

  React.useEffect(() => {
    if (endAt == null || alarmOpen) return;

    const tick = () => {
      const ms = endAt - Date.now();
      if (ms <= 0) {
        setRemainingSec(0);
        setEndAt(null);
        setAlarmNote(noteRef.current.trim());
        setPanelOpen(false);
        setAlarmOpen(true);
        return;
      }
      setRemainingSec(ms / 1000);
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endAt, alarmOpen]);

  React.useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [panelOpen]);

  const startTimer = () => {
    const h = clamp(Number.parseInt(hoursStr, 10) || 0, 0, 99);
    const m = clamp(Number.parseInt(minutesStr, 10) || 0, 0, 59);
    const sec = clamp(Number.parseInt(secondsStr, 10) || 0, 0, 59);
    const total = h * 3600 + m * 60 + sec;
    if (total <= 0) return;
    setEndAt(Date.now() + total * 1000);
    setRemainingSec(total);
    setAlarmOpen(false);
  };

  const cancelTimer = () => {
    setEndAt(null);
    setRemainingSec(0);
  };

  const dismissAlarm = () => {
    setAlarmOpen(false);
    setAlarmNote("");
    cancelTimer();
    setPanelOpen(false);
  };

  const applyPreset = (min: number) => {
    setHoursStr(String(Math.floor(min / 60)));
    setMinutesStr(String(min % 60));
    setSecondsStr("0");
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <button
          type="button"
          aria-label={running ? `Timer running, ${formatRemaining(remainingSec)} left` : "Open timer"}
          aria-expanded={panelOpen}
          onClick={() => {
            if (alarmOpen) return;
            setPanelOpen((o) => !o);
          }}
          className={running ? topbarIconWithTimeClass : topbarIconOnlyClass}
        >
          <span className={running ? "bacup-timer-icon-live inline-flex text-foreground" : "inline-flex text-foreground"}>
            <TimerIcon className="h-5 w-5 shrink-0" aria-hidden />
          </span>
          {running ? (
            <span className="bacup-lcd-dseg text-[11px] font-bold tabular-nums leading-none text-foreground sm:text-xs">
              {formatRemaining(remainingSec)}
            </span>
          ) : null}
        </button>

        {panelOpen && !alarmOpen ? (
          <div
            className="absolute left-1/2 top-[calc(100%+0.5rem)] z-[60] w-[min(calc(100vw-2rem),22rem)] -translate-x-1/2 rounded-xl border border-border bg-background p-3 shadow-lg dark:bg-[hsl(222.2_84%_6%)]"
          role="dialog"
          aria-label="Timer"
        >
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timer</div>
            {running ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-h-[2.5rem] min-w-0 flex-1 items-center justify-center">
                  <span className="bacup-lcd-dseg text-[1.35rem] font-bold leading-none tracking-tight text-foreground sm:text-[1.45rem]">
                    {formatRemaining(remainingSec)}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  onClick={cancelTimer}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <LcdTimeField label="Hours" value={hoursStr} onValueChange={setHoursStr} maxLen={2} />
                  <LcdTimeField label="Min" value={minutesStr} onValueChange={setMinutesStr} maxLen={2} />
                  <LcdTimeField label="Sec" value={secondsStr} onValueChange={setSecondsStr} maxLen={2} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS_MIN.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
                      onClick={() => applyPreset(p)}
                    >
                      {p}m
                    </button>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Note (optional)</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What is this for?"
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  />
                </label>
                <Button type="button" className="w-full" onClick={startTimer}>
                  Start
                </Button>
              </>
            )}
          </div>
        </div>
        ) : null}
      </div>

      {mounted && alarmOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
              role="presentation"
            >
              <div
                className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="bacup-timer-alarm-title"
                aria-describedby="bacup-timer-alarm-desc"
              >
                <h2 id="bacup-timer-alarm-title" className="text-lg font-semibold text-foreground">
                  Time&apos;s up
                </h2>
                <p id="bacup-timer-alarm-desc" className="mt-2 text-sm text-muted-foreground">
                  {alarmNote || "Your timer has finished."}
                </p>
                <Button type="button" className="mt-5 w-full" onClick={dismissAlarm}>
                  Okay
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function TimerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v5l3 2" />
      <path d="M9 3h6" />
      <path d="M12 3v2" />
    </svg>
  );
}
