import { fetchApi } from './client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DunningBlockType =
    | 'header'
    | 'text'
    | 'cta'
    | 'invoice_table'
    | 'signature'
    | 'spacer';

export interface DunningBlock {
    id: string;
    type: DunningBlockType;
    props: Record<string, unknown>;
}

export interface DunningBank {
    name: string;
    url: string;
    color: string;
}

export interface DunningConfig {
    id: number;
    enabled: boolean;
    send_days: number[];          // 0=domingo … 6=sábado
    send_hour: number;
    send_minute: number;
    timezone: string;
    level_1_days_min: number;
    level_1_days_max: number;
    level_2_days_min: number;
    level_2_days_max: number;
    level_3_days_min: number;
    level_3_repeat_every_days: number;
    min_amount: number;
    excluded_contact_ids: string[];
    bcc_email: string | null;
    updated_at: string;
    // Fase 3: marca y bancos
    brand_logo_text: string;
    brand_primary_color: string;
    brand_secondary_color: string;
    signature_html: string;
    cta_stripe_label: string;
    cta_bank_prefix: string;
    status_label: string;
    banks: DunningBank[];
    // Fase 3.1: logo por URL + modo prueba dirigido
    brand_logo_url: string;
    show_logo: boolean;
    test_mode: boolean;
    test_mode_email: string | null;
    // Fase 2b: metadatos del cron
    last_cron_run_at: string | null;
    last_cron_status: string | null;
    last_cron_summary: Record<string, unknown> | null;
    last_sync_paid_at: string | null;
}

export interface DunningEmailOverride {
    contact_id: string;
    contact_name: string | null;
    override_email: string;
    note: string | null;
    created_at: string;
    updated_at: string;
}

export interface DunningTemplate {
    id: string;
    level: 1 | 2 | 3;
    name: string;
    subject: string;
    blocks: DunningBlock[];    // legacy
    active: boolean;
    created_at: string;
    updated_at: string;
    // Fase 3: diseño premium
    hero_title: string | null;
    hero_subtitle: string | null;
    intro_copy: string | null;
    outro_copy: string | null;
}

export interface OverdueInvoice {
    invoice_id: string;
    invoice_number: string;
    contact_id: string;
    contact_name: string;
    contact_email: string;
    amount: number;
    currency: string;
    invoice_date: number | null;
    due_date: number;
    days_overdue: number;
    suggested_level: 0 | 1 | 2 | 3;
    reminders_count: number;
    last_reminder_at: string | null;
    last_reminder_level: number | null;
    case_status: 'open' | 'paid' | 'cancelled';
}

export interface DunningCase {
    id: string;
    invoice_id: string;
    invoice_number: string | null;
    contact_id: string | null;
    contact_name: string | null;
    contact_email: string | null;
    amount: number | null;
    currency: string | null;
    invoice_date: string | null;
    due_date: string | null;
    status: 'open' | 'paid' | 'cancelled';
    first_reminder_at: string | null;
    last_reminder_at: string | null;
    last_reminder_level: number | null;
    reminders_count: number;
    paid_at: string | null;
    days_to_pay: number | null;
    created_at: string;
    updated_at: string;
}

export interface DunningReminder {
    id: string;
    case_id: string;
    invoice_id: string;
    level: 1 | 2 | 3;
    template_id: string | null;
    days_overdue: number;
    sent_at: string;
    sent_to: string;
    subject: string | null;
    body_html_snapshot: string | null;
    smtp_message_id: string | null;
    status: 'sent' | 'failed' | 'skipped';
    error_message: string | null;
    created_at: string;
}

export interface DunningStats {
    open_cases: number;
    paid_cases: number;
    total_reminders: number;
    avg_days_to_pay: number | null;
    reminders_by_level: Record<'1' | '2' | '3', number>;
}

export interface PlanItem {
    invoice: {
        id: string;
        invoice_number: string;
        contact_id: string;
        contact_name: string;
        contact_email: string;
        amount: number;
        currency: string;
        invoice_date: number | null;
        due_date: number;
    };
    days_overdue: number;
    level: 0 | 1 | 2 | 3;
    template_id: string | null;
    template_name: string | null;
    action: 'send' | 'skip';
    reason: string;
    has_email: boolean;
    // Enriquecido por preview-run: destino final y motivo de redirección si aplica.
    dest_email?: string;
    redirect_reason?: 'test_mode' | 'override' | null;
}

