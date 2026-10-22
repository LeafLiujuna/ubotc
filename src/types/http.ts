export type ApiErrorCode = `ERR::${string}`;

export interface ApiResponseWarning {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export interface ApiSuccessResponse<T> {
  status: number;
  message?: string;
  data?: T;
  warnings?: ApiResponseWarning[];
}

export interface ApiErrorResponse {
  errorCode: ApiErrorCode;
  message: string;
  errorId?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> & Partial<ApiErrorResponse>;

export interface ApiPaginationQuery {
  page?: number;
  page_size?: number;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
}
