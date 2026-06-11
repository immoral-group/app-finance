import { fetchApi } from './client';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentLinkMode = 'from_invoice' | 'manual';
export type PaymentLinkStatus = 'active' | 'paid' | 'expired' | 'cancelled' | 'failed';

export interface PaymentLink {
    id: string;
    created_at: string;
    created_by: string;
    created_by_email: string;
    mode: PaymentLinkMode;
    stripe_session_id: string;
    stripe_payment_url: string;
    amount_cents: number;
    currency: string;
    concept: string;
    expires_at: string | null;
    holded_invoice_id: string | null;
    holded_doc_number: string | null;
    vertical: string | null;
    client_name: string | null;
    client_tax_id: string | null;
    customer_email: string | null;
    internal_note: string | null;
    status: PaymentLinkStatus;
    paid_at: string | null;
    stripe_payment_intent: string | null;
    last_email_sent_at: string | null;
    email_send_count: number;
}

export interface HoldedInvoice {
    id: string;
    docNumber: string;
    contactName: string;
    contactEmail: string;
    total: number;
    subtotal: number;
    date: number | null;
    dueDate: number | null;
    status: number;
    currency: string;
}

export interface CreateFromInvoicePayload {
    holded_invoice_id: string;
    holded_doc_number: string;
    concept: string;
    amount_cents: number;
    currency?: string;
    customer_email?: string;
    client_name?: string;
    client_tax_id?: string;
    vertical?: string;
    internal_note?: string;
    expires_in_days?: number;
}

export interface CreateManualPayload {
    concept: string;
    amount_cents: number;
    currency?: string;
    vertical?: string;
    client_name?: string;
    client_tax_id?: string;
    customer_email?: string;
    internal_note?: string;
    expires_in_days?: number;
}

export interface SendEmailPayload {
    to: string;
    subject?: string;
    body_html?: string;
}

// ── API ────────────────────────────────────────────────────────────────────────

export const paymentLinksApi = {
    createFromInvoice: (data: CreateFromInvoicePayload) =>
        fetchApi<{ success: boolean; link: PaymentLink }>('/payment-links/from-invoice', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    createManual: (data: CreateManualPayload) =>
        fetchApi<{ success: boolean; link: PaymentLink }>('/payment-links/manual', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    list: (params?: { status?: string; vertical?: string; from?: string; to?: string }) => {
        const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString() : '';
        return fetchApi<{ links: PaymentLink[] }>(`/payment-links${qs}`);
    },

    get: (id: string) =>
        fetchApi<{ link: PaymentLink }>(`/payment-links/${id}`),

    sendEmail: (id: string, data: SendEmailPayload) =>
        fetchApi<{ success: boolean }>(`/payment-links/${id}/send-email`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    cancel: (id: string) =>
        fetchApi<{ success: boolean }>(`/payment-links/${id}/cancel`, { method: 'POST' }),
};

export const searchHoldedInvoices = (q: string, status = 'pending') => {
    const qs = new URLSearchParams({ q, status }).toString();
    return fetchApi<{ invoices: HoldedInvoice[] }>(`/integrations/holded/invoices/search?${qs}`);
};