export interface PlanSummary {
    total: number;
    will_send: number;
    will_skip: number;
    blocked: number;
    by_level: Record<'1' | '2' | '3', number>;
}

export interface RunResult {
    invoice_id: string;
    invoice_number?: string;
    contact_name?: string;
    status: 'sent' | 'skipped' | 'failed' | 'would-send';
    level?: number;
    to?: string;
    original_to?: string;
    redirect_reason?: 'test_mode' | 'override' | null;
    reason?: string;
    error?: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const dunningApi = {
    getConfig: () => fetchApi<{ config: DunningConfig }>('/dunning/config'),

    updateConfig: (patch: Partial<DunningConfig>) =>
        fetchApi<{ config: DunningConfig }>('/dunning/config', {
            method: 'PUT',
            body: JSON.stringify(patch),
        }),

    listTemplates: (level?: 1 | 2 | 3) => {
        const qs = level ? `?level=${level}` : '';
        return fetchApi<{ templates: DunningTemplate[] }>(`/dunning/templates${qs}`);
    },

    updateTemplate: (id: string, patch: Partial<Pick<DunningTemplate, 'name' | 'subject' | 'blocks' | 'active'>>) =>
        fetchApi<{ template: DunningTemplate }>(`/dunning/templates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(patch),
        }),

    preview: (payload: { blocks: DunningBlock[]; subject: string; vars?: Record<string, unknown> }) =>
        fetchApi<{ subject: string; html: string; sample_vars: Record<string, unknown> }>('/dunning/preview', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    previewV2: (payload: {
        template?: Partial<DunningTemplate>;
        config?: Partial<DunningConfig>;
        template_id?: string;
        level?: 1 | 2 | 3;
        invoice?: Record<string, unknown>;
    }) =>
        fetchApi<{ subject: string; html: string; sample_invoice: Record<string, unknown> }>('/dunning/preview-v2', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    listOverdueInvoices: () =>
        fetchApi<{ invoices: OverdueInvoice[]; total_count: number }>('/dunning/overdue-invoices'),

    listCases: (status?: 'open' | 'paid' | 'cancelled') => {
        const qs = status ? `?status=${status}` : '';
        return fetchApi<{ cases: DunningCase[] }>(`/dunning/cases${qs}`);
    },

    getCase: (id: string) =>
        fetchApi<{ case: DunningCase; reminders: DunningReminder[] }>(`/dunning/cases/${id}`),

    getStats: () => fetchApi<DunningStats>('/dunning/stats'),

    previewRun: () =>
        fetchApi<{
            plan: PlanItem[];
            summary: PlanSummary;
            config_enabled: boolean;
            test_mode: boolean;
            test_mode_email: string | null;
        }>('/dunning/preview-run', { method: 'POST' }),

    testSend: (payload: { template_id: string; to_email: string; sample?: Record<string, unknown> }) =>
        fetchApi<{ success: boolean; message_id: string; to: string }>('/dunning/test-send', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    run: (payload: { dry_run?: boolean; force?: boolean } = {}) =>
        fetchApi<{ dry_run: boolean; summary: PlanSummary; executed: RunResult[] }>('/dunning/run', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    syncPaid: () =>
        fetchApi<{ checked: number; closed: number }>('/dunning/sync-paid', {
            method: 'POST',
        }),

    listOverrides: () =>
        fetchApi<{ overrides: DunningEmailOverride[] }>('/dunning/overrides'),

    upsertOverride: (contact_id: string, payload: { override_email: string; contact_name?: string; note?: string }) =>
        fetchApi<{ override: DunningEmailOverride }>(`/dunning/overrides/${encodeURIComponent(contact_id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        }),

    deleteOverride: (contact_id: string) =>
        fetchApi<{ success: boolean }>(`/dunning/overrides/${encodeURIComponent(contact_id)}`, {
            method: 'DELETE',
        }),

    resetTestData: () =>
        fetchApi<{ success: boolean; reminders_deleted: number; cases_deleted: number }>('/dunning/reset-test-data', {
            method: 'POST',
        }),
};
