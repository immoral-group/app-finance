import { fetchApi } from './client';

export interface BillingCalculation {
    total_investment: number;
    platform_count: number;
    suggested_fee_pct: number;
    suggested_platform_costs: number;
    calculated_fee_paid: number;
    immedia_total: number;
    imcontent_total: number;
    immoralia_total: number;
    grand_total: number;
}

export interface BillingRecord {
    id: string;
    client_id: string;
    client_name: string;
    fiscal_year: number;
    fiscal_month: number;
    total_ad_investment: number;
    fee_paid: number;
    immedia_total: number;
    imcontent_total: number;
    immoralia_total: number;
    grand_total: number;
    status: 'draft' | 'final';
}

export const adminApi = {
    // Billing
    calculateBilling: (data: {
        client_id: string;
        fiscal_year: number;
        fiscal_month: number;
        save: boolean
    }) => {
        return fetchApi<{ success: boolean; calculation: BillingCalculation }>(
            '/billing/calculate',
            { method: 'POST', body: JSON.stringify(data) }
        );
    },

    updateBilling: (id: string, data: Partial<BillingRecord>) => {
        return fetchApi(`/billing/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    getBillingMatrix: (year: number, month: number) => {
        return fetchApi<{ billing_records: BillingRecord[] }>(`/billing?year=${year}&month=${month}`);
    },

    getMatrix: (year: number, month: number) => {
        return fetchApi<{
            year: string;
            month: string;
            columns: any[];
            rows: any[];
        }>(`/billing/matrix?year=${year}&month=${month}`);
    },

    saveMatrixCell: (data: { year: number, month: number, client_id: string, field: string, value: any, service_id?: string, comment?: string, assigned_to?: string[] }) => {
        return fetchApi('/billing/matrix/save', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // Periods
    getPeriods: () => {
        return fetchApi('/periods');
    },

    // Expenses
    getExpenses: (year: number, month: number) => {
        return fetchApi<{ expenses: any[]; by_department: Record<string, number> }>(`/expenses?year=${year}&month=${month}`);
    },

    createExpense: (data: any) => {
        return fetchApi('/expenses', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    updateExpense: (id: string, data: any) => {
        return fetchApi(`/expenses/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    deleteExpense: (id: string) => {
        return fetchApi(`/expenses/${id}`, {
            method: 'DELETE',
        });
    },

    calculateProration: (data: any) => {
        return fetchApi('/expenses/prorate-calculate', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    executeProration: (data: any) => {
        return fetchApi('/expenses/prorate-execute', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    // P&L
    getPLSummary: (year: number) => {
        return fetchApi<{
            income: { budget: number[], real: number[] },
            expenses: { budget: number[], real: number[] },
            margin: { budget: number[], real: number[] },
            departments: Record<string, any>
        }>(`/pl/summary/${year}`);
    },

    // Fees
    getFeeTiers: (clientId: string) => {
        return fetchApi<{ tiers: any[] }>(`/fees/client/${clientId}`);
    },

    updateFeeTiers: (clientId: string, tiers: any[]) => {
        return fetchApi(`/fees/client/${clientId}`, {
            method: 'POST',
            body: JSON.stringify({ tiers })
        });
    },

    getPlatformCosts: () => {
        return fetchApi<{ rules: any[] }>('/fees/platform-costs');
    },

    // Clients
    getClients: () => {
        return fetchApi<{ clients: { id: string; name: string; fee_config?: any }[] }>('/clients');
    },

    // Billing Matrix Row Actions
    deleteMatrixRow: (year: number, month: number, client_id: string) => {
        return fetchApi(`/billing/matrix/row?year=${year}&month=${month}&client_id=${client_id}`, {
            method: 'DELETE'
        });
    },

    duplicateMatrixRow: (year: number, month: number, client_id: string) => {
        return fetchApi('/billing/matrix/row/duplicate', {
            method: 'POST',
            body: JSON.stringify({ year, month, client_id })
        });
    },

    // Payments
    getPayments: (year: number, month: number) => {
        return fetchApi<{ payments: any[] }>(`/payments/schedule/${year}/${month}`);
    },

    createPayment: (data: any) => {
        return fetchApi('/payments', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updatePaymentStatus: (id: string, status: string, date?: string) => {
        return fetchApi(`/payments/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, payment_date: date })
        });
    },

    // Dashboard
    getDashboardKPIs: (year: number) => {
        return fetchApi<{
            kpis: {
                totalBilling: number;
                totalExpenses: number;
                netMargin: number;
                marginPercentage: number;
            };
            departmentPerformance: any[];
            pendingPayments: any[];
            recentActivity: any[];
        }>(`/dashboard/kpis/${year}`);
    },

    // P&L Matrix
    getPLMatrix: (year: number, type: 'budget' | 'real' = 'budget') => {
        return fetchApi<{
            year: number;
            type: string;
            columns: string[];
            sections: any[];
        }>(`/pl/matrix/${year}?type=${type}`);
    },

    savePLMatrixCell: (data: {
        year: number;
        month: number;
        dept: string;
        item: string;
        section: string;
        section_key?: string;
        value: number;
        type: 'budget' | 'real';
        comment?: string;
        assigned_to?: string[];
    }) => {
        return fetchApi('/pl/matrix/save', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // P&L Cell Notes (dedicated note storage, works for all tabs)
    getPLNotes: (year: number) => {
        return fetchApi<{ notes: Record<string, { comment: string; assigned_to: string[] }> }>(
            `/pl/notes/${year}`
        );
    },

    savePLNote: (data: {
        year: number;
        view_type: 'real' | 'budget' | 'comparison' | 'dept-real' | 'dept-budget' | 'dept-comparison';
        section: string;
        dept: string;
        item: string;
        month: number;
        comment: string;
        assigned_to: string[];
    }) => {
        return fetchApi('/pl/notes/save', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updatePLNoteStatus: (data: { id: string; status: 'done' | 'deleted' }) => {
        return fetchApi('/pl/notes/status', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // Chat IA
    sendChatMessage: (data: {
        message: string;
        userRole: string;
        deptCode?: string | null;
        year?: number;
        history?: Array<{ role: string; content: string }>;
    }) => {
        return fetchApi<{ reply: string; intent: string; entity: string }>('/chat', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // Users & Permissions
    getMyProfile: () => {
        return fetchApi<{
            profile: {
                id: string;
                display_name: string;
                email: string;
                role: 'superadmin' | 'dept_head' | 'user' | 'partner';
                department_code: string | null;
                is_active: boolean;
            };
            permissions: {
                id: string;
                user_id: string;
                module: string;
                can_view: boolean;
                can_edit: boolean;
            }[];
        }>('/users/me');
    },

    getUsers: () => {
        return fetchApi<{ users: any[] }>('/users');
    },

    createUser: (data: {
        email: string;
        password: string;
        display_name: string;
        role: string;
        department_code?: string;
        partner_id?: string;
        permissions?: { module: string; can_view: boolean; can_edit: boolean }[];
    }) => {
        return fetchApi('/users', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updateUser: (id: string, data: {
        display_name?: string;
        role?: string;
        department_code?: string;
        partner_id?: string;
        is_active?: boolean;
        email?: string;
        password?: string;
        permissions?: { module: string; can_view: boolean; can_edit: boolean }[];
    }) => {
        return fetchApi(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    deleteUser: (id: string) => {
        return fetchApi(`/users/${id}`, { method: 'DELETE' });
    },

    // P&L Custom Rows
    getCustomRows: (year?: number) => {
        const query = year ? `?year=${year}` : '';
        return fetchApi<{ rows: { id: string; block_type: string; section_key: string; dept: string; item_name: string }[] }>(`/pl/custom-rows${query}`);
    },

    addCustomRow: (data: { block_type: 'revenue' | 'expense'; section_key: string; dept: string; item_name: string; fiscal_year?: number }) => {
        return fetchApi<{ success: boolean; row: any }>('/pl/custom-rows', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    deleteCustomRow: (id: string) => {
        return fetchApi(`/pl/custom-rows/${id}`, { method: 'DELETE' });
    },

    renameCustomRow: (id: string, item_name: string) => {
        return fetchApi(`/pl/custom-rows/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ item_name })
        });
    },

    // Cost Per Hour
    getCostPerHour: (year: number, dept: string) => {
        return fetchApi<{
            department: string;
            year: number;
            hours_per_person: number;
            months: string[];
            people_per_month: number[];
            people_names: string[];
            personal_cost_per_month: number[];
            cost_per_hour: number[];
            total_hours_per_month: number[];
            total_expenses_per_month: number[];
            group_cost_per_month: number[];
            cost_per_hour_real: number[];
            annual_summary: {
                max_people: number;
                total_hours: number;
                total_personal_cost: number;
                avg_cost_per_hour: number;
                total_expenses: number;
                avg_cost_per_hour_real: number;
            };
        }>(`/pl/cost-per-hour/${year}/${dept}`);
    },

    // Developers
    getApiKeys: () => {
        return fetchApi<{ keys: any[] }>('/developers/api-keys');
    },

    getApiScopes: () => {
        return fetchApi<{ scopes: { key: string; label: string; module: string }[] }>('/developers/scopes');
    },

    createApiKey: (data: { name: string; permissions: string[]; expires_at?: string; created_by?: string }) => {
        return fetchApi<{ success: boolean; key: any }>('/developers/api-keys', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updateApiKey: (id: string, data: { name?: string; permissions?: string[]; is_active?: boolean }) => {
        return fetchApi('/developers/api-keys/' + id, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    deleteApiKey: (id: string) => {
        return fetchApi('/developers/api-keys/' + id, { method: 'DELETE' });
    },

    getApiDocs: () => {
        return fetchApi<any>('/developers/docs');
    },

    // Holded Integration
    getHoldedStatus: () => fetchApi<{ connected: boolean; error?: string }>('/integrations/holded/status'),
    getHoldedInvoices: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return fetchApi<{ invoices: any[] }>(`/integrations/holded/invoices${qs}`);
    },
    getHoldedInvoice: (id: string) => fetchApi<any>(`/integrations/holded/invoices/${id}`),
    getHoldedContacts: () => fetchApi<{ contacts: any[] }>('/integrations/holded/contacts'),
    getHoldedTreasury: () => fetchApi<{ accounts: any[] }>('/integrations/holded/treasury'),
    getHoldedSummary: () => fetchApi<{
        connected: boolean;
        invoices_pending?: { count: number; total: number };
        invoices_overdue?: { count: number; total: number };
        invoices_estimado?: { count: number; total: number };
        treasury_balance?: number;
    }>('/integrations/holded/summary'),

    // Desglose de servicios para un cliente en un mes (modal de detalle)
    getClientMonthDetail: (year: number, month: number, client_id: string) =>
        fetchApi<{
            fee_paid: number;
            investment: number;
            fee_pct: number;
            services: { service_name: string; department: string; department_code: string; amount: number }[];
            total: number;
        }>(`/billing/client-month-detail?year=${year}&month=${month}&client_id=${client_id}`),

    // Annual Client Billing Summary (nuevo módulo — sin filtro de ocultos)
    getAnnualClientSummary: (year: number) =>
        fetchApi<{
            year: number;
            clients: {
                client_id: string;
                client_name: string;
                vertical: string;
                months: number[];
                annual: number;
            }[];
        }>(`/billing/annual-client-summary?year=${year}`),

    // Ocultar / reactivar filas de clientes en Billing Matrix
    getHiddenClients: (year: number, month: number) =>
        fetchApi<{ hidden: Array<{ id: string; name: string; hidden_from_yyyymm: number }> }>(
            `/billing/hidden-clients?year=${year}&month=${month}`
        ),
    hideClient: (data: { client_id: string; fiscal_year: number; fiscal_month: number }) =>
        fetchApi('/billing/hide-client', { method: 'POST', body: JSON.stringify(data) }),
    unhideClient: (data: { client_id: string; fiscal_year: number; fiscal_month: number }) =>
        fetchApi('/billing/unhide-client', { method: 'POST', body: JSON.stringify(data) }),

    // ── Budget Requests ───────────────────────────────────────────────────────
    getBudgetRequests: (params: { year?: number; dept?: string; status?: string }) => {
        const q = new URLSearchParams();
        if (params.year) q.set('year', String(params.year));
        if (params.dept) q.set('dept', params.dept);
        if (params.status) q.set('status', params.status);
        return fetchApi<{ requests: BudgetRequest[] }>(`/budget-requests?${q}`);
    },
    createBudgetRequest: (data: Omit<BudgetRequest, 'id' | 'status' | 'created_at' | 'updated_at'>) =>
        fetchApi<{ request: BudgetRequest }>('/budget-requests', { method: 'POST', body: JSON.stringify(data) }),
    createBudgetRequestsBulk: (data: { requests: Partial<BudgetRequest>[]; requested_by?: string; requested_by_email?: string }) =>
        fetchApi<{ requests: BudgetRequest[]; count: number }>('/budget-requests/bulk', { method: 'POST', body: JSON.stringify(data) }),
    approveBudgetRequest: (id: string, data: { reviewed_by?: string; reviewed_by_email?: string; review_notes?: string }) =>
        fetchApi(`/budget-requests/${id}/approve`, { method: 'PATCH', body: JSON.stringify(data) }),
    rejectBudgetRequest: (id: string, data: { reviewed_by?: string; reviewed_by_email?: string; review_notes?: string }) =>
        fetchApi(`/budget-requests/${id}/reject`, { method: 'PATCH', body: JSON.stringify(data) }),
    approveDeptBudgetRequests: (data: { fiscal_year: number; dept: string; reviewed_by?: string; reviewed_by_email?: string }) =>
        fetchApi<{ ok: boolean; approved: number }>('/budget-requests/approve-dept', { method: 'PATCH', body: JSON.stringify(data) }),
    deleteBudgetRequest: (id: string) =>
        fetchApi(`/budget-requests/${id}`, { method: 'DELETE' }),
};

export interface BudgetRequest {
    id: string;
    fiscal_year: number;
    dept: string;
    section: string;
    category: string;
    item: string;
    month_idx: number;
    current_value: number;
    requested_value: number;
    reason?: string;
    status: 'pending' | 'approved' | 'rejected';
    requested_by?: string;
    requested_by_email?: string;
    reviewed_by?: string;
    reviewed_by_email?: string;
    review_notes?: string;
    created_at: string;
    updated_at: string;
}
