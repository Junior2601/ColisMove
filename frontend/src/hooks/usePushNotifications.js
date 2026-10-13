import { useCallback, useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus } from "../lib/push";

/** État et actions des notifications push de cet appareil (voir getPushStatus) */
export function usePushNotifications() {
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => getPushStatus().then(setStatus), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = (action) => async () => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message || "Impossible de modifier les notifications.");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  return { status, busy, error, enable: run(enablePush), disable: run(disablePush), refresh };
}
