import { fetchApi } from './client';

export interface PlatformInvestment {
    platform_id: string;
    platform_name: string;
    platform_code: string;
    actual_amount: number;
}

export interface ClientInvestment {
    client_id: string;
    client_name: string;
    planned_investment: number; // Global Planned
    total_actual: number;
    completion_percentage: number;
    platforms: PlatformInvestment[];
}

export interface MonthlyInvestmentResponse {
    investments: ClientInvestment[];
}

export const mediaApi = {
    getPlatforms: async () => {
        const data = await fetchApi<{ platforms: any[] }>('/media/platforms');
        return data.platforms;
    },

    getMonthlyInvestment: async (year: number, month: number): Promise<MonthlyInvestmentResponse> => {
        return fetchApi<MonthlyInvestmentResponse>(`/media/investment/${year}/${month}`);
    },

    updatePlannedInvestment: async (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
        amount: number
    }) => {
        return fetchApi('/media/planned', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    updatePlatformInvestment: async (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
        platform_id: string;
        amount: number
    }) => {
        return fetchApi('/media/platform', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    hideClient: async (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
    }) => {
        return fetchApi('/media/hide-client', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    getHiddenClients: async (year: number, month: number): Promise<{
        hidden: Array<{ id: string; name: string; hidden_from_yyyymm: number }>
    }> => {
        return fetchApi(`/media/hidden-clients/${year}/${month}`);
    },

    unhideClient: async (data: { client_id: string; fiscal_year: number; fiscal_month: number }) => {
        return fetchApi('/media/unhide-client', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};
