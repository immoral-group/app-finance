import { fetchApi } from './client';

export interface ImsalesService {
    id: string;
    name: string;
    code: string;
}

export interface ImsalesClientBilling {
    client_id: string;
    client_name: string;
    billing_id: string | null;
    services: Record<string, number>;
    total: number;
}

export interface ImsalesBillingResponse {
    investments: ImsalesClientBilling[];
    services: ImsalesService[];
}

export const imsalesApi = {
    getServices: async (): Promise<ImsalesService[]> => {
        const data = await fetchApi<{ services: ImsalesService[] }>('/imsales/services');
        return data.services;
    },

    getBilling: async (year: number, month: number): Promise<ImsalesBillingResponse> => {
        return fetchApi<ImsalesBillingResponse>(`/imsales/billing/${year}/${month}`);
    },

    saveBilling: async (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
        service_id: string;
        amount: number;
    }) => {
        return fetchApi('/imsales/billing/save', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    hideClient: async (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
    }) => {
        return fetchApi('/imsales/hide-client', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    getHiddenClients: async (year: number, month: number): Promise<{
        hidden: Array<{ id: string; name: string; hidden_from_yyyymm: number }>
    }> => {
        return fetchApi(`/imsales/hidden-clients/${year}/${month}`);
    },

    unhideClient: async (data: { client_id: string; fiscal_year: number; fiscal_month: number }) => {
        return fetchApi('/imsales/unhide-client', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};
