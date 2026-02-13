import { getApiPath } from '../../utils/api';

export interface ApiError {
  error: string;
  status?: number;
}

export class ApiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }

  /** True if the error is due to expired session (401); caller should not show error UI, redirect is in progress. */
  static isSessionExpired(e: unknown): boolean {
    if (e instanceof ApiClientError && e.status === 401) return true;
    if (e && typeof e === 'object' && 'status' in e && (e as { status?: number }).status === 401) return true;
    if (e && typeof e === 'object' && 'message' in e && String((e as { message?: unknown }).message).includes('Session expired')) return true;
    return false;
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;
    
    const url = getApiPath(endpoint);
    
    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...defaultHeaders,
        ...fetchOptions.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        const onSessionExpired = (globalThis as unknown as { __onSessionExpired?: () => void }).__onSessionExpired;
        onSessionExpired?.();
      }
      let errorMessage = `HTTP error: ${response.statusText}`;
      try {
        const errorData = await response.json().catch(() => ({}));
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Если не удалось распарсить JSON, используем дефолтное сообщение
      }
      throw new ApiClientError(errorMessage, response.status);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ApiClientError('Failed to parse response', response.status);
    }
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
    });
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();

