export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function readApi<T>(response: Response): Promise<ApiResult<T>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as ApiResult<T>;
  } catch {
    return {
      success: false,
      error: raw.trim() || `Request failed with status ${response.status}`
    };
  }
}
