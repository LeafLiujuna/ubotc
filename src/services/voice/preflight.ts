export type VoicePreflightCode =
  | "OK"
  | "ERR_VOICE_HTTPS_REQUIRED"
  | "ERR_VOICE_UNSUPPORTED_BROWSER"
  | "ERR_VOICE_MICROPHONE_UNAVAILABLE"
  | "ERR_VOICE_PERMISSION_DENIED"
  | "ERR_VOICE_ENDPOINT_REQUIRED"
  | "ERR_VOICE_ENDPOINT_INSECURE";

export type VoicePreflightResult = {
  ok: boolean;
  code: VoicePreflightCode;
  message: string;
};

export function isVoiceSecureContext(): boolean {
  if (typeof window === "undefined" || typeof location === "undefined") return false;
  return window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

export async function checkVoicePreflight(endpoint?: string, options: { requireMicrophone?: boolean } = {}): Promise<VoicePreflightResult> {
  const requireMicrophone = options.requireMicrophone !== false;
  if (!isVoiceSecureContext()) {
    return {
      ok: false,
      code: "ERR_VOICE_HTTPS_REQUIRED",
      message: "语音需要 HTTPS 安全连接；本机 localhost 开发环境例外。",
    };
  }

  if (
    typeof navigator === "undefined" ||
    (requireMicrophone && !navigator.mediaDevices?.getUserMedia) ||
    typeof window === "undefined" ||
    !("RTCPeerConnection" in window)
  ) {
    return {
      ok: false,
      code: "ERR_VOICE_UNSUPPORTED_BROWSER",
      message: "当前浏览器不支持 WebRTC 麦克风，请使用最新版 Chrome、Edge、Firefox 或 Safari。",
    };
  }

  if (endpoint) {
    try {
      const endpointUrl = new URL(endpoint, window.location.href);
      if (!["ws:", "wss:"].includes(endpointUrl.protocol)) throw new Error("Invalid WebSocket URL");
      if (location.protocol === "https:" && endpointUrl.protocol !== "wss:") {
        return {
          ok: false,
          code: "ERR_VOICE_ENDPOINT_INSECURE",
          message: "HTTPS 页面只能连接 wss:// LiveKit endpoint。",
        };
      }
    } catch {
      return {
        ok: false,
        code: "ERR_VOICE_ENDPOINT_REQUIRED",
        message: "LiveKit endpoint 配置无效。",
      };
    }
  } else {
    return {
      ok: false,
      code: "ERR_VOICE_ENDPOINT_REQUIRED",
      message: "未配置 LiveKit endpoint，请设置 VITE_LIVEKIT_ENDPOINT。",
    };
  }

  if (!requireMicrophone) return { ok: true, code: "OK", message: "语音收听检查通过。" };

  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (permission.state === "denied") {
        return {
          ok: false,
          code: "ERR_VOICE_PERMISSION_DENIED",
          message: "麦克风权限已被拒绝，请在浏览器地址栏设置中允许麦克风。",
        };
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.some((device) => device.kind === "audioinput")) {
      return { ok: true, code: "OK", message: "语音前置检查通过。" };
    }
  } catch {
    // Permission prompts and device labels are intentionally deferred to the
    // user gesture that starts getUserMedia; do not silently block that flow.
    return { ok: true, code: "OK", message: "等待浏览器请求麦克风权限。" };
  }

  return {
    ok: false,
    code: "ERR_VOICE_MICROPHONE_UNAVAILABLE",
    message: "没有检测到可用麦克风，请连接设备后重试。",
  };
}
