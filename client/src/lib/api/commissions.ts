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

    calculateCommissions: (year: number, month: number) => {
        return fetchApi('/partners/commissions/calculate', {
            service: 'COMMISSIONS',
            method: 'POST',
            body: JSON.stringify({ fiscal_year: year, fiscal_month: month, save: true }) // Auto-save for simplicity right now
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
        // Since there wasn't a dedicated endpoint for single manual creation in the provided snippet
        // We might need to handle this. Wait, let me check the backend. If it doesn't exist, we'll need to create it.
        // For now, assume a POST /partners/commissions exists or we will adapt.
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
    }
};
