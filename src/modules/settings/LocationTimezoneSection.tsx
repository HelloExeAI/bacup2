"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type GeoSearchResult = {
  displayName: string;
  lat: number;
  lon: number;
  timezone: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6D665F] dark:text-[hsl(35_18%_78%)]">
        {label}
      </div>
      {children}
    </div>
  );
}

export function LocationTimezoneSection({
  modalOpen,
  location,
  timezone,
  onLocationChange,
  onTimezoneChange,
  timezoneSuggestions,
}: {
  modalOpen: boolean;
  location: string;
  timezone: string;
  onLocationChange: (v: string) => void;
  onTimezoneChange: (v: string) => void;
  timezoneSuggestions: readonly string[];
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [manualMode, setManualMode] = React.useState(false);
  const [geoBusy, setGeoBusy] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [searchHits, setSearchHits] = React.useState<GeoSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = React.useState(false);
  const searchTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (modalOpen) {
      setManualMode(false);
      setChooserOpen(false);
      setSearchHits([]);
      setGeoError(null);
    }
  }, [modalOpen]);

  const openChooser = React.useCallback(() => {
    setGeoError(null);
    setChooserOpen(true);
  }, []);

  function onLocationPointerDown(e: React.PointerEvent<HTMLInputElement>) {
    if (!manualMode) {
      e.preventDefault();
      openChooser();
    }
  }

  function onLocationFocus(e: React.FocusEvent<HTMLInputElement>) {
    if (!manualMode) {
      e.preventDefault();
      e.target.blur();
      openChooser();
    }
  }

  React.useEffect(() => {
    if (!manualMode) {
      setSearchHits([]);
      return;
    }
    const q = location.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    if (searchTimer.current !== undefined) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        const j = (await res.json().catch(() => null)) as { results?: GeoSearchResult[] } | null;
        if (res.ok && j?.results && Array.isArray(j.results)) setSearchHits(j.results);
        else setSearchHits([]);
      } catch {
        setSearchHits([]);
      } finally {
        setSearchBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(searchTimer.current);
  }, [location, manualMode]);

  async function useDeviceLocation() {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 18_000,
          maximumAge: 120_000,
        });
      });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const res = await fetch("/api/geo/from-coords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Could not resolve address");
      onLocationChange(String(j.displayName ?? ""));
      onTimezoneChange(String(j.timezone ?? "UTC"));
      setChooserOpen(false);
      setManualMode(false);
    } catch (e: unknown) {
      const geo = e as Partial<GeolocationPositionError>;
      if (typeof geo.code === "number") {
        if (geo.code === 1) {
          setGeoError("Location permission was denied. You can set your location manually instead.");
        } else if (geo.code === 2) {
          setGeoError("Position unavailable. Try again or set location manually.");
        } else if (geo.code === 3) {
          setGeoError("Location request timed out. Try again or set manually.");
        } else {
          setGeoError("Could not detect location");
        }
      } else {
        setGeoError(e instanceof Error ? e.message : "Could not detect location");
      }
    } finally {
      setGeoBusy(false);
    }
  }

  function pickManual() {
    setGeoError(null);
    setChooserOpen(false);
    setManualMode(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelChooser() {
    setGeoError(null);
    setChooserOpen(false);
  }

  function selectHit(hit: GeoSearchResult) {
    onLocationChange(hit.displayName);
    onTimezoneChange(hit.timezone);
    setSearchHits([]);
    setManualMode(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <>
      {chooserOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={cancelChooser}
          />
          <div className="relative z-10 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-[#E0DDD6] bg-[#F5F3EF] p-4 shadow-xl dark:border-[hsl(35_10%_28%)] dark:bg-[hsl(35_12%_16%)]">
            <div className="text-sm font-semibold text-foreground">Set your location</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Use your device&apos;s approximate location (you&apos;ll be asked for browser permission), or type a place
              name to search.
            </p>
            {geoError ? (
              <div className="mt-3 rounded-md border border-red-500/35 bg-red-500/[0.08] px-2 py-1.5 text-[11px] text-red-800 dark:text-red-200">
                {geoError}
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <Button type="button" disabled={geoBusy} onClick={() => void useDeviceLocation()}>
                {geoBusy ? "Detecting…" : "Use current location"}
              </Button>
              <Button type="button" variant="ghost" className="border border-border" disabled={geoBusy} onClick={pickManual}>
                Enter manually
              </Button>
              <Button type="button" variant="ghost" disabled={geoBusy} onClick={cancelChooser}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Field label="Location">
        <div className="relative">
          <Input
            ref={inputRef}
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            onPointerDown={onLocationPointerDown}
            onFocus={onLocationFocus}
            placeholder={manualMode ? "Search city, region, country…" : "Tap to set location"}
            autoComplete="off"
          />
          {manualMode && (searchBusy || searchHits.length > 0) ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-[#E0DDD6] bg-white shadow-lg dark:border-[hsl(35_10%_28%)] dark:bg-[hsl(35_14%_12%)]">
              {searchBusy ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
              ) : (
                searchHits.map((h, i) => (
                  <button
                    key={`${h.lat},${h.lon},${i}`}
                    type="button"
                    className="block w-full border-b border-border/50 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-foreground/[0.04]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectHit(h)}
                  >
                    <span className="line-clamp-2 text-foreground">{h.displayName}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{h.timezone}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="text-[10px] font-medium text-[#6D665F] underline-offset-2 hover:underline dark:text-[hsl(35_18%_78%)]"
          onClick={() => {
            setManualMode(false);
            openChooser();
          }}
        >
          Auto-detect or change method
        </button>
      </Field>

      <Field label="Time zone">
        <Input
          list={listId}
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          placeholder="IANA, e.g. America/New_York"
        />
        <datalist id={listId}>
          {timezoneSuggestions.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <p className="text-[10px] text-muted-foreground">Filled automatically when you pick a place; you can edit if needed.</p>
      </Field>
    </>
  );
}
