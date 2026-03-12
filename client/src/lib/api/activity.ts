import { fetchApi } from './client';

export interface ActivityLog {
    id: string;
    user_id: string;
    action: string;
    ip_address: string | null;
    user_agent: string | null;
    page_path: string | null;
    created_at: string;
}

export interface UserActivity {
    id: string;
    display_name: string;
    email: string;
    role: string;
    is_active: boolean;
    created_at: string;
    access_count: number;
}

export type ActivityRange = 'week' | 'month' | 'year';

export const activityApi = {
    logActivity: (user_id: string, action: string = 'login', page_path?: string) => {
        return fetchApi<{ log: ActivityLog }>('/users/activity/log', {
            method: 'POST',
            body: JSON.stringify({ user_id, action, page_path }),
        });
    },

    getUserActivity: (userId: string, range: ActivityRange = 'week') => {
        return fetchApi<{ logs: ActivityLog[] }>(`/users/activity/${userId}?range=${range}`);
    },

    getAllActivity: (range: ActivityRange = 'week') => {
        return fetchApi<{ users: UserActivity[]; total_logs: number; logs: ActivityLog[] }>(`/users/activity?range=${range}`);
    },
};
