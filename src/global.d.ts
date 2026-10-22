import type { ToastApi } from "./services/toast";

declare global {
  interface Window {
    $toast: ToastApi;
  }
}

export {};
