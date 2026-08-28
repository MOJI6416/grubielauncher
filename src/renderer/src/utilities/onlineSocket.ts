import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectOnlineSocket(baseUrl: string): () => void {
  socket?.disconnect();

  const next = io(`${baseUrl}/online`, {
    transports: ["websocket"],
    reconnection: true,
  });

  socket = next;

  return () => {
    next.disconnect();
    if (socket === next) socket = null;
  };
}

export function isOnlineSocketConnected(): boolean {
  return !!socket?.connected;
}
