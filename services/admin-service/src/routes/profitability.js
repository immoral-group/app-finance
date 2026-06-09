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
// GET /profitability/auto-mapping/:year
// Devuelve qué usuarios ClickUp se han identificado automáticamente con un
// empleado de Finance, y cuál es el coste/hora calculado.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/auto-mapping/:year', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });

        const year = parseInt(req.params.year);
        const [{ personByName, deptAvg }, teamData, overridesRes] = await Promise.all([
            computeRealCostPerPerson(year),
            cuFetch(`/team/${TEAM_ID}`),
            supabase.from('profitability_user_mappings').select('*'),
        ]);

        const members = teamData.team?.members || [];
        const overrideByUid = {};
        (overridesRes.data || []).forEach(o => { overrideByUid[String(o.clickup_user_id)] = Number(o.cost_per_hour || 0); });

        const mappings = members.map(m => {
            const uid = String(m.user.id);
            const username = m.user.username || '';
            const override = overrideByUid[uid];
            const match = matchClickUpUser(username, personByName);

            let cost_per_hour = 0;
            let source = 'unmatched';
            let matched_employee = null;
            let department = null;

            if (override !== undefined && override > 0) {
                cost_per_hour = override;
                source = 'override';
            } else if (match && match.cost_per_hour > 0) {
                cost_per_hour = match.cost_per_hour;
                source = 'matched';
                matched_employee = match.canonical;
                department = match.dept;
            }

            return {
                clickup_user_id: uid,
                clickup_username: username,
                email: m.user.email,
                matched_employee,
                department,
                cost_per_hour: Math.round(cost_per_hour * 100) / 100,
                source,
            };
        });

        res.json({
            year,
            mappings,
            dept_averages: Object.fromEntries(
                Object.entries(deptAvg).map(([k, v]) => [k, Math.round(v * 100) / 100])
            ),
        });
    } catch (err) {
        console.error('[profitability] auto-mapping error:', err);
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
// Helper: calcular coste/hora REAL por persona desde actual_expenses
// Devuelve: { personByName: { 'Alba': { cost_per_hour, dept } }, deptAvg: { Immedia: 35.5, ... } }
// ──────────────────────────────────────────────────────────────────────────────
async function computeRealCostPerPerson(year) {
    const HOURS_PER_PERSON_MONTH = 160;
    const PERSONAL_ITEMS = {
        Immedia: ['Alba', 'Andrés', 'Leidy'],
        Imcontent: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'],
        Immoralia: ['David', 'Manel', 'Julian'],
    };

    // 1. departments id → name
    const { data: departments } = await supabase.from('departments').select('id, name');
    const deptIdMap = {};
    (departments || []).forEach(d => { deptIdMap[d.id] = d.name; });

    // 2. custom personal rows (e.g. new employees added later)
    const { data: customRows } = await supabase
        .from('pl_custom_rows')
        .select('dept, item_name')
        .eq('fiscal_year', year)
        .eq('block_type', 'expense')
        .eq('section_key', 'personal');

    // Build full per-dept name list
    const deptToNames = {};
    Object.entries(PERSONAL_ITEMS).forEach(([dept, names]) => {
        deptToNames[dept] = [...names];
    });
    (customRows || []).forEach(cr => {
        if (!deptToNames[cr.dept]) deptToNames[cr.dept] = [];
        if (!deptToNames[cr.dept].includes(cr.item_name)) deptToNames[cr.dept].push(cr.item_name);
    });

    // Reverse: name → dept (lowercase for matching)
    const nameToDept = {};
    Object.entries(deptToNames).forEach(([dept, names]) => {
        names.forEach(n => { nameToDept[n.toLowerCase()] = { canonical: n, dept }; });
    });

    // 3. Fetch personal expenses for the year
    const { data: expenses } = await supabase
        .from('actual_expenses')
        .select('amount, fiscal_month, department_id, description, category:expense_categories(name)')
        .eq('fiscal_year', year);

    // 4. Sum expense per person across the year
    // We treat any expense row where: section is 'personal' OR the category name matches a known personal name → as that person's salary
    const personYearly = {}; // canonicalName → { cost, dept, months_active }
    const personMonths = {}; // canonicalName → Set<monthIdx> where cost > 0

    (expenses || []).forEach(exp => {
        const deptName = deptIdMap[exp.department_id];
        const catName = exp.category?.name || '';
        const isPersonal = exp.description === 'personal';
        const lookup = nameToDept[catName.toLowerCase()];

        if (!lookup) return; // not a known person
        // require dept matches (avoid Imcontent's "Bruno" expense leaking into Immedia)
        if (deptName && deptName !== lookup.dept) return;

        const amount = Number(exp.amount || 0);
        if (amount <= 0) return;

        if (!personYearly[lookup.canonical]) {
            personYearly[lookup.canonical] = { cost: 0, dept: lookup.dept };
            personMonths[lookup.canonical] = new Set();
        }
        personYearly[lookup.canonical].cost += amount;
        personMonths[lookup.canonical].add(exp.fiscal_month - 1);
    });

    // 5. cost_per_hour = total cost / (160 * months_active)
    const personByName = {};
    Object.entries(personYearly).forEach(([name, info]) => {
        const monthsActive = personMonths[name].size || 1;
        const totalHours = HOURS_PER_PERSON_MONTH * monthsActive;
        personByName[name.toLowerCase()] = {
            canonical: name,
            dept: info.dept,
            cost_per_hour: totalHours > 0 ? info.cost / totalHours : 0,
            yearly_cost: info.cost,
        };
    });

    // 6. Department average (fallback for non-matched ClickUp users)
    const deptAvg = {};
    Object.entries(deptToNames).forEach(([dept]) => {
        const people = Object.values(personByName).filter(p => p.dept === dept);
        if (people.length === 0) {
            deptAvg[dept] = 0;
            return;
        }
        const avg = people.reduce((s, p) => s + p.cost_per_hour, 0) / people.length;
        deptAvg[dept] = avg;
    });

    return { personByName, deptAvg, deptToNames };
}

// Match ClickUp username → empleado Finance por nombre (token primero, fuzzy)
function matchClickUpUser(clickupName, personByName) {
    if (!clickupName) return null;
    const lower = clickupName.toLowerCase().trim();

    // Exact match on full name
    if (personByName[lower]) return personByName[lower];

    // Token match (first name or any token)
    const tokens = lower.split(/[\s._-]+/).filter(Boolean);
    for (const tk of tokens) {
        if (personByName[tk]) return personByName[tk];
    }

    // Substring match
    for (const [key, val] of Object.entries(personByName)) {
        if (lower.includes(key) || key.includes(tokens[0] || '')) return val;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/accounts/:year  — núcleo: rentabilidad por cuenta
// ──────────────────────────────────────────────────────────────────────────────
router.get('/accounts/:year', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });

        const year = parseInt(req.params.year);
        if (!year) return res.status(400).json({ error: 'Invalid year' });

        // 1. Configuración (solo client-lists) + overrides manuales opcionales
        const [overridesRes, clientListsRes] = await Promise.all([
            supabase.from('profitability_user_mappings').select('*'),
            supabase.from('profitability_client_lists').select('*, clients(id, name)'),
        ]);

        const manualOverrides = overridesRes.data || [];
        const clientListRows = clientListsRes.data || [];

        // 2. Auto-calcular coste/hora real desde actual_expenses
        const { personByName, deptAvg } = await computeRealCostPerPerson(year);

        // 3. Billing data
        const { data: billingData } = await supabase
            .from('billing_details')
            .select('amount, client_id, clients(id, name), monthly_billing!inner(fiscal_year, fiscal_month)')
            .eq('monthly_billing.fiscal_year', year);

        // 4. Time entries por lista
        const listIds = [...new Set(clientListRows.map(r => r.clickup_list_id))];
        const startTs = new Date(`${year}-01-01T00:00:00Z`).getTime();
        const endTs = new Date(`${year}-12-31T23:59:59Z`).getTime();

        const timeEntriesByList = {};
        await Promise.all(listIds.map(async (listId) => {
            try {
                let page = 0;
                let allEntries = [];
                while (true) {
                    const data = await cuFetch(`/list/${listId}/time_entries`, {
                        start_date: startTs, end_date: endTs, page,
                    });
                    const entries = data.data || [];
                    allEntries = allEntries.concat(entries);
                    if (entries.length < 100) break;
                    page++;
                    if (page > 20) break;
                }
                timeEntriesByList[listId] = allEntries;
            } catch (e) {
                console.warn(`[profitability] list ${listId} time_entries error:`, e.message);
                timeEntriesByList[listId] = [];
            }
        }));

        // 5. Overrides manuales por clickup_user_id
        const overrideByUid = {};
        manualOverrides.forEach(o => { overrideByUid[String(o.clickup_user_id)] = Number(o.cost_per_hour || 0); });

        // Helper: resolver coste/hora de un ClickUp user
        const resolveCost = (uid, username) => {
            // 1) Override manual
            if (overrideByUid[uid] !== undefined && overrideByUid[uid] > 0) {
                return { cost: overrideByUid[uid], source: 'override' };
            }
            // 2) Match por nombre con empleado Finance
            const match = matchClickUpUser(username, personByName);
            if (match && match.cost_per_hour > 0) {
                return { cost: match.cost_per_hour, source: 'matched', dept: match.dept };
            }
            // 3) Sin match → 0
            return { cost: 0, source: 'unmatched' };
        };

        // 6. Aggregate por cliente × mes
        const clientMonthData = {};

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
                const month = entryDate.getMonth();
                const uid = String(entry.user?.id || '');
                const username = entry.user?.username || '';
                const { cost: costPerHour, source } = resolveCost(uid, username);
                const laborCost = hours * costPerHour;

                clientMonthData[clientId].months[month].hours += hours;
                clientMonthData[clientId].months[month].labor_cost += laborCost;

                if (uid) {
                    if (!clientMonthData[clientId].months[month].members[uid]) {
                        clientMonthData[clientId].months[month].members[uid] = {
                            name: username || uid,
                            hours: 0,
                            labor_cost: 0,
                            cost_per_hour: costPerHour,
                            source,
                        };
                    }
                    clientMonthData[clientId].months[month].members[uid].hours += hours;
                    clientMonthData[clientId].months[month].members[uid].labor_cost += laborCost;
                }
            }
        }

        // 7. Billing por cliente × mes
        const billingByClientMonth = {};
        (billingData || []).forEach(b => {
            const cid = b.client_id || b.clients?.id;
            if (!cid) return;
            const m = (b.monthly_billing?.fiscal_month || 1) - 1;
            if (!billingByClientMonth[cid]) billingByClientMonth[cid] = Array(12).fill(0);
            billingByClientMonth[cid][m] += Number(b.amount || 0);
        });

        // 8. Construcción del resultado
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
                        cost_per_hour: Math.round(mb.cost_per_hour * 100) / 100,
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
