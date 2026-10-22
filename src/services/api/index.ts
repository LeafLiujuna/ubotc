import type { AxiosRequestConfig } from "axios";
import { apiClient as rawApiClient } from "@/transport/http";
import { unwrapApiResponse } from "./response";

type LegacyApiClient = {
  get<TRequest = unknown, TResponse = unknown>(url: string, config?: AxiosRequestConfig<TRequest>): Promise<TResponse>;
  post<TRequest = unknown, TResponse = unknown>(url: string, data?: TRequest, config?: AxiosRequestConfig<TRequest>): Promise<TResponse>;
  put<TRequest = unknown, TResponse = unknown>(url: string, data?: TRequest, config?: AxiosRequestConfig<TRequest>): Promise<TResponse>;
  delete<TRequest = unknown, TResponse = unknown>(url: string, config?: AxiosRequestConfig<TRequest>): Promise<TResponse>;
};

const apiClient: LegacyApiClient = {
  async get(url, config) {
    const response = await rawApiClient.get(url, config);
    return unwrapApiResponse(response.data);
  },
  async post(url, data, config) {
    const response = await rawApiClient.post(url, data, config);
    return unwrapApiResponse(response.data);
  },
  async put(url, data, config) {
    const response = await rawApiClient.put(url, data, config);
    return unwrapApiResponse(response.data);
  },
  async delete(url, config) {
    const response = await rawApiClient.delete(url, config);
    return unwrapApiResponse(response.data);
  },
};

export default apiClient;
