import { REQUEST_DATA } from "../types/index.js";
import { REQUEST_METHODS, VALID_REQUEST_PROTOCOLS } from "../enums/index.js";

export function generateAxiosRequestConfig<RequestDataType = any>(reqData: REQUEST_DATA<RequestDataType>) {
  return {
    method: reqData.method ?? REQUEST_METHODS.GET,
    url: reqData.path ?? '',
    baseURL: `${reqData.protocol ?? VALID_REQUEST_PROTOCOLS.HTTPS}://${
      reqData.hostname
    }:${reqData.port ?? 443}`,
    headers: reqData.headers ?? {},
    params: reqData.query ?? {},
    data: reqData.body,
    timeout: reqData.timeout ?? 15000,
    ...(reqData.signal ? { signal: reqData.signal } : {}),
  };
}
