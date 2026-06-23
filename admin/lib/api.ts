'use client';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data as T;
}
