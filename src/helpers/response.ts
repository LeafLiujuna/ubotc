import { ApiResponse } from "@/types";
import { AuthHelper } from "./auth";

export type HandleResponseOptions = {
  /** 阻止在遇到未认证错误时自动重定向到登录页 */
  ignoreRedirectToLogin?: boolean;
  /** 阻止显示标准错误alert */
  ignoreAlertOnError?: boolean;
};

export const handleResponse = async (response: ApiResponse, opts: HandleResponseOptions = {}): Promise<boolean> => {
  if (response.status >= 200 && response.status < 300) {
    return true;
  }

  if (!opts.ignoreAlertOnError) {
    window.$toast.error(response.message || "请求发生错误");
  }

  if (response.status === 401 && !opts.ignoreRedirectToLogin) {
    // 显示登录页面
    AuthHelper.doLogin();
  }

  return false;
};