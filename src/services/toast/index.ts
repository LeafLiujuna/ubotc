export type ToastMessage = string | { message?: string };

export type ToastOpenOptions = {
  message: string;
  type?: "success" | "error" | "info" | "warning" | string;
  duration?: number;
  dismissible?: boolean;
};

export type ToastMethodOptions = Record<string, unknown>;

export type ToastApi = {
  success: (message: ToastMessage, options?: ToastMethodOptions) => void;
  error: (message: ToastMessage, options?: ToastMethodOptions) => void;
  info: (message: ToastMessage, options?: ToastMethodOptions) => void;
  warning: (message: ToastMessage, options?: ToastMethodOptions) => void;
  open: (options: string | ToastOpenOptions) => void;
  dismissAll: () => void;
};

// Keep the shared API for existing callers without creating floating notifications.
const silent = () => {};

const toast: ToastApi = {
  success: silent,
  error: silent,
  info: silent,
  warning: silent,
  open: silent,
  dismissAll: silent,
};

export default toast;
