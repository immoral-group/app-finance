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
    getPLMatrix: (year: number, type: 'budget' | 'real' | 'estimated' = 'budget') => {
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
        type: 'budget' | 'real' | 'estimated';
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
        view_type: 'real' | 'budget' | 'comparison' | 'estimated' | 'dept-real' | 'dept-budget' | 'dept-comparison' | 'dept-estimated';
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

    // Forecast scenarios
    getForecastScenarios: (opts?: { dept?: string; scope?: 'forecast' | 'budget' }) => {
        const params = new URLSearchParams();
        if (opts?.dept) params.set('dept', opts.dept);
        if (opts?.scope) params.set('scope', opts.scope);
        const qs = params.toString() ? `?${params.toString()}` : '';
        return fetchApi<{ scenarios: any[] }>(`/pl/scenarios${qs}`);
    },
    saveForecastScenario: (data: { name: string; scenario: any; shared_with_depts?: string[]; scope?: 'forecast' | 'budget' }) => {
        return fetchApi<{ scenario: any }>(`/pl/scenarios`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    updateForecastScenario: (id: string, data: { name?: string; scenario?: any; shared_with_depts?: string[] }) => {
        return fetchApi(`/pl/scenarios/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },
    deleteForecastScenario: (id: string) => {
        return fetchApi(`/pl/scenarios/${id}`, {
            method: 'DELETE',
        });
    },
    shareForecastScenario: (id: string, data: { emails: string[]; message?: string }) => {
        return fetchApi<{ sent: number; total: number; invalid: number; link: string }>(
            `/pl/scenarios/${id}/share`,
            {
                method: 'POST',
                body: JSON.stringify(data),
            },
        );
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
    rejectDeptBudgetRequests: (data: { fiscal_year: number; dept: string; reviewed_by?: string; reviewed_by_email?: string; review_notes?: string }) =>
        fetchApi<{ ok: boolean; rejected: number }>('/budget-requests/reject-dept', { method: 'PATCH', body: JSON.stringify(data) }),
    deleteBudgetRequest: (id: string) =>
        fetchApi(`/budget-requests/${id}`, { method: 'DELETE' }),
    deleteAllDeptBudgetRequests: (data: { fiscal_year: number; dept: string }) =>
        fetchApi('/budget-requests/dept', { method: 'DELETE', body: JSON.stringify(data) }),

    // ── Nutfruit Budget ────────────────────────────────────────────────────────
    getNutfruitBudget: (year: number) =>
        fetchApi<{ rows: NutfruitRow[] }>(`/nutfruit/${year}`),
    saveNutfruitCell: (data: { year: number; row_id: string; month_idx: number; value: number }) =>
        fetchApi<{ success: boolean }>('/nutfruit/save', { method: 'POST', body: JSON.stringify(data) }),
    addNutfruitRow: (data: { year: number; item_name: string }) =>
        fetchApi<{ success: boolean; row: NutfruitRow }>('/nutfruit/rows', { method: 'POST', body: JSON.stringify(data) }),
    deleteNutfruitRow: (id: string) =>
        fetchApi<{ success: boolean }>(`/nutfruit/rows/${id}`, { method: 'DELETE' }),

    // ── ICEX Budget ────────────────────────────────────────────────────────────
    getIcexBudget: (year: number) =>
        fetchApi<{ rows: IcexRow[] }>(`/icex/${year}`),
    saveIcexCell: (data: { year: number; row_id: string; month_idx: number; value: number }) =>
        fetchApi<{ success: boolean }>('/icex/save', { method: 'POST', body: JSON.stringify(data) }),
    addIcexRow: (data: { year: number; item_name: string }) =>
        fetchApi<{ success: boolean; row: IcexRow }>('/icex/rows', { method: 'POST', body: JSON.stringify(data) }),
    deleteIcexRow: (id: string) =>
        fetchApi<{ success: boolean }>(`/icex/rows/${id}`, { method: 'DELETE' }),

    // ── Rentabilidad por Cuenta ────────────────────────────────────────────────
    getProfitabilityAccounts: (year: number) =>
        fetchApi<ProfitabilityResponse>(`/profitability/accounts/${year}`),
    getProfitabilityAutoMapping: (year: number) =>
        fetchApi<AutoMappingResponse>(`/profitability/auto-mapping/${year}`),
    getProfitabilityUserMappings: () =>
        fetchApi<{ mappings: UserMapping[] }>('/profitability/user-mappings'),
    saveProfitabilityUserMappings: (mappings: Partial<UserMapping>[]) =>
        fetchApi<{ success: boolean }>('/profitability/user-mappings', { method: 'PUT', body: JSON.stringify({ mappings }) }),
    getProfitabilityAutoMatchClients: (year: number) =>
        fetchApi<{
            year: number;
            folders: ClickUpFolderWithTime[];
            targets: Array<{ id: string; name: string; space: string; total_hours: number; type: 'folder' | 'list'; sub: string }>;
            client_matches: Array<{
                client_id: string;
                client_name: string;
                configured: Array<{ id: string; name: string }>;
                suggested: { id: string; name: string; total_hours: number; score: number } | null;
            }>;
        }>(`/profitability/auto-match-clients/${year}`),
    getProfitabilityClientLists: () =>
        fetchApi<{ client_lists: ClientList[] }>('/profitability/client-lists'),
    saveProfitabilityClientLists: (client_lists: Partial<ClientList>[]) =>
        fetchApi<{ success: boolean }>('/profitability/client-lists', { method: 'PUT', body: JSON.stringify({ client_lists }) }),
    getClickUpSpaces: () =>
        fetchApi<{ spaces: ClickUpSpace[] }>('/profitability/clickup/spaces'),
    getClickUpLists: (spaceId: string) =>
        fetchApi<{ lists: ClickUpList[] }>(`/profitability/clickup/lists/${spaceId}`),
    getClickUpMembers: () =>
        fetchApi<{ members: ClickUpMember[] }>('/profitability/clickup/members'),
    getClickUpListsWithTime: (year: number) =>
        fetchApi<{ year: number; lists: ClickUpListWithTime[]; folders: ClickUpFolderWithTime[]; spaces: ClickUpSpaceWithTime[]; total_entries: number }>(`/profitability/clickup/lists-with-time/${year}`),
    getClickUpStatus: () =>
        fetchApi<{ connected: boolean; error?: string; team_id?: string; team_name?: string; member_count?: number }>('/profitability/clickup/status'),
    refreshClickUpCache: (year: number) =>
        fetchApi<{ ok: boolean; message: string }>('/profitability/clickup/refresh-cache', { method: 'POST', body: JSON.stringify({ year }) }),

    // Manual persons (personas cuyas horas se cargan manualmente)
    // Si se pasa year, el backend resuelve cost_per_hour desde P&L y devuelve
    // los campos resolved_* y formula para mostrar el cálculo real.
    getManualPersons: (year?: number) =>
        fetchApi<{ persons: ManualPerson[] }>(`/profitability/manual-persons${year ? `?year=${year}` : ''}`),
    createManualPerson: (data: { name: string; cost_per_hour: number; department?: string | null; notes?: string | null }) =>
        fetchApi<{ person: ManualPerson }>('/profitability/manual-persons', { method: 'POST', body: JSON.stringify(data) }),
    updateManualPerson: (id: string, data: Partial<{ name: string; cost_per_hour: number; department: string | null; notes: string | null }>) =>
        fetchApi<{ person: ManualPerson }>(`/profitability/manual-persons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteManualPerson: (id: string) =>
        fetchApi<{ ok: boolean }>(`/profitability/manual-persons/${id}`, { method: 'DELETE' }),

    // Manual hours (horas manuales por cliente, persona, año, mes)
    getManualHours: (params: { year?: number; client_id?: string } = {}) => {
        const qs = new URLSearchParams();
        if (params.year !== undefined) qs.set('year', String(params.year));
        if (params.client_id) qs.set('client_id', params.client_id);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return fetchApi<{ hours: ManualHourEntry[] }>(`/profitability/manual-hours${suffix}`);
    },
    upsertManualHours: (data: { client_id: string; manual_person_id: string; year: number; month: number; hours: number }) =>
        fetchApi<{ entry: ManualHourEntry }>('/profitability/manual-hours', { method: 'POST', body: JSON.stringify(data) }),
    deleteManualHours: (id: string) =>
        fetchApi<{ ok: boolean }>(`/profitability/manual-hours/${id}`, { method: 'DELETE' }),

    // Hidden items (genérico: client / clickup_user / manual_person)
    getHiddenItems: (scope?: HiddenScope) =>
        fetchApi<{ items: HiddenItem[] }>(`/profitability/hidden-items${scope ? `?scope=${scope}` : ''}`),
    hideItem: (scope: HiddenScope, ref_id: string) =>
        fetchApi<{ item: HiddenItem }>('/profitability/hidden-items', { method: 'POST', body: JSON.stringify({ scope, ref_id }) }),
    unhideItem: (scope: HiddenScope, ref_id: string) =>
        fetchApi<{ ok: boolean }>(`/profitability/hidden-items/${scope}/${encodeURIComponent(ref_id)}`, { method: 'DELETE' }),

    // ── Release notifications (envío de novedades por email a usuarios elegidos) ──
    listReleaseTemplates: () =>
        fetchApi<{ templates: { key: string; title: string; summary: string }[] }>(
            '/release-notifications/templates'
        ),
    previewReleaseTemplate: (key: string, previewUrl?: string) =>
        fetchApi<{
            subject: string;
            html: string;
            text: string;
            template: { key: string; title: string; summary: string };
        }>(`/release-notifications/preview/${encodeURIComponent(key)}${previewUrl ? `?previewUrl=${encodeURIComponent(previewUrl)}` : ''}`),
    sendReleaseNotification: (payload: { templateKey: string; to: string[]; previewUrl?: string }) =>
        fetchApi<{
            ok: boolean;
            sent: number;
            failed: number;
            results: { to: string; ok: boolean; messageId?: string; error?: string }[];
            template: { key: string; title: string; subject: string };
            sentBy: string;
        }>('/release-notifications/send', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    // Envía HTML ya renderizado por el cliente (para usar con builders del changelog).
    sendReleaseNotificationHtml: (payload: { subject: string; html: string; text?: string; to: string[] }) =>
        fetchApi<{
            ok: boolean;
            sent: number;
            failed: number;
            skippedInvalid: number;
            results: { to: string; ok: boolean; messageId?: string; error?: string }[];
            sentBy: string;
        }>('/release-notifications/send-html', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    diagnoseReleaseSmtp: (verify: boolean = false) =>
        fetchApi<{
            ok: boolean;
            verified?: boolean;
            reason?: string;
            error?: string;
            smtp_user_set: boolean;
            smtp_pass_set: boolean;
            smtp_host: string;
            smtp_port: number;
            smtp_from: string | null;
            app_url: string;
        }>(`/release-notifications/diagnose${verify ? '?verify=1' : ''}`),
};

export type HiddenScope = 'client' | 'clickup_user' | 'manual_person';
export interface HiddenItem {
    scope: HiddenScope;
    ref_id: string;
    hidden_at: string;
}

export interface IcexRow {
    id: string;
    fiscal_year: number;
    row_type: 'revenue' | 'expense';
    item_name: string;
    sort_order: number;
    is_fixed: boolean;
    jan: number; feb: number; mar: number; apr: number;
    may: number; jun: number; jul: number; aug: number;
    sep: number; oct: number; nov: number; dec: number;
}

export interface NutfruitRow {
    id: string;
    fiscal_year: number;
    row_type: 'revenue' | 'expense';
    item_name: string;
    sort_order: number;
    is_fixed: boolean;
    jan: number; feb: number; mar: number; apr: number;
    may: number; jun: number; jul: number; aug: number;
    sep: number; oct: number; nov: number; dec: number;
}

export interface UserMapping {
    id?: string;
    clickup_user_id: string;
    display_name: string;
    email?: string;
    cost_per_hour: number;
    department?: string;
}

export interface ClientList {
    id?: string;
    client_id: string;
    clickup_list_id: string;
    clickup_list_name?: string;
    clients?: { name: string };
}

export interface ClickUpSpace {
    id: string;
    name: string;
}

export interface ClickUpList {
    id: string;
    name: string;
    folder: string | null;
}

export interface ClickUpListWithTime {
    id: string;
    name: string;
    space: string;
    folder: string | null;
    total_hours: number;
    entry_count: number;
}

export interface ClickUpFolderWithTime {
    id: string;
    name: string;
    space: string;
    total_hours: number;
    entry_count: number;
    list_count: number;
}

export interface ClickUpSpaceWithTime {
    id: string;
    name: string;
    total_hours: number;
    entry_count: number;
}

export interface ClickUpMember {
    id: string;
    username: string;
    email: string;
}

export interface MonthlyProfitability {
    month: number;
    hours: number;
    labor_cost: number;
    revenue: number;
    gross_profit: number;
    margin_pct: number | null;
    members: ProfitabilityMember[];
}

export interface ProfitabilityMember {
    name: string;
    hours: number;
    labor_cost: number;
    cost_per_hour: number;
    source: string;
    manual_person_id?: string;
    manual_hours_id?: string;
}

export interface ManualPerson {
    id: string;
    name: string;
    cost_per_hour: number;
    department: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    // Campos resueltos sólo cuando GET /manual-persons se llama con ?year=
    resolved_source?: 'matched' | 'override' | 'unmatched';
    resolved_cost_per_hour?: number;
    matched_employee?: string;
    matched_department?: string;
    matched_yearly_cost?: number;
    matched_months_active?: number;
    formula?: string;
}

export interface ManualHourEntry {
    id: string;
    client_id: string;
    manual_person_id: string;
    year: number;
    month: number;
    hours: number;
    manual_person?: { id: string; name: string; cost_per_hour: number; department: string | null };
    client?: { id: string; name: string };
}

export interface AccountProfitability {
    client_id: string;
    client_name: string;
    total_revenue: number;
    total_labor_cost: number;
    total_hours: number;
    total_profit: number;
    total_margin_pct: number | null;
    monthly: MonthlyProfitability[];
}

export interface ProfitabilityResponse {
    year: number;
    accounts: AccountProfitability[];
    clickup_error?: string | null;
    debug?: {
        total_entries_fetched: number;
        configured_lists: number;
        entries_per_list: Record<string, number>;
        sample_entry: { user: string; list_id: string; list_name: string; duration_h: number } | null;
    };
}

export interface AutoMappingEntry {
    clickup_user_id: string;
    clickup_username: string;
    email: string;
    matched_employee: string | null;
    department: string | null;
    cost_per_hour: number;
    yearly_cost: number | null;
    months_active: number | null;
    formula: string | null;
    source: 'matched' | 'override' | 'unmatched';
}

export interface AutoMappingResponse {
    year: number;
    mappings: AutoMappingEntry[];
    dept_averages: Record<string, number>;
}

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
