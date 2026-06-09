import express from 'express';
import supabase from '../config/supabase.js';
import { extractUser } from '../utils/changeLogger.js';

const router = express.Router();

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

const MONTH_COLS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function getClickUpConfig() {
    return {
        token: process.env.CLICKUP_API_TOKEN,
        teamId: process.env.CLICKUP_TEAM_ID || '20639716',
    };
}

async function cuFetch(path, params = {}) {
    const { token } = getClickUpConfig();
    const url = new URL(`${CLICKUP_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
        headers: { Authorization: token, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ClickUp API ${res.status}: ${text}`);
    }
    return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/clickup/spaces  — lista spaces del workspace
// ──────────────────────────────────────────────────────────────────────────────
router.get('/clickup/spaces', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });
        const data = await cuFetch(`/team/${TEAM_ID}/space`, { archived: false });
        res.json({ spaces: data.spaces || [] });
    } catch (err) {
        console.error('[profitability] spaces error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/clickup/lists/:spaceId  — folders + lists de un space
// ──────────────────────────────────────────────────────────────────────────────
router.get('/clickup/lists/:spaceId', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });
        const [foldersData, folderlessData] = await Promise.all([
            cuFetch(`/space/${req.params.spaceId}/folder`, { archived: false }),
            cuFetch(`/space/${req.params.spaceId}/list`, { archived: false }),
        ]);

        const lists = [];
        for (const folder of (foldersData.folders || [])) {
            for (const list of (folder.lists || [])) {
                lists.push({ id: list.id, name: list.name, folder: folder.name });
            }
        }
        for (const list of (folderlessData.lists || [])) {
            lists.push({ id: list.id, name: list.name, folder: null });
        }
        res.json({ lists });
    } catch (err) {
        console.error('[profitability] lists error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/clickup/members  — miembros del workspace
// ──────────────────────────────────────────────────────────────────────────────
router.get('/clickup/members', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });
        const data = await cuFetch(`/team/${TEAM_ID}`);
        res.json({ members: data.team?.members?.map(m => ({ id: m.user.id, username: m.user.username, email: m.user.email })) || [] });
    } catch (err) {
        console.error('[profitability] members error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/user-mappings  — mapeo usuario ClickUp → coste/hora
// ──────────────────────────────────────────────────────────────────────────────
router.get('/user-mappings', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('profitability_user_mappings')
            .select('*')
            .order('display_name');
        if (error) throw error;
        res.json({ mappings: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /profitability/user-mappings  — upsert mapping (superadmin)
// ──────────────────────────────────────────────────────────────────────────────
router.put('/user-mappings', async (req, res) => {
    const { userId } = extractUser(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });

    try {
        const { mappings } = req.body;
        if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings must be an array' });

        const { error } = await supabase
            .from('profitability_user_mappings')
            .upsert(mappings, { onConflict: 'clickup_user_id' });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/client-lists  — mapeo cliente Finance → list(s) ClickUp
// ──────────────────────────────────────────────────────────────────────────────
router.get('/client-lists', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('profitability_client_lists')
            .select('*, clients(name)');
        if (error) throw error;
        res.json({ client_lists: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /profitability/client-lists  — upsert (superadmin)
// ──────────────────────────────────────────────────────────────────────────────
router.put('/client-lists', async (req, res) => {
    const { userId } = extractUser(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });

    try {
        const { client_lists } = req.body;
        if (!Array.isArray(client_lists)) return res.status(400).json({ error: 'client_lists must be an array' });
        const { error } = await supabase
            .from('profitability_client_lists')
            .upsert(client_lists, { onConflict: 'client_id,clickup_list_id' });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/accounts/:year  — núcleo: rentabilidad por cuenta
// ──────────────────────────────────────────────────────────────────────────────
router.get('/accounts/:year', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });

        const year = parseInt(req.params.year);
        if (!year) return res.status(400).json({ error: 'Invalid year' });

        // 1. Fetch mappings and client-list assignments
        const [mappingsRes, clientListsRes, clientsRes] = await Promise.all([
            supabase.from('profitability_user_mappings').select('*'),
            supabase.from('profitability_client_lists').select('*, clients(id, name)'),
            supabase.from('clients').select('id, name'),
        ]);

        const userMappings = mappingsRes.data || [];     // clickup_user_id → cost_per_hour
        const clientListRows = clientListsRes.data || []; // client_id, clickup_list_id
        const clients = clientsRes.data || [];

        // 2. Get billing data for the year from billing matrix (fees cobrados)
        const { data: billingData } = await supabase
            .from('billing_details')
            .select('amount, fiscal_month, client_id, clients(id, name), monthly_billing!inner(fiscal_year)')
            .eq('monthly_billing.fiscal_year', year);

        // 3. For each client that has a ClickUp list mapping, fetch time entries
        const listIds = [...new Set(clientListRows.map(r => r.clickup_list_id))];

        // Build time range for the year
        const startTs = new Date(`${year}-01-01T00:00:00Z`).getTime();
        const endTs = new Date(`${year}-12-31T23:59:59Z`).getTime();

        // Fetch time entries per list (in parallel, chunked)
        const timeEntriesByList = {};
        await Promise.all(listIds.map(async (listId) => {
            try {
                let page = 0;
                let allEntries = [];
                while (true) {
                    const data = await cuFetch(`/list/${listId}/time_entries`, {
                        start_date: startTs,
                        end_date: endTs,
                        page,
                    });
                    const entries = data.data || [];
                    allEntries = allEntries.concat(entries);
                    if (entries.length < 100) break;
                    page++;
                    if (page > 20) break; // safety limit
                }
                timeEntriesByList[listId] = allEntries;
            } catch (e) {
                console.warn(`[profitability] list ${listId} time_entries error:`, e.message);
                timeEntriesByList[listId] = [];
            }
        }));

        // 4. Aggregate by client × month
        const userCostMap = {};
        userMappings.forEach(m => { userCostMap[String(m.clickup_user_id)] = Number(m.cost_per_hour || 0); });

        const clientMonthData = {}; // clientId → month(0-11) → { hours, labor_cost, members: {} }

        for (const clRow of clientListRows) {
            const clientId = clRow.client_id;
            const clientName = clRow.clients?.name || clientId;
            const entries = timeEntriesByList[clRow.clickup_list_id] || [];

            if (!clientMonthData[clientId]) {
                clientMonthData[clientId] = {
                    name: clientName,
                    months: Array.from({ length: 12 }, () => ({ hours: 0, labor_cost: 0, members: {} })),
                };
            }

            for (const entry of entries) {
                const ms = Number(entry.duration || 0);
                const hours = ms / 3_600_000;
                const entryDate = new Date(Number(entry.start));
                const month = entryDate.getMonth(); // 0-11
                const uid = String(entry.user?.id || '');
                const costPerHour = userCostMap[uid] || 0;
                const laborCost = hours * costPerHour;

                clientMonthData[clientId].months[month].hours += hours;
                clientMonthData[clientId].months[month].labor_cost += laborCost;

                if (uid) {
                    if (!clientMonthData[clientId].months[month].members[uid]) {
                        clientMonthData[clientId].months[month].members[uid] = {
                            name: entry.user?.username || uid,
                            hours: 0,
                            labor_cost: 0,
                        };
                    }
                    clientMonthData[clientId].months[month].members[uid].hours += hours;
                    clientMonthData[clientId].months[month].members[uid].labor_cost += laborCost;
                }
            }
        }

        // 5. Aggregate billing per client × month
        const billingByClientMonth = {}; // clientId → month(0-11) → amount
        (billingData || []).forEach(b => {
            const cid = b.client_id || b.clients?.id;
            if (!cid) return;
            const m = (b.fiscal_month || 1) - 1;
            if (!billingByClientMonth[cid]) billingByClientMonth[cid] = Array(12).fill(0);
            billingByClientMonth[cid][m] += Number(b.amount || 0);
        });

        // 6. Build result
        const result = Object.entries(clientMonthData).map(([clientId, cd]) => {
            const monthlyData = cd.months.map((m, idx) => {
                const revenue = billingByClientMonth[clientId]?.[idx] || 0;
                const labor_cost = m.labor_cost;
                const gross_profit = revenue - labor_cost;
                const margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : null;
                return {
                    month: idx,
                    hours: Math.round(m.hours * 100) / 100,
                    labor_cost: Math.round(labor_cost * 100) / 100,
                    revenue,
                    gross_profit: Math.round(gross_profit * 100) / 100,
                    margin_pct: margin_pct !== null ? Math.round(margin_pct * 10) / 10 : null,
                    members: Object.values(m.members).map(mb => ({
                        ...mb,
                        hours: Math.round(mb.hours * 100) / 100,
                        labor_cost: Math.round(mb.labor_cost * 100) / 100,
                    })),
                };
            });

            const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
            const totalLaborCost = monthlyData.reduce((s, m) => s + m.labor_cost, 0);
            const totalHours = monthlyData.reduce((s, m) => s + m.hours, 0);
            const totalProfit = totalRevenue - totalLaborCost;
            const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

            return {
                client_id: clientId,
                client_name: cd.name,
                total_revenue: Math.round(totalRevenue * 100) / 100,
                total_labor_cost: Math.round(totalLaborCost * 100) / 100,
                total_hours: Math.round(totalHours * 100) / 100,
                total_profit: Math.round(totalProfit * 100) / 100,
                total_margin_pct: totalMargin !== null ? Math.round(totalMargin * 10) / 10 : null,
                monthly: monthlyData,
            };
        });

        // Sort by margin ascending (worst first)
        result.sort((a, b) => (a.total_margin_pct ?? 999) - (b.total_margin_pct ?? 999));

        res.json({ year, accounts: result });
    } catch (err) {
        console.error('[profitability] accounts error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
