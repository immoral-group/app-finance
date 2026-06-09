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

// Strip diacritics so "andrés" and "andres" match
function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Fetch ALL time entries from a workspace, paginating in 30-day windows.
// Do NOT pass `assignee` — with a personal admin token ClickUp returns all
// members' entries without it; passing assignee triggers a 403 (TIMEENTRY_059).
async function fetchAllWorkspaceTimeEntries(teamId, year) {
    const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
    const yearEnd   = new Date(`${year}-12-31T23:59:59Z`).getTime();

    const all = [];
    const WINDOW_MS = 30 * 24 * 3600 * 1000;
    for (let ws = yearStart; ws <= yearEnd; ws += WINDOW_MS) {
        const we = Math.min(ws + WINDOW_MS - 1, yearEnd);
        const data = await cuFetch(`/team/${teamId}/time_entries`, {
            start_date: ws,
            end_date: we,
        });
        all.push(...(data.data || []));
    }
    return all;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /profitability/clickup/status  — health check de la conexión a ClickUp
// ──────────────────────────────────────────────────────────────────────────────
router.get('/clickup/status', async (req, res) => {
    try {
        const { token, teamId } = getClickUpConfig();
        if (!token) {
            return res.json({ connected: false, error: 'CLICKUP_API_TOKEN not configured' });
        }
        const data = await cuFetch(`/team/${teamId}`);
        const team = data.team || {};
        res.json({
            connected: true,
            team_id: team.id,
            team_name: team.name,
            member_count: team.members?.length || 0,
        });
    } catch (err) {
        res.json({ connected: false, error: err.message });
    }
});

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
// GET /profitability/clickup/lists-with-time/:year
// Devuelve TODAS las listas del workspace que tienen tiempo registrado en el año.
// (Esto es lo que alimenta los dashboards de ClickUp por cliente)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/clickup/lists-with-time/:year', async (req, res) => {
    try {
        const { token: CLICKUP_TOKEN, teamId: TEAM_ID } = getClickUpConfig();
        if (!CLICKUP_TOKEN) return res.status(503).json({ error: 'CLICKUP_API_TOKEN not configured' });

        const year = parseInt(req.params.year);
        // Workspace-level time entries: todos los assignees, paginado por mes
        const entries = await fetchAllWorkspaceTimeEntries(TEAM_ID, year);

        // Agrupar por list_id
        const listMap = {};
        for (const e of entries) {
            const listId = e.task_location?.list_id || e.task?.list?.id;
            const listName = e.task_location?.list_name || e.task?.list?.name || 'Sin lista';
            const spaceName = e.task_location?.space_name || e.task?.space?.name || '';
            const folderName = e.task_location?.folder_name || e.task?.folder?.name || '';
            if (!listId) continue;

            if (!listMap[listId]) {
                listMap[listId] = {
                    id: listId,
                    name: listName,
                    space: spaceName,
                    folder: folderName === 'hidden' ? null : folderName,
                    total_hours: 0,
                    entry_count: 0,
                };
            }
            listMap[listId].total_hours += Number(e.duration || 0) / 3_600_000;
            listMap[listId].entry_count++;
        }

        const lists = Object.values(listMap)
            .map(l => ({ ...l, total_hours: Math.round(l.total_hours * 10) / 10 }))
            .sort((a, b) => b.total_hours - a.total_hours);

        res.json({ year, lists, total_entries: entries.length });
    } catch (err) {
        console.error('[profitability] lists-with-time error:', err);
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
            let yearly_cost = null;
            let months_active = null;
            let formula = null;

            if (override !== undefined && override > 0) {
                cost_per_hour = override;
                source = 'override';
                formula = `Override manual: ${override.toFixed(2)} €/h`;
                if (match) {
                    matched_employee = match.canonical;
                    department = match.dept;
                }
            } else if (match && match.cost_per_hour > 0) {
                cost_per_hour = match.cost_per_hour;
                source = 'matched';
                matched_employee = match.canonical;
                department = match.dept;
                yearly_cost = Math.round(match.yearly_cost * 100) / 100;
                months_active = match.months_active;
                formula = `${yearly_cost.toLocaleString('es-ES')} € ÷ (160h × ${months_active} meses) = ${cost_per_hour.toFixed(2)} €/h`;
            }

            return {
                clickup_user_id: uid,
                clickup_username: username,
                email: m.user.email,
                matched_employee,
                department,
                cost_per_hour: Math.round(cost_per_hour * 100) / 100,
                yearly_cost,
                months_active,
                formula,
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

        // Only keep rows with valid client_id
        const valid = client_lists.filter(r => r.client_id && r.clickup_list_id);

        // Delete all existing rows, then insert fresh — this respects deletions
        await supabase.from('profitability_client_lists').delete().not('id', 'is', null);

        if (valid.length > 0) {
            const toInsert = valid.map(r => ({
                client_id: r.client_id,
                clickup_list_id: r.clickup_list_id,
                clickup_list_name: r.clickup_list_name || null,
            }));
            const { error } = await supabase.from('profitability_client_lists').insert(toInsert);
            if (error) throw error;
        }

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
    // Use full names where there may be ambiguity (e.g. multiple "Andrés" in ClickUp)
    const PERSONAL_ITEMS = {
        Immedia: ['Alba', 'Andrés Barrios', 'Leidy'],
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

    // Reverse: normalized name → dept (no accents for matching)
    // For multi-word names (e.g. "Andrés Barrios"), also register the first-name alias
    // so that expense categories named "Andrés" still resolve correctly.
    const nameToDept = {};
    Object.entries(deptToNames).forEach(([dept, names]) => {
        names.forEach(n => {
            nameToDept[norm(n)] = { canonical: n, dept };
            const firstToken = norm(n).split(/\s+/)[0];
            if (firstToken && firstToken !== norm(n) && !nameToDept[firstToken]) {
                nameToDept[firstToken] = { canonical: n, dept };
            }
        });
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
        const lookup = nameToDept[norm(catName)];

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
        personByName[norm(name)] = {
            canonical: name,
            dept: info.dept,
            cost_per_hour: totalHours > 0 ? info.cost / totalHours : 0,
            yearly_cost: info.cost,
            months_active: monthsActive,
            hours_used: totalHours,
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

// Match ClickUp username → empleado Finance por nombre.
// Requiere que TODOS los tokens del nombre Finance aparezcan en el nombre ClickUp.
// Esto evita que "Andrés Peñuela" matchee con Finance "Andrés Barrios".
// Match ClickUp username → empleado Finance.
// Regla: cada token del nombre Finance debe coincidir (prefijo, en ambos
// sentidos) con algún token del username ClickUp. Así:
//   "Flor"           ←→ "Florencia López"     ✓ (florencia.startsWith('flor'))
//   "Grego"          ←→ "Gregory Y"           ✓
//   "Andrés Barrios" ←→ "Andres Barrios"      ✓ (acentos normalizados)
//   "Andrés Barrios" ←→ "Andres Peñuela"      ✗ (falta 'barrios')
//   "Alba"           ←→ "Andres Peñuela"      ✗
function matchClickUpUser(clickupName, personByName) {
    if (!clickupName) return null;
    const lower = norm(clickupName);
    const cuTokens = lower.split(/[\s._-]+/).filter(Boolean);

    if (personByName[lower]) return personByName[lower];

    let bestMatch = null;
    let bestScore = -1;

    for (const [key, val] of Object.entries(personByName)) {
        const keyTokens = key.split(/[\s._-]+/).filter(Boolean);
        if (keyTokens.length === 0) continue;

        const allMatch = keyTokens.every(kt =>
            cuTokens.some(ct => ct === kt || ct.startsWith(kt) || kt.startsWith(ct))
        );
        if (!allMatch) continue;

        // Score: nombres más específicos (más tokens) ganan
        const score = keyTokens.length * 100 + keyTokens.reduce((s, t) => s + t.length, 0);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = val;
        }
    }
    return bestMatch;
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

        // 3. Billing data — monthly_billing has client_id; billing_details are child rows
        const { data: mbRows } = await supabase
            .from('monthly_billing')
            .select('id, client_id, fiscal_month')
            .eq('fiscal_year', year);

        const mbIds = (mbRows || []).map(r => r.id);
        const mbIdToInfo = {};
        (mbRows || []).forEach(r => { mbIdToInfo[r.id] = { client_id: r.client_id, fiscal_month: r.fiscal_month }; });

        let billingDetails = [];
        if (mbIds.length > 0) {
            const { data: details } = await supabase
                .from('billing_details')
                .select('monthly_billing_id, amount')
                .in('monthly_billing_id', mbIds);
            billingDetails = details || [];
        }

        // 4. Time entries: workspace-wide, paginado por mes. Aislamos errores
        // de ClickUp para que el endpoint siga devolviendo el resto.
        let allEntries = [];
        let clickup_error = null;
        try {
            allEntries = await fetchAllWorkspaceTimeEntries(TEAM_ID, year);
            console.log(`[profitability] ClickUp returned ${allEntries.length} time entries for ${year}`);
        } catch (e) {
            clickup_error = e.message;
            console.error(`[profitability] ClickUp time entries fetch failed:`, e.message);
        }

        // Agrupar entries por list_id
        const timeEntriesByList = {};
        for (const e of allEntries) {
            const listId = e.task_location?.list_id || e.task?.list?.id;
            if (!listId) continue;
            if (!timeEntriesByList[listId]) timeEntriesByList[listId] = [];
            timeEntriesByList[listId].push(e);
        }

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
        for (const d of billingDetails) {
            const info = mbIdToInfo[d.monthly_billing_id];
            if (!info) continue;
            const cid = info.client_id;
            if (!cid) continue;
            const m = (info.fiscal_month || 1) - 1;
            if (!billingByClientMonth[cid]) billingByClientMonth[cid] = Array(12).fill(0);
            billingByClientMonth[cid][m] += Number(d.amount || 0);
        }

        // 8. Construcción del resultado
        const result = Object.entries(clientMonthData).map(([clientId, cd]) => {
            const monthlyData = cd.months.map((m, idx) => {
                const revenue = billingByClientMonth[clientId]?.[idx] || 0;
                const labor_cost = m.labor_cost;
                const gross_profit = revenue - labor_cost;
                // Solo calculamos margen si hay revenue Y hay horas registradas
                // (sin horas, "margen 100%" sería engañoso porque no sabemos el coste real)
                const margin_pct = (revenue > 0 && m.hours > 0)
                    ? (gross_profit / revenue) * 100
                    : null;
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

        res.json({ year, accounts: result, clickup_error });
    } catch (err) {
        console.error('[profitability] accounts error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
