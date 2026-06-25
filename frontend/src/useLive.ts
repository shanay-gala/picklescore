// Hook: subscribes to backend WebSocket and triggers refetches.
import { useEffect, useRef } from "react";
import { buildWsUrl } from "@/src/api";

export function useLive(onMessage: (msg: any) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const url = buildWsUrl();
    if (!url) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let pingTimer: any = null;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 0;
        pingTimer = setInterval(() => {
          try {
            ws?.send("ping");
          } catch {}
        }, 25000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(typeof e.data === "string" ? e.data : "");
          handlerRef.current(msg);
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 500 * retry);
      };
    };
    connect();

    return () => {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      try {
        ws?.close();
      } catch {}
    };
  }, []);
}
