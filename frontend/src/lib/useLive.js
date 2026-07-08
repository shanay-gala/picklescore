import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api";

/**
 * Subscribes to backend WebSocket. Invokes onMessage(payload) on every server event.
 * Auto-reconnects with exponential backoff up to 15s.
 */
export function useLive(onMessage) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    let ws = null;
    let closed = false;
    let retryMs = 800;
    let heartbeat = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch (e) {
        void e;
        schedule();
        return;
      }
      ws.onopen = () => {
        retryMs = 800;
        heartbeat = setInterval(() => {
          if (ws && ws.readyState === 1) ws.send("ping");
        }, 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          cbRef.current?.(data);
        } catch (_) {}
      };
      ws.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (!closed) schedule();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch (err) {
          void err;
        }
      };
    };

    const schedule = () => {
      setTimeout(() => {
        if (!closed) connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, 15000);
    };

    connect();
    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      try {
        ws && ws.close();
      } catch (err) {
        void err;
      }
    };
  }, []);
}
