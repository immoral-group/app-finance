import { fetchApi } from './client';

export interface Partner {
    id: string;
    name: string;
    email?: string;
    commission_type?: 'percentage' | 'fixed';
    default_commission_rate: number;
    department_id?: string;
    department?: {
        id: string;
        name: string;
        code: string;
    }
    is_active?: boolean;
}

export interface PartnerCommission {
    id: string;
    partner_id: string;
    partner_name: string;
    client_id: string;
    client_name: string;
    client?: { name: string };
    fiscal_year: number;
    fiscal_month: number;
    client_billing_amount: number;
    commission_rate: number;
    commission_amount: number;
    is_paid: boolean;
    client_is_paid?: boolean;
    payment_status?: string;
    notes?: string;
}

export interface PaymentRequest {
    id: string;
    partner_id: string;
    partner_email: string;
    fiscal_year: number;
    fiscal_month: number;
    total_amount: number;
    invoice_path: string;
    invoice_filename?: string;
    invoice_url?: string;
    status: 'pending' | 'approved' | 'rejected';
    notes?: string;
    admin_notes?: string;
    requested_at: string;
    reviewed_at?: string;
    partner?: { id: string; name: string; email?: string };
}

export const commissionsApi = {
    getPartners: () => {
        return fetchApi<{ partners: Partner[] }>('/partners', { service: 'COMMISSIONS' });
    },

    getCommissions: (year: number, month: number) => {
        return fetchApi<{ commissions: PartnerCommission[] }>(`/partners/commissions/${year}/${month}`, { service: 'COMMISSIONS' });
    },

    getAnnualCommissions: (year: number, partnerId?: string) => {
        const query = partnerId ? `?partner_id=${partnerId}` : '';
        return fetchApi<{ commissions: PartnerCommission[] }>(`/partners/commissions/annual/${year}${query}`, { service: 'COMMISSIONS' });
    },

    getMonthlyCommissions: (year: number, month: number, partnerId?: string) => {
        const query = partnerId ? `?partner_id=${partnerId}` : '';
        return fetchApi<{ commissions: PartnerCommission[] }>(`/partners/commissions/${year}/${month}${query}`, { service: 'COMMISSIONS' });
    },

    calculateCommissions: (year: number, month: number) => {
        return fetchApi('/partners/commissions/calculate', {
            service: 'COMMISSIONS',
            method: 'POST',
            body: JSON.stringify({ fiscal_year: year, fiscal_month: month, save: true })
        });
    },

    markPaid: (commissionId: string, paymentDate?: string, paymentReference?: string) => {
        return fetchApi(`/partners/commissions/${commissionId}/pay`, {
            service: 'COMMISSIONS',
            method: 'POST',
            body: JSON.stringify({
                payment_date: paymentDate || new Date().toISOString(),
                payment_reference: paymentReference
            })
        });
    },

    updateCommission: (commissionId: string, data: any) => {
        return fetchApi(`/partners/commissions/${commissionId}`, {
            service: 'COMMISSIONS',
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    createPartner: (data: Partial<Partner>) => {
        return fetchApi<{ partner: Partner }>('/partners', {
            service: 'COMMISSIONS',
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    createCommission: (data: any) => {
        return fetchApi('/partners/commissions', {
            service: 'COMMISSIONS',
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    deletePartner: (id: string) => {
        return fetchApi(`/partners/${id}`, {
            service: 'COMMISSIONS',
            method: 'DELETE'
        });
    },

    deleteCommission: (id: string) => {
        return fetchApi(`/partners/commissions/${id}`, {
            service: 'COMMISSIONS',
            method: 'DELETE'
        });
    },

    // Payment Requests
    requestPayment: async (formData: FormData) => {
        const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch('/api/commissions/payment-requests', {
            method: 'POST',
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: formData // No Content-Type header — browser sets multipart boundary
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Error al enviar solicitud');
        }
        return response.json();
    },

    getPaymentRequests: (params?: { partner_id?: string; status?: string; year?: number; month?: number }) => {
        const query = new URLSearchParams();
        if (params?.partner_id) query.set('partner_id', params.partner_id);
        if (params?.status) query.set('status', params.status);
        if (params?.year) query.set('year', String(params.year));
        if (params?.month) query.set('month', String(params.month));
        const qs = query.toString() ? `?${query.toString()}` : '';
        return fetchApi<{ requests: PaymentRequest[] }>(`/payment-requests${qs}`, { service: 'COMMISSIONS' });
    },

    getPaymentRequestDetail: (id: string) => {
        return fetchApi<{ request: PaymentRequest }>(`/payment-requests/${id}`, { service: 'COMMISSIONS' });
    },

    updatePaymentRequest: (id: string, data: { status: string; admin_notes?: string; reviewed_by?: string }) => {
        return fetchApi(`/payment-requests/${id}`, {
            service: 'COMMISSIONS',
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    deletePaymentRequest: (id: string) => {
        return fetchApi(`/payment-requests/${id}`, {
            service: 'COMMISSIONS',
            method: 'DELETE'
        });
    }
};

