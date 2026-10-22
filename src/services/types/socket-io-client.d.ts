declare module "socket.io-client" {
  export type Socket = {
    connected: boolean;
    on: (event: string, handler: (...args: any[]) => void) => void;
    once: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
    removeAllListeners: () => void;
    connect: () => void;
    emit: (event: string, ...args: any[]) => void;
    disconnect: () => void;
  };

  export function io(url: string, options?: Record<string, unknown>): Socket;
}
