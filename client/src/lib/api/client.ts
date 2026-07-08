import { supabase } from '@/lib/supabase';

const SERVICES = {
    ADMIN: '/api/admin',
    PAYROLL: '/api/payroll',
    COMMISSIONS: '/api/commissions',
    BILLING: '/api/billing'
};

interface FetchOptions extends RequestInit {
    service?: keyof typeof SERVICES;
    // Timeout en ms — aborta la petición si el server no responde a tiempo (default 45s).
    timeoutMs?: number;
}

export async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { service = 'ADMIN', timeoutMs = 45000, ...init } = options;
    const baseUrl = SERVICES[service];

    // Get current session token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // AbortController + timeout para que las peticiones no se cuelguen indefinidamente.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch(`${baseUrl}${endpoint}`, {
            ...init,
            signal: init.signal ?? controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...init.headers,
            },
        });
    } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
            throw new Error(`Timeout tras ${Math.round(timeoutMs / 1000)}s esperando al servidor`);
        }
        throw err;
    }
    clearTimeout(timer);

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `API request failed (${response.status})`);
    }

    return response.json();
}
