"use client";

import { useEffect, useState } from "react";

/**
 * Asks the phone where it is and puts the answer in hidden form fields. It only ever sends what the phone says; the server decides what that
 * means (within, outside, unknown) and stamps its own time. If the phone refuses or has no signal, the form still works and the location is "unknown".
 */
export function GeoFields() {
  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [note, setNote] = useState("Locating…");
  useEffect(() => {
    if (!("geolocation" in navigator)) { setNote("No location on this device"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setNote(`Located (±${Math.round(p.coords.accuracy)} m)`); },
      () => setNote("Location not shared: it will be recorded as unknown"),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return (
    <>
      <input type="hidden" name="lat" value={fix?.lat ?? ""} />
      <input type="hidden" name="lng" value={fix?.lng ?? ""} />
      <input type="hidden" name="acc" value={fix?.acc ?? ""} />
      <span className="text-[0.6875rem] text-[var(--color-faint)]" data-testid="geo-note">{note}</span>
    </>
  );
}
