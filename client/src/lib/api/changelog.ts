import { fetchApi } from './client';

export type ChangeOperation = 'create' | 'update' | 'delete';

export interface ChangeEntry {
    id: string;
    module_name: string;
    table_name: string;
    record_id: string | null;
    record_label: string | null;
    operation: ChangeOperation;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    changed_by_id: string | null;
    changed_by_email: string | null;
    changed_at: string;
}

export interface ChangeLogResponse {
    changes: ChangeEntry[];
    total: number;
}

export const changelogApi = {
    getChanges: (params: { module?: string; record_id?: string; limit?: number; offset?: number } = {}) => {
        const qs = new URLSearchParams();
        if (params.module)    qs.set('module',    params.module);
        if (params.record_id) qs.set('record_id', params.record_id);
        if (params.limit)     qs.set('limit',     String(params.limit));
        if (params.offset)    qs.set('offset',    String(params.offset));
        const query = qs.toString() ? `?${qs.toString()}` : '';
        return fetchApi<ChangeLogResponse>(`/changelog${query}`);
    },
};
