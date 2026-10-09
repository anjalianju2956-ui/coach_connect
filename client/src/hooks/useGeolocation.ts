import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationSample } from "../types";

/**
 * Browser Geolocation wrapper.
 *
 * - Only reads while explicitly enabled (journey verification / train mode)
 * - Stops cleanly when the component unmounts or tracking is turned off
 * - Maps every GeolocationPositionError to a human-readable state
 *
 * No third-party GPS API is used or required.
 */

export type GeoStatus =
  | "idle"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export interface GeoState {
  status: GeoStatus;
  message: string;
  position: LocationSample | null;
  lastUpdated: number | null;
}

const IDLE: GeoState = {
  status: "idle",
  message: "Location not requested yet.",
  position: null,
  lastUpdated: null,
};

const MESSAGES: Record<GeoStatus, string> = {
  idle: "Location not requested yet.",
  locating: "Waiting for a GPS fix…",
  ready: "Location connected.",
  denied: "Location permission denied. Allow it in your browser settings to verify your journey.",
  unavailable: "Location unavailable right now. Try again near a window or open area.",
  timeout: "Location request timed out. Try again.",
  unsupported: "This browser does not support geolocation.",
};

function toSample(pos: GeolocationPosition): LocationSample {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? 50,
    speed: typeof pos.coords.speed === "number" && Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
    heading:
      typeof pos.coords.heading === "number" && Number.isFinite(pos.coords.heading)
        ? pos.coords.heading
        : null,
    timestamp: pos.timestamp || Date.now(),
  };
}

export function useGeolocation() {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const [state, setState] = useState<GeoState>(() =>
    supported ? IDLE : { ...IDLE, status: "unsupported", message: MESSAGES.unsupported },
  );
  const watchIdRef = useRef<number | null>(null);
  const lastSampleRef = useRef<LocationSample | null>(null);
  /** true only while a watchPosition() is actually registered. */
  const [watching, setWatching] = useState(false);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && supported) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, [supported]);

  const applyError = useCallback(
    (error: GeolocationPositionError) => {
      const status: GeoStatus =
        error.code === error.PERMISSION_DENIED
          ? "denied"
          : error.code === error.TIMEOUT
            ? "timeout"
            : "unavailable";
      // A denied watch never recovers — release it so the UI stops offering
      // a "Stop tracking" button that would do nothing.
      if (error.code === error.PERMISSION_DENIED) clearWatch();
      setState((prev) => ({
        ...prev,
        status,
        message: error.message ? `${MESSAGES[status]} (${error.message})` : MESSAGES[status],
      }));
    },
    [clearWatch],
  );

  const applySuccess = useCallback((pos: GeolocationPosition) => {
    const sample = toSample(pos);
    lastSampleRef.current = sample;
    setState({
      status: "ready",
      message: MESSAGES.ready,
      position: sample,
      lastUpdated: Date.now(),
    });
  }, []);

  /** One-shot fix. Safe to call repeatedly (e.g. before verifying). */
  const requestOnce = useCallback(
    (timeoutMs = 15000) => {
      if (!supported) {
        setState((prev) => ({ ...prev, status: "unsupported", message: MESSAGES.unsupported }));
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "locating",
        message: MESSAGES.locating,
      }));
      navigator.geolocation.getCurrentPosition(applySuccess, applyError, {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 3000,
      });
    },
    [supported, applySuccess, applyError],
  );

  /** Continuous tracking — only used while train mode is active. */
  const startWatching = useCallback(() => {
    if (!supported || watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(applySuccess, applyError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    });
    setWatching(true);
  }, [supported, applySuccess, applyError]);

  const stopWatching = useCallback(() => {
    clearWatch();
  }, [clearWatch]);

  const reset = useCallback(() => {
    clearWatch();
    lastSampleRef.current = null;
    setState(supported ? IDLE : { ...IDLE, status: "unsupported", message: MESSAGES.unsupported });
  }, [clearWatch, supported]);

  useEffect(() => clearWatch, [clearWatch]);

  return {
    supported,
    state,
    watching,
    lastSample: lastSampleRef.current,
    requestOnce,
    startWatching,
    stopWatching,
    reset,
  };
}
