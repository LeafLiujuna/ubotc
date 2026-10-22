type ApiResponseEnvelope<T> = {
  status: number;
  data: T;
  message?: string;
  errorCode?: string;
};

type NetworkErrorLike = {
  code?: string;
  message?: string;
  request?: unknown;
  response?: {
    status?: number;
    data?: {
      status?: number;
      message?: string;
      errorCode?: string;
    };
  };
};

export function unwrapApiResponse<T>(response: ApiResponseEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response && "status" in response) {
    return (response as ApiResponseEnvelope<T>).data;
  }
  return response as T;
}

export function getApiErrorMessage(error: NetworkErrorLike, fallback = "请求失败，请稍后重试"): string {
  if (error && (error.code === "ERR_NETWORK" || (!error.response && error.request))) {
    return "无法连接后端服务，请确认 lobby 服务已启动后重试";
  }

  const data = error?.response?.data;
  return data?.message || data?.errorCode || error?.message || fallback;
}

export function isUnauthorizedError(error: NetworkErrorLike): boolean {
  return error?.response?.status === 401 || error?.response?.data?.status === 401;
}
