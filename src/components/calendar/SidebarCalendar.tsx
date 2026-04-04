"use client";

import * as React from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const START_YEAR = 1900;
const END_YEAR = 3000;

type Props = {
  className?: string;
  onDateChange?: (date: Date) => void;
};

type CalendarCell =
  | { key: string; type: "empty" }
  | { key: string; type: "day"; date: Date; dayNumber: number };

function toYmd(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return toYmd(a) === toYmd(b);
}

/**
 * Scribble ring for “today”. Positioned relative to the *label* only (not the full grid cell),
 * with width tied to text width so two-digit days stay centered.
 */
function TodayScribbleRing() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[34px] w-[calc(100%+24px)] min-w-[34px] -translate-x-1/2 -translate-y-1/2 overflow-visible"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="rotate(-7 16 16)">
        <path
          d="M16 5.2c5.6-.4 10.6 2.2 13.2 6.8 1.6 2.6 2.2 5.8 1.4 8.6-.8 2.6-2.6 4.8-5 6.2-4.4 2.4-10.2 2.4-14.6 0-2.8-1.6-5-4-5.8-7-.8-2.8-.2-5.8 1.6-8 2.8-3.6 8.2-6.2 13.8-6.6"
          className="text-red-500"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="rotate(6 16 16)">
        <path
          d="M15.4 4.4c6 .2 11.6 3.4 14 8.6 1.2 2.4 1.4 5.2.4 7.6-1 2.6-3 4.6-5.6 5.8-4.8 2-10.8 1.6-15.2-1-3-1.8-5.4-4.6-6.4-8-.6-2.2-.2-4.6 1-6.6 2.4-4 7.8-6.6 13.8-6.4"
          className="text-red-600/85"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function SidebarCalendar({ className = "", onDateChange }: Props) {
  const today = React.useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = React.useState<Date>(today);
  const [currentMonth, setCurrentMonth] = React.useState<number>(today.getMonth());
  const [currentYear, setCurrentYear] = React.useState<number>(today.getFullYear());
  const [isYearMenuOpen, setIsYearMenuOpen] = React.useState(false);
  const yearMenuRef = React.useRef<HTMLDivElement | null>(null);

  const years = React.useMemo(() => {
    return Array.from(
      { length: END_YEAR - START_YEAR + 1 },
      (_, i) => START_YEAR + i,
    );
  }, []);

  const cells = React.useMemo<CalendarCell[]>(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const emptyCells: CalendarCell[] = Array.from({ length: firstDay }, (_, i) => ({
      key: `empty-${i}`,
      type: "empty",
    }));

    const dayCells: CalendarCell[] = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNumber = i + 1;
      const date = new Date(currentYear, currentMonth, dayNumber);
      return {
        key: toYmd(date),
        type: "day",
        date,
        dayNumber,
      };
    });

    return [...emptyCells, ...dayCells];
  }, [currentMonth, currentYear]);

  const handlePickDate = React.useCallback(
    (date: Date) => {
      setSelectedDate(date);
      onDateChange?.(date);
    },
    [onDateChange],
  );

  // If caller drives date selection (e.g., scratchpad), we can optionally
  // add that later; for now this component is self-contained and emits changes.

  React.useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!yearMenuRef.current) return;
      if (!yearMenuRef.current.contains(event.target as Node)) {
        setIsYearMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className={["w-full space-y-2.5", className].join(" ")} aria-label="Sidebar calendar">
      <div className="grid grid-cols-[1fr_1fr] gap-1.5">
        <select
          value={currentMonth}
          onChange={(e) => setCurrentMonth(Number(e.target.value))}
          className="h-8 rounded-lg bg-muted/80 px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="Select month"
        >
          {MONTHS.map((monthName, monthIndex) => (
            <option key={monthName} value={monthIndex}>
              {monthName}
            </option>
          ))}
        </select>

        <div className="relative" ref={yearMenuRef}>
          <button
            type="button"
            onClick={() => setIsYearMenuOpen((open) => !open)}
            className="flex h-8 w-full items-center justify-between rounded-lg bg-muted/80 px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label="Select year"
            aria-haspopup="listbox"
            aria-expanded={isYearMenuOpen}
          >
            <span>{currentYear}</span>
            <span className="text-[10px] text-foreground/70">v</span>
          </button>

          {isYearMenuOpen ? (
            <div className="absolute left-0 right-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-lg bg-background p-1 shadow-lg">
              {years.map((year) => {
                const isActive = year === currentYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setCurrentYear(year);
                      setIsYearMenuOpen(false);
                    }}
                    className={[
                      "flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition-colors",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-foreground/5",
                    ].join(" ")}
                    role="option"
                    aria-selected={isActive}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 rounded-lg bg-muted/55 p-1.5 shadow-inner">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="flex h-6 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-foreground/65"
          >
            {day}
          </div>
        ))}

        {cells.map((cell) => {
          if (cell.type === "empty") {
            return <div key={cell.key} className="h-7" aria-hidden="true" />;
          }

          const isToday = isSameDay(cell.date, today);
          const isSelected = isSameDay(cell.date, selectedDate);

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => handlePickDate(cell.date)}
              className={[
                "flex h-7 w-full min-w-0 items-center justify-center rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                isSelected && !isToday
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-transparent text-foreground/90",
                isToday ? "font-bold text-foreground" : "font-normal",
                !isSelected ? "hover:bg-background" : "",
              ].join(" ")}
              aria-pressed={isSelected}
              aria-label={`Select ${cell.date.toDateString()}`}
            >
              <span className="relative inline-flex items-center justify-center px-px">
                {isToday ? <TodayScribbleRing /> : null}
                <span className="relative z-10 tabular-nums leading-none">{cell.dayNumber}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

