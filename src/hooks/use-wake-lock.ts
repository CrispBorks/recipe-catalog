import * as React from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen awake while cooking. Safari and Chrome drop the lock when
 *  the tab is hidden, so it's re-acquired when the page becomes visible. */
export function useWakeLock() {
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [active, setActive] = React.useState(false);
  const sentinel = React.useRef<WakeLockSentinelLike | null>(null);

  const request = React.useCallback(async () => {
    if (!supported) return false;
    try {
      sentinel.current = await (
        navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
        }
      ).wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }, [supported]);

  const toggle = React.useCallback(async () => {
    if (active) {
      await sentinel.current?.release().catch(() => {});
      sentinel.current = null;
      setActive(false);
      return;
    }
    setActive(await request());
  }, [active, request]);

  React.useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, request]);

  React.useEffect(
    () => () => {
      void sentinel.current?.release().catch(() => {});
    },
    [],
  );

  return { supported, active, toggle };
}
