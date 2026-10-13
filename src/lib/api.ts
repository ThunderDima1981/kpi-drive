export class ApiError extends Error {
  status: number
  headers: Headers | null

  constructor(status: number, message: string, headers: Headers | null = null) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiResponse<T>(path, init)).data
}

export async function apiResponse<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(response.status, body?.error || 'Не удалось выполнить запрос.', response.headers)
  }
  if (response.status === 204) return { data: undefined as T, headers: response.headers }
  return { data: (await response.json()) as T, headers: response.headers }
}
