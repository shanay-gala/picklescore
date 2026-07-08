import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api";

/**
 * Subscribes to backend WebSocket. Invokes onMessage(payload) on every server event.
 * Auto-reconnects with exponential backoff (starts at 1.5s, capped at 15s).
 *
 * Robust to React StrictMode double-invoke: uses refs so the cleanup closes
 * the *current* socket, and defers the first connect one microtask so a
 * synchronous unmount doesn't leave a dangling connection.
 */
export function useLive(onMessage) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    let closed = false;
    let retryMs = 1500;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let opened = false;
    const wsRef = { current: null };

    const cleanupHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const schedule = () => {
      if (closed) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closed) connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, 15000);
    };

    const connect = () => {
      if (closed) return;
      let ws;
      try {
        ws = new WebSocket(wsUrl());
      } catch (err) {
        void err;
        schedule();
        return;
      }
      wsRef.current = ws;
      opened = false;

      ws.onopen = () => {
        opened = true;
        retryMs = 1500;
        heartbeatTimer = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === 1) {
            try {
              wsRef.current.send("ping");
            } catch (err) {
              void err;
            }
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          cbRef.current?.(data);
        } catch (err) {
          void err;
        }
      };

      ws.onclose = () => {
        cleanupHeartbeat();
        if (!closed) schedule();
      };

      ws.onerror = () => {
        // Only close explicitly if never opened; browsers will fire onclose after error anyway.
        if (!opened && ws.readyState !== 3) {
          try {
            ws.close();
          } catch (err) {
            void err;
          }
        }
      };
    };

    // Defer initial connect so StrictMode's synchronous mount/unmount pair
    // doesn't create a dangling socket that logs "closed before established".
    const bootTimer = setTimeout(connect, 0);

    return () => {
      closed = true;
      clearTimeout(bootTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanupHeartbeat();
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          if (ws.readyState === 0 || ws.readyState === 1) ws.close();
        } catch (err) {
          void err;
        }
      }
    };
  }, []);
}
