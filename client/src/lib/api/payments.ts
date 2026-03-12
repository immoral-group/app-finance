import { fetchApi } from './client';

// ============================================================
// Types
// ============================================================

export interface Beneficiary {
    id: string;
    name: string;
    type: 'equipo' | 'influencer' | 'comisiones' | 'transfer' | 'piso_yure';
    bank_details?: string;
    preferred_payment_method?: string;
    notes?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface Payment {
    id: string;
    payment_type: string;
    beneficiary_id?: string;
    beneficiary_name?: string;
    beneficiary?: { id: string; name: string; type: string };
    issuing_bank?: string;
    invoice_reference?: string;
    invoice_received_date?: string;
    amount_admk: string;
    amount_infinite: string;
    base_amount: number;
    commission_amount: number;
    incentives_amount: number;
    total_amount: number;
    currency: 'EUR' | 'USD';
    payment_status: 'pendiente' | 'programado' | 'pagado';
    payment_date?: string;
    due_date?: string;
    fiscal_year: number;
    fiscal_month: number;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentSummary {
    totalPayments: number;
    totalPaid: number;
    totalPending: number;
    count: number;
    byType: Record<string, { count: number; total: number }>;
    topBeneficiaries: { name: string; count: number; total: number }[];
}

export type CreatePaymentDTO = Omit<Payment, 'id' | 'created_at' | 'updated_at' | 'beneficiary'>;
export type UpdatePaymentDTO = Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at' | 'beneficiary' | 'fiscal_year' | 'fiscal_month'>>;

export type CreateBeneficiaryDTO = {
    name: string;
    type?: 'equipo' | 'influencer' | 'comisiones' | 'transfer' | 'piso_yure';
    bank_details?: string;
    preferred_payment_method?: string;
    notes?: string;
};

export type UpdateBeneficiaryDTO = Partial<CreateBeneficiaryDTO & { is_active: boolean }>;

// ============================================================
// API Functions
// ============================================================

export const paymentsApi = {
    // Beneficiaries
    getBeneficiaries: () =>
        fetchApi<{ beneficiaries: Beneficiary[] }>('/payments/beneficiaries'),

    createBeneficiary: (data: CreateBeneficiaryDTO) =>
        fetchApi<{ success: boolean; beneficiary: Beneficiary }>('/payments/beneficiaries', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateBeneficiary: (id: string, data: UpdateBeneficiaryDTO) =>
        fetchApi<{ success: boolean; beneficiary: Beneficiary }>(`/payments/beneficiaries/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deleteBeneficiary: (id: string) =>
        fetchApi<{ success: boolean }>(`/payments/beneficiaries/${id}`, { method: 'DELETE' }),

    // Payments
    getPayments: (year: number, month: number) =>
        fetchApi<{ payments: Payment[] }>(`/payments/list/${year}/${month}`),

    getPaymentSummary: (year: number, month: number) =>
        fetchApi<{ summary: PaymentSummary }>(`/payments/summary/${year}/${month}`),

    createPayment: (data: CreatePaymentDTO) =>
        fetchApi<{ success: boolean; payment: Payment }>('/payments', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updatePayment: (id: string, data: UpdatePaymentDTO) =>
        fetchApi<{ success: boolean; payment: Payment }>(`/payments/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    updatePaymentStatus: (id: string, status: string, paymentDate?: string) =>
        fetchApi<{ success: boolean; payment: Payment }>(`/payments/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, payment_date: paymentDate }),
        }),

    deletePayment: (id: string) =>
        fetchApi<{ success: boolean }>(`/payments/${id}`, { method: 'DELETE' }),
};
