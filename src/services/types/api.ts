export type ApiSuccessResponse<T> = {
  status: number;
  data: T;
};

export type ApiSuccessNoDataResponse = {
  status: number;
  data?: undefined;
  message?: string;
};

export type ApiErrorResponse = {
  status: number;
  errorCode: string;
  message: string;
  errorId?: string;
};

export type ApiResponseEnvelope<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type ApiPaginated<T> = {
  items: T[];
  limit: number;
  offset: number;
  total?: number;
};