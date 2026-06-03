import express from 'express';
import supabase from '../config/supabase.js';
import { createNotifications } from './notifications.js';
import { logChange, extractUser } from '../utils/changeLogger.js';

const router = express.Router();

// ================================================
// P&L NOTES — Universal note storage per cell
// ================================================

/**
 * GET /pl/notes/:year
 * Returns all notes for a year, keyed by "type-section-dept-item-month"
 */
router.get('/notes/:year', async (req, res) => {
    const { year } = req.params;
    try {
        const { data, error } = await supabase
            .from('pl_cell_notes')
            .select('*')
            .eq('fiscal_year', year)
            .in('status', ['active']); // Only return active notes

        if (error) throw error;

        // Index by composite key for fast frontend lookup
        const byKey = {};
        (data || []).forEach(n => {
            const key = `${n.view_type}-${n.section}-${n.dept}-${n.item}-${n.fiscal_month - 1}`;
            byKey[key] = {
                id: n.id,
                comment: n.comment,
                assigned_to: n.assigned_to || [],
                status: n.status
            };
        });

        res.json({ notes: byKey });
    } catch (err) {
        console.error('Error fetching PL notes:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /pl/notes/status
 * Change the status of a note (done | deleted)
 */
router.post('/notes/status', async (req, res) => {
    const { id, status } = req.body;

    if (!id || !status || !['done', 'deleted'].includes(status)) {
        return res.status(400).json({ error: 'id and valid status (done|deleted) required' });
    }

    try {
        const { error } = await supabase
            .from('pl_cell_notes')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating note status:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /pl/notes/save
 * Upsert a note for a specific cell
 */
router.post('/notes/save', async (req, res) => {
    const { year, view_type, section, dept, item, month, comment, assigned_to } = req.body;

    if (!year || !view_type || !section || !dept || !item || !month) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const noteData = {
            fiscal_year: parseInt(year),
            view_type,
            section,
            dept,
            item,
            fiscal_month: parseInt(month),
            comment: comment || null,
            assigned_to: assigned_to || [],
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('pl_cell_notes')
            .upsert(noteData, {
                onConflict: 'fiscal_year,view_type,section,dept,item,fiscal_month'
            });

        if (error) throw error;

        // Crear notificaciones para los usuarios asignados
        if (assigned_to?.length > 0) {
            const entityId = `${year}-${view_type}-${section}-${dept}-${item}-${month}`;
            const title = '📌 Has sido asignado en una nota del P&L';
            const body = `Sección: ${section} · ${dept} · Mes ${month} de ${year}${comment ? `\n"${comment}"` : ''}`;
            // Disparar sin await para no bloquear la respuesta
            createNotifications(assigned_to, 'note_assigned', title, body, 'pl_note', entityId)
                .catch(e => console.error('Notif error:', e.message));
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving PL note:', err);
        res.status(500).json({ error: err.message });
    }
});




// Get P&L Summary for a specific year
router.get('/summary/:year', async (req, res) => {
    const { year } = req.params;

    try {
        // 1. Fetch Budget Lines
        const { data: budgetLines, error: budgetError } = await supabase
            .from('budget_lines')
            .select(`
        id,
        department_id,
        line_type,
        jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec,
        departments (name, code)
      `)
            .eq('fiscal_year', year);

        if (budgetError) throw budgetError;

        // 2. Fetch Actual Income
        // For past years: read from actual_revenue (manually entered). For current/future: read from monthly_billing.
        const currentYearSummary = new Date().getFullYear();
        const isPastYearSummary = parseInt(year) < currentYearSummary;

        let billingData = [];
        let actualRevenueData = [];

        if (isPastYearSummary) {
            const { data: arData } = await supabase
                .from('actual_revenue')
                .select('amount, fiscal_month, department_id, departments(name, code)')
                .eq('fiscal_year', year);
            actualRevenueData = arData || [];
        } else {
            const { data: bData, error: billingError } = await supabase
                .from('monthly_billing')
                .select('*')
                .eq('fiscal_year', year);
            if (billingError) throw billingError;
            billingData = bData || [];
        }

        // 3. Fetch Actual Expenses
        const { data: expenseData, error: expenseError } = await supabase
            .from('actual_expenses')
            .select(`
        amount,
        fiscal_month,
        department_id,
        departments (name, code)
      `)
            .eq('fiscal_year', year);

        if (expenseError) throw expenseError;

        // 4. Process and Aggregate Data
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        // Initialize structure
        const summary = {
            income: { budget: Array(12).fill(0), real: Array(12).fill(0) },
            expenses: { budget: Array(12).fill(0), real: Array(12).fill(0) },
            margin: { budget: Array(12).fill(0), real: Array(12).fill(0) },
            departments: {}
        };

        // Helper to get Department Name safely
        const getDeptName = (item) => item.departments?.name || 'Unknown';

        // A. Process Budget
        budgetLines.forEach(line => {
            const deptName = getDeptName(line);
            const isIncome = line.line_type === 'revenue';

            if (!summary.departments[deptName]) {
                summary.departments[deptName] = {
                    income: { budget: Array(12).fill(0), real: Array(12).fill(0) },
                    expenses: { budget: Array(12).fill(0), real: Array(12).fill(0) }
                };
            }

            months.forEach((month, index) => {
                const val = Number(line[month] || 0);
                if (isIncome) {
                    summary.income.budget[index] += val;
                    summary.departments[deptName].income.budget[index] += val;
                } else {
                    summary.expenses.budget[index] += val;
                    summary.departments[deptName].expenses.budget[index] += val;
                }
            });
        });

        // B0. Process Real Income for past years (from actual_revenue)
        if (isPastYearSummary) {
            const deptMapSummary = {};
            departments?.forEach(d => { deptMapSummary[d.id] = d.name; });
            actualRevenueData.forEach(rev => {
                const deptName = rev.departments?.name || deptMapSummary[rev.department_id] || 'Otros';
                const monthIdx = rev.fiscal_month - 1;
                const val = Number(rev.amount || 0);
                summary.income.real[monthIdx] += val;
                if (!summary.departments[deptName]) {
                    summary.departments[deptName] = {
                        income: { budget: Array(12).fill(0), real: Array(12).fill(0) },
                        expenses: { budget: Array(12).fill(0), real: Array(12).fill(0) }
                    };
                }
                summary.departments[deptName].income.real[monthIdx] += val;
            });
        }

        // B. Process Real Income (Billing) — current/future years only
        // Map billing columns to departments: immedia_total -> Immedia, imcontent_total -> Imcontent, etc.
        billingData.forEach(record => {
            const monthIdx = record.fiscal_month - 1;

            // Immedia
            const immediaVal = Number(record.immedia_total || 0);
            summary.income.real[monthIdx] += immediaVal;
            if (summary.departments['Immedia']) summary.departments['Immedia'].income.real[monthIdx] += immediaVal;

            // Imcontent
            const imcontentVal = Number(record.imcontent_total || 0);
            summary.income.real[monthIdx] += imcontentVal;
            if (summary.departments['Imcontent']) summary.departments['Imcontent'].income.real[monthIdx] += imcontentVal;

            // Immoralia
            const immoraliaVal = Number(record.immoralia_total || 0);
            summary.income.real[monthIdx] += immoraliaVal;
            if (summary.departments['Immoralia']) summary.departments['Immoralia'].income.real[monthIdx] += immoraliaVal;
        });

        // B2. Process Real Income for Imsales (from billing_details, since it has no column in monthly_billing)
        {
            const mbIds = (billingData || []).map(b => b.id);
            if (mbIds.length > 0) {
                const { data: imsalesDetails } = await supabase
                    .from('billing_details')
                    .select('monthly_billing_id, amount, service:services(code)')
                    .in('monthly_billing_id', mbIds)
                    .in('service.code', ['IMSALES_SETUP', 'IMSALES_CAPTACI_N']);

                const filtered = (imsalesDetails || []).filter(d => d.service?.code);
                const mbIdToMonth = {};
                (billingData || []).forEach(b => { mbIdToMonth[b.id] = b.fiscal_month - 1; });

                if (!summary.departments['Imsales']) {
                    summary.departments['Imsales'] = {
                        income: { budget: Array(12).fill(0), real: Array(12).fill(0) },
                        expenses: { budget: Array(12).fill(0), real: Array(12).fill(0) }
                    };
                }

                filtered.forEach(d => {
                    const monthIdx = mbIdToMonth[d.monthly_billing_id];
                    if (monthIdx === undefined) return;
                    const val = Number(d.amount || 0);
                    summary.income.real[monthIdx] += val;
                    summary.departments['Imsales'].income.real[monthIdx] += val;
                });
            }
        }

        // C. Process Real Expenses
        expenseData.forEach(expense => {
            const monthIdx = expense.fiscal_month - 1;
            const deptName = getDeptName(expense);
            const val = Number(expense.amount || 0);

            summary.expenses.real[monthIdx] += val;

            if (!summary.departments[deptName]) {
                // Init if not exists (might not have budget but has expenses)
                summary.departments[deptName] = {
                    income: { budget: Array(12).fill(0), real: Array(12).fill(0) },
                    expenses: { budget: Array(12).fill(0), real: Array(12).fill(0) }
                };
            }
            summary.departments[deptName].expenses.real[monthIdx] += val;
        });

        // D. Calculate Margins (Income - Expenses)
        months.forEach((_, i) => {
            summary.margin.budget[i] = summary.income.budget[i] - summary.expenses.budget[i];
            summary.margin.real[i] = summary.income.real[i] - summary.expenses.real[i];
        });

        res.json(summary);

    } catch (error) {
        console.error('Error fetching P&L data:', error);
        res.status(500).json({ error: 'Failed to fetch P&L data' });
    }
});

// ================================================
// NEW: P&L MATRIX ENDPOINT (Spreadsheet View)
// ================================================

/**
 * GET /pl/matrix/:year
 * Returns P&L data structured for spreadsheet display
 * Query params: type=budget|real (default: budget)
 */
router.get('/matrix/:year', async (req, res) => {
    const { year } = req.params;
    const type = req.query.type || 'budget'; // 'budget' or 'real'

    try {
        const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        // 1. Fetch Departments
        const { data: departments } = await supabase
            .from('departments')
            .select('id, name, code')
            .order('name');

        // 2. Fetch ALL Services (no year filter — saved budget lines must always resolve their service name).
        const { data: allSvcData } = await supabase
            .from('services')
            .select('id, name, code, department_id')
            .eq('is_active', true)
            .order('name');
        const services = allSvcData || [];

        // 3. Fetch ALL Expense Categories (no is_active filter, no year filter).
        // Budget values saved for any category must always be retrievable.
        const { data: allCatData } = await supabase
            .from('expense_categories')
            .select('id, name, code, parent_category_id, is_general')
            .order('display_order');
        const expenseCategories = allCatData || [];

        // 4. Fetch Employees (for personnel costs)
        const { data: employees } = await supabase
            .from('employees')
            .select('id, first_name, last_name, department_id')
            .eq('is_active', true);

        let sections = [];

        if (type === 'budget') {
            // BUDGET VIEW: Read from budget_lines table
            const { data: budgetLines } = await supabase
                .from('budget_lines')
                .select('*')
                .eq('fiscal_year', year);

            // Group by department for revenue
            const revenueByDept = {};
            const expensesByCategory = {};

            budgetLines?.forEach(line => {
                const values = MONTH_KEYS.map(k => Number(line[k] || 0));

                // Metadata map: key = month index (0-11) -> value = metadata object
                const rowMetadata = {};
                const lineMeta = line.cell_metadata || {};
                MONTH_KEYS.forEach((k, i) => {
                    if (lineMeta[k]) rowMetadata[i] = lineMeta[k];
                });

                if (line.line_type === 'revenue') {
                    const dept = departments?.find(d => d.id === line.department_id);
                    const deptName = dept?.name || 'Otros';

                    // Resolve service name: prefer services table lookup, fall back to notes/description
                    let name = line.notes || line.description;
                    if (line.service_id) {
                        const svc = services?.find(s => s.id === line.service_id);
                        if (svc) name = svc.name;
                    }
                    name = name || 'Sin descripción';

                    // Merge duplicate lines (same dept+name) by taking last non-zero value per month.
                    // Duplicates can exist from previous saves that used wrong column names in the lookup.
                    const key = `${deptName}::${name}`;
                    if (!revenueByDept[key]) revenueByDept[key] = {
                        dept: deptName,
                        name,
                        values: Array(12).fill(0),
                        metadata: {}
                    };
                    values.forEach((v, i) => { if (v !== 0) revenueByDept[key].values[i] = v; });
                    Object.assign(revenueByDept[key].metadata, rowMetadata);
                } else {
                    // Expense
                    const cat = expenseCategories?.find(c => c.id === line.expense_category_id);
                    const catName = cat?.name || line.description || 'Otros Gastos';
                    const dept = departments?.find(d => d.id === line.department_id);
                    const deptName = dept?.name || 'Otros';

                    // Key by Dept + Cat to separate "Software - Immedia" from "Software - Immoralia"
                    const key = `${deptName}::${catName}`;

                    if (!expensesByCategory[key]) expensesByCategory[key] = {
                        dept: deptName,
                        name: catName,
                        values: Array(12).fill(0),
                        metadata: {}
                    };

                    // Merge values from multiple budget_lines for the same dept+category.
                    // Multiple lines can exist if the categoryId was inconsistent across saves.
                    // Take the last non-zero value per month so no data is lost.
                    values.forEach((v, i) => {
                        if (v !== 0) expensesByCategory[key].values[i] = v;
                    });
                    Object.assign(expensesByCategory[key].metadata, rowMetadata);
                }
            });

            // Build INGRESOS section — group by dept for headers
            const ingresoRows = [];
            let ingresoSubtotal = Array(12).fill(0);
            // Group merged entries by dept for header rows
            const revByDeptGrouped = {};
            Object.values(revenueByDept).forEach(data => {
                if (!revByDeptGrouped[data.dept]) revByDeptGrouped[data.dept] = { items: [], subtotal: Array(12).fill(0) };
                revByDeptGrouped[data.dept].items.push(data);
                data.values.forEach((v, i) => revByDeptGrouped[data.dept].subtotal[i] += v);
            });
            Object.entries(revByDeptGrouped).forEach(([deptName, group]) => {
                ingresoRows.push({ type: 'header', name: deptName, values: group.subtotal });
                group.items.forEach(item => ingresoRows.push({
                    type: 'item', dept: deptName, name: item.name,
                    values: item.values, metadata: item.metadata, editable: true
                }));
                group.subtotal.forEach((v, i) => ingresoSubtotal[i] += v);
            });

            sections.push({
                code: 'REVENUE',
                name: 'INGRESOS DE EXPLOTACIÓN',
                rows: ingresoRows,
                subtotal: ingresoSubtotal
            });

            // Build GASTOS section
            const gastoRows = [];
            let gastoSubtotal = Array(12).fill(0);
            Object.values(expensesByCategory).forEach((data) => {
                gastoRows.push({
                    type: 'item',
                    dept: data.dept,
                    name: data.name,
                    values: data.values,
                    metadata: data.metadata,
                    editable: true
                });
                data.values.forEach((v, i) => gastoSubtotal[i] += v);
            });

            sections.push({
                code: 'EXPENSES',
                name: 'GASTOS DE EXPLOTACIÓN',
                rows: gastoRows,
                subtotal: gastoSubtotal
            });

            // EBITDA
            const ebitda = ingresoSubtotal.map((v, i) => v - gastoSubtotal[i]);
            sections.push({
                code: 'EBITDA',
                name: 'EBITDA',
                values: ebitda,
                calculated: true
            });

        } else {
            // ================================================
            // REAL VIEW: Read from billing_details by SERVICE
            // ================================================

            const currentYear = new Date().getFullYear();
            const isPastYear = parseInt(year) < currentYear;

            // Initialize revenue structure
            const revenueData = {
                'Paid General': Array(12).fill(0),
                'Paid imfilms': Array(12).fill(0),
                'Setup inicial': Array(12).fill(0),
                'Branding': Array(12).fill(0),
                'Diseño': Array(12).fill(0),
                'Contenido con IA': Array(12).fill(0),
                'RRSS': Array(12).fill(0),
                'Estrategia Digital': Array(12).fill(0),
                'Influencers': Array(12).fill(0),
                'Diseño de Landing': Array(12).fill(0),
                'Setup inicial IA': Array(12).fill(0),
                'Automation': Array(12).fill(0),
                'Consultoría': Array(12).fill(0),
                'Web dev': Array(12).fill(0),
                'CRM': Array(12).fill(0),
                'Comisiones': Array(12).fill(0),
                'SEO': Array(12).fill(0),
                'Otros servicios': Array(12).fill(0),
                'Otras comisiones': Array(12).fill(0),
                'Budget Nutfruit': Array(12).fill(0),
                'Captación': Array(12).fill(0),
                'Setup inicial (ims)': Array(12).fill(0),
            };

            let revenueEditable = false;

            if (isPastYear) {
                // PAST YEARS: Read manual revenue from actual_revenue table
                revenueEditable = true;
                const { data: manualRevenue } = await supabase
                    .from('actual_revenue')
                    .select('*, service:services(name)')
                    .eq('fiscal_year', year);

                const deptMap = {};
                departments?.forEach(d => deptMap[d.id] = d.name);

                manualRevenue?.forEach(rev => {
                    // Prefer description (P&L display name saved at write time) over service table name
                    // (service.name is the long DB name e.g. "Gestión de RRSS" which won't match revenueData key "RRSS")
                    const serviceName = rev.description || rev.service?.name || 'Otros';
                    const monthIdx = rev.fiscal_month - 1;
                    const val = Number(rev.amount || 0);
                    if (revenueData[serviceName] !== undefined) {
                        revenueData[serviceName][monthIdx] += val;
                    }
                });
            } else {
                // CURRENT/FUTURE YEARS: Read from billing_details (automatic)
                const { data: allMonthlyBillings } = await supabase
                    .from('monthly_billing')
                    .select('id, fiscal_month, fiscal_year, fee_paid, client_id, client:clients(id, name, is_active, vertical:verticals(id, name))')
                    .eq('fiscal_year', year);

                const monthlyBillings = allMonthlyBillings?.filter(mb => mb.client?.is_active === true) || [];
                const mbIds = monthlyBillings.map(mb => mb.id);

                let billingDetails = [];
                if (mbIds.length > 0) {
                    const { data: details } = await supabase
                        .from('billing_details')
                        .select('id, monthly_billing_id, service_id, amount, service:services(code, name)')
                        .in('monthly_billing_id', mbIds);
                    billingDetails = details || [];
                }

                const serviceMapping = {
                    'PAID_MEDIA_SETUP': 'Setup inicial',
                    'BRANDING': 'Branding',
                    'CONTENT_DESIGN': 'Diseño',
                    'AI_CONTENT': 'Contenido con IA',
                    'SOCIAL_MEDIA_MGMT': 'RRSS',
                    'DIGITAL_STRATEGY': 'Estrategia Digital',
                    'INFLUENCER_UGC': 'Influencers',
                    'DISENO_LANDING': 'Diseño de Landing',
                    'BUDGET_INFLUENCER_PAID': 'Budget Nutfruit',
                    'IMMORALIA_SETUP': 'Setup inicial IA',
                    'AGENCY_AUTO': 'Automation',
                    'CONSULTING_AUTO': 'Consultoría',
                    'WEB_DEV': 'Web dev',
                    'SEO': 'SEO',
                    'MKT_AUTO_EMAIL': 'CRM',
                    'OTHER_HOURS': 'Otros servicios',
                    'IMMORAL_COMMISSIONS': 'Otras comisiones',
                    'IMSALES_SETUP': 'Setup inicial (ims)',
                    'IMSALES_CAPTACI_N': 'Captación',
                };

                const mbMap = {};
                monthlyBillings?.forEach(mb => { mbMap[mb.id] = mb; });

                let totalPaidMedia = Array(12).fill(0);
                let imfilmsPaidMedia = Array(12).fill(0);

                monthlyBillings.forEach(mb => {
                    const monthIdx = mb.fiscal_month - 1;
                    const feePaid = Number(mb.fee_paid || 0);
                    const verticalName = mb.client?.vertical?.name || '';

                    if (feePaid > 0) {
                        totalPaidMedia[monthIdx] += feePaid;
                        if (verticalName.toLowerCase() === 'imfilms') {
                            imfilmsPaidMedia[monthIdx] += feePaid;
                        }
                    }
                });

                for (let i = 0; i < 12; i++) {
                    revenueData['Paid General'][i] = totalPaidMedia[i] - imfilmsPaidMedia[i];
                    revenueData['Paid imfilms'][i] = imfilmsPaidMedia[i];
                }

                billingDetails?.forEach(detail => {
                    if (!detail.service) return;
                    const mb = mbMap[detail.monthly_billing_id];
                    if (!mb) return;
                    const serviceCode = detail.service.code;
                    if (serviceCode === 'PAID_MEDIA_STRATEGY') return;

                    const monthIdx = mb.fiscal_month - 1;
                    const amount = Number(detail.amount || 0);
                    const plRow = serviceMapping[serviceCode];
                    if (plRow && revenueData[plRow]) revenueData[plRow][monthIdx] += amount;
                });
            }

            const buildDeptRows = (dept, serviceNames) => {
                return serviceNames.map(name => ({
                    type: 'item',
                    dept,
                    name,
                    values: revenueData[name] || Array(12).fill(0),
                    editable: revenueEditable
                }));
            };

            const allRows = [
                ...buildDeptRows('Immedia', ['Paid General', 'Paid imfilms', 'Setup inicial']),
                ...buildDeptRows('Imcontent', ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers', 'Diseño de Landing']),
                ...buildDeptRows('Immoralia', ['Setup inicial IA', 'Automation', 'Consultoría']),
                ...buildDeptRows('Imloyal', ['Web dev', 'CRM', 'Comisiones']),
                ...buildDeptRows('Imseo', ['SEO', 'Comisiones']),
                ...buildDeptRows('Immoral', ['Otros servicios', 'Otras comisiones']),
                ...buildDeptRows('Imcontent', ['Budget Nutfruit']),
                ...buildDeptRows('Imsales', ['Setup inicial (ims)']),
                ...buildDeptRows('Imsales', ['Captación']),
            ];

            let ingresoSubtotal = Array(12).fill(0);
            allRows.forEach(row => {
                row.values.forEach((v, i) => ingresoSubtotal[i] += v);
            });

            sections.push({
                code: 'REVENUE',
                name: 'INGRESOS DE EXPLOTACIÓN',
                rows: allRows,
                subtotal: ingresoSubtotal
            });

            // ================================================
            // EXPENSES (Real)
            // ================================================
            const { data: expenseData } = await supabase
                .from('actual_expenses')
                .select('*, category:expense_categories(name)')
                .eq('fiscal_year', year);

            const { data: payrollData } = await supabase
                .from('monthly_payroll')
                .select('*, employee:employees(first_name, last_name)')
                .eq('fiscal_year', year);

            const expensesKeyed = {};
            const adspentItems = [
                { dept: 'Immedia', cat: 'Adspent' },
                { dept: 'Imcontent', cat: 'Adspent Nutfruit' },
                { dept: 'Imcontent', cat: 'Influencers' }
            ];
            adspentItems.forEach(item => {
                const k = `${item.dept}::${item.cat}::`;
                expensesKeyed[k] = { dept: item.dept, name: item.cat, section_key: '', values: Array(12).fill(0), metadata: {} };
            });

            const deptMapExp = {};
            departments?.forEach(d => deptMapExp[d.id] = d.name);

            // Only these values are valid section keys (matching frontend EXPENSE_STRUCTURE)
            const VALID_SECTION_KEYS = new Set([
                'personal', 'comisiones', 'marketing', 'formacion',
                'software', 'gastosOp', 'adspent'
            ]);

            expenseData?.forEach(exp => {
                const catName = exp.category?.name || 'Otros';
                const deptName = deptMapExp[exp.department_id] || 'Otros';
                const monthIdx = exp.fiscal_month - 1;
                const val = Number(exp.amount || 0);
                // Only use description as section_key if it's a valid known section key
                // Legacy records with 'Manual entry from P&L Matrix' get empty section_key
                const rawDesc = exp.description || '';
                const sectionKey = VALID_SECTION_KEYS.has(rawDesc) ? rawDesc : '';
                const key = `${deptName}::${catName}::${sectionKey}`;

                if (!expensesKeyed[key]) {
                    expensesKeyed[key] = { dept: deptName, name: catName, section_key: sectionKey, values: Array(12).fill(0), metadata: {} };
                }
                expensesKeyed[key].values[monthIdx] += val;

                // Metadata logic
                if (exp.cell_metadata) {
                    expensesKeyed[key].metadata[monthIdx] = exp.cell_metadata;
                }
            });

            const gastoRows = [];
            let gastoSubtotal = Array(12).fill(0);

            Object.values(expensesKeyed).forEach(data => {
                gastoRows.push({
                    type: 'item',
                    dept: data.dept,
                    name: data.name,
                    section_key: data.section_key,
                    values: data.values,
                    metadata: data.metadata,
                    editable: true
                });
                data.values.forEach((v, i) => gastoSubtotal[i] += v);
            });

            const payrollByMonth = Array(12).fill(0);
            payrollData?.forEach(p => {
                const monthIdx = p.fiscal_month - 1;
                payrollByMonth[monthIdx] += Number(p.total_company_cost || 0);
            });

            gastoRows.push({
                type: 'item',
                dept: 'General',
                name: 'Gastos de personal',
                values: payrollByMonth,
                editable: false
            });
            payrollByMonth.forEach((v, i) => gastoSubtotal[i] += v);

            sections.push({
                code: 'EXPENSES',
                name: 'GASTOS DE EXPLOTACIÓN',
                rows: gastoRows,
                subtotal: gastoSubtotal
            });

            // EBITDA
            const revenueSection = sections.find(s => s.code === 'REVENUE');
            const revenueSubtotal = revenueSection ? revenueSection.subtotal : Array(12).fill(0);
            const ebitda = revenueSubtotal.map((v, i) => v - gastoSubtotal[i]);
            sections.push({
                code: 'EBITDA',
                name: 'EBITDA',
                values: ebitda,
                calculated: true
            });
        }

        res.json({
            year: parseInt(year),
            type,
            columns: MONTHS,
            sections
        });

    } catch (error) {
        console.error('Error fetching P&L matrix:', error);
        res.status(500).json({ error: 'Failed to fetch P&L matrix' });
    }
});

/**
 * POST /pl/matrix/save
 * Save cell edit (Budget or Real)
 */
router.post('/matrix/save', async (req, res) => {
    const { year, month, dept, item, value, type, section, section_key, comment, assigned_to } = req.body;
    const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthKey = MONTH_KEYS[month - 1];

    try {
        console.log('--- SAVE REQUEST RECEIVED ---');
        console.log('Payload:', { year, month, dept, item, value, type, section, section_key, comment, assigned_to });

        // 1. Resolve Department ID
        const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id')
            .eq('name', dept)
            .single();

        if (deptError || !deptData) {
            throw new Error(`Department not found: ${dept}`);
        }
        const departmentId = deptData.id;

        // 2. Resolve Category/Service ID
        let categoryId = null;
        let serviceId = null;

        if (section === 'revenue') {
            const { data: svcData } = await supabase.from('services').select('id').eq('name', item).eq('department_id', departmentId).maybeSingle();
            if (svcData) {
                serviceId = svcData.id;
            } else {
                // Auto-create service so the budget_line constraint (service_id NOT NULL) is satisfied
                const code = item.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') + '_' + Date.now().toString(36).slice(-6);
                const { data: newSvc, error: svcErr } = await supabase.from('services')
                    .insert({ name: item, code, department_id: departmentId, is_active: true, service_type: 'revenue' })
                    .select('id')
                    .single();
                if (svcErr) {
                    console.error('Error creating service:', svcErr);
                    throw new Error(`Could not create service for: ${item}`);
                }
                serviceId = newSvc.id;
                console.log(`Auto-created service: ${item} (${serviceId}) for dept ${dept}`);
            }
        } else {
            const { data: catData } = await supabase.from('expense_categories').select('id').eq('name', item).maybeSingle();
            if (catData) {
                categoryId = catData.id;
            } else {
                // Auto-create expense category if not found
                const code = item.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') + '_' + Date.now().toString(36).slice(-6);
                const { data: newCat, error: catErr } = await supabase.from('expense_categories')
                    .insert({ name: item, code: code, is_general: false, is_active: true })
                    .select('id')
                    .single();
                if (catErr) {
                    console.error('Error creating expense category:', catErr);
                    throw new Error(`Could not create category for: ${item}`);
                }
                categoryId = newCat.id;
                // Assign new category to the current year in junction table
                await supabase.from('category_year_assignments')
                    .upsert({ category_id: categoryId, fiscal_year: parseInt(year), is_active: true }, { onConflict: 'category_id, fiscal_year' });
                console.log(`Auto-created expense category: ${item} (${categoryId}) for year ${year}`);
            }
        }

        // Variables para log (se asignan en cada rama)
        let _plLogOp = null;
        let _plOldVal = null;
        let _plRecordId = null;
        let _plLogTable = null;

        if (type === 'budget') {
            // BUDGET SAVE
            // For expense: categoryId required. For revenue: serviceId preferred but not required
            // (service name from REVENUE_STRUCTURE may not exist in services table).
            if (section !== 'revenue' && !categoryId) throw new Error(`Category not found for ${item} in ${dept}`);

            let query = supabase.from('budget_lines')
                .select('id, cell_metadata, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec')
                .eq('fiscal_year', year)
                .eq('department_id', departmentId)
                .eq('line_type', section === 'revenue' ? 'revenue' : 'expense');

            if (section === 'revenue') query = query.eq('service_id', serviceId);
            else query = query.eq('expense_category_id', categoryId);

            const { data: existingLines } = await query;
            const existingLine = existingLines?.[0];

            let newMeta = {};
            if (existingLine && existingLine.cell_metadata) {
                newMeta = { ...existingLine.cell_metadata };
            }

            const cellMeta = newMeta[monthKey] || {};
            if (comment !== undefined) cellMeta.comment = comment;
            if (assigned_to !== undefined) cellMeta.assigned_to = assigned_to;
            cellMeta.updated_at = new Date().toISOString();

            if ((!cellMeta.comment) && (!cellMeta.assigned_to || cellMeta.assigned_to.length === 0)) {
                delete newMeta[monthKey];
            } else {
                newMeta[monthKey] = cellMeta;
            }

            if (existingLine) {
                console.log(`[BUDGET SAVE] UPDATE existing line id=${existingLine.id}, ${monthKey}=${value}`);
                const { error: updateErr } = await supabase.from('budget_lines')
                    .update({
                        [monthKey]: Number(value),
                        cell_metadata: newMeta,
                        notes: item
                    })
                    .eq('id', existingLine.id);
                if (updateErr) throw new Error(`Budget update failed: ${updateErr.message}`);
            } else {
                const insertMeta = {};
                if (comment || (assigned_to && assigned_to.length > 0)) {
                    insertMeta[monthKey] = { comment, assigned_to, updated_at: new Date().toISOString() };
                }

                console.log(`[BUDGET SAVE] INSERT new line, dept=${dept}, service_id=${serviceId}, category_id=${categoryId}, ${monthKey}=${value}`);
                const { error: insertErr } = await supabase.from('budget_lines').insert({
                    fiscal_year: year,
                    department_id: departmentId,
                    line_type: section === 'revenue' ? 'revenue' : 'expense',
                    service_id: serviceId || null,
                    expense_category_id: categoryId,
                    [monthKey]: Number(value),
                    notes: item,
                    cell_metadata: insertMeta
                });
                if (insertErr) throw new Error(`Budget insert failed: ${insertErr.message}`);
            }

            // Asignar datos de log para presupuesto
            _plLogTable = 'budget_lines';
            _plLogOp = existingLine ? 'update' : 'create';
            _plOldVal = existingLine ? String(existingLine[monthKey] || 0) : null;
            _plRecordId = existingLine?.id || null;

        } else {
            // REAL SAVE
            if (section === 'revenue') {
                // Allow saving real revenue for past years (manual entry)
                const currentYear = new Date().getFullYear();
                if (parseInt(year) >= currentYear) {
                    return res.status(400).json({ error: 'Real revenue is read-only for current/future years (comes from billing)' });
                }

                // Save to actual_revenue table for past years
                if (!serviceId) {
                    // Try to find service without department filter
                    const { data: svcAny } = await supabase.from('services').select('id').eq('name', item).maybeSingle();
                    if (svcAny) serviceId = svcAny.id;
                }

                const { data: existingRev } = await supabase
                    .from('actual_revenue')
                    .select('id, amount')
                    .eq('fiscal_year', year)
                    .eq('fiscal_month', month)
                    .eq('department_id', departmentId)
                    .eq('description', item)
                    .maybeSingle();

                if (existingRev) {
                    await supabase.from('actual_revenue')
                        .update({ amount: Number(value) })
                        .eq('id', existingRev.id);
                } else {
                    await supabase.from('actual_revenue').insert({
                        fiscal_year: parseInt(year),
                        fiscal_month: parseInt(month),
                        department_id: departmentId,
                        service_id: serviceId,
                        amount: Number(value),
                        description: item,
                        reference_type: 'manual'
                    });
                }

                // Log ingreso real (fire-and-forget) — antes del early return
                const _revOp = existingRev ? 'update' : 'create';
                const { userId: _rvUid, userEmail: _rvUe } = extractUser(req);
                logChange(supabase, {
                    module: 'pl',
                    table: 'actual_revenue',
                    recordId: existingRev?.id || null,
                    recordLabel: `${dept} · ${item} · Real ${year}/${String(month).padStart(2, '0')}`,
                    operation: _revOp,
                    fieldName: `${section}.${monthKey}`,
                    oldValue: existingRev ? String(existingRev.amount || 0) : null,
                    newValue: String(value),
                    userId: _rvUid, userEmail: _rvUe,
                }).catch(() => {});

                return res.json({ success: true });
            }

            if (!categoryId) throw new Error(`Category not found for expense item: ${item}`);

            // Query for existing expense record
            let expQuery = supabase
                .from('actual_expenses')
                .select('id, cell_metadata, amount')
                .eq('fiscal_year', year)
                .eq('fiscal_month', month)
                .eq('department_id', departmentId)
                .eq('expense_category_id', categoryId);

            // If section_key provided, filter by it to differentiate same-name items
            if (section_key) {
                expQuery = expQuery.eq('description', section_key);
            }

            const { data: existingExpList } = await expQuery;
            const existingExp = existingExpList?.[0];

            const metaUpdate = existingExp?.cell_metadata || {};
            if (comment !== undefined) metaUpdate.comment = comment;
            if (assigned_to !== undefined) metaUpdate.assigned_to = assigned_to;
            metaUpdate.updated_at = new Date().toISOString();

            if (existingExp) {
                await supabase.from('actual_expenses')
                    .update({ amount: Number(value), cell_metadata: metaUpdate })
                    .eq('id', existingExp.id);
            } else {
                await supabase.from('actual_expenses').insert({
                    fiscal_year: year,
                    fiscal_month: month,
                    department_id: departmentId,
                    expense_category_id: categoryId,
                    amount: Number(value),
                    description: section_key || 'Manual entry from P&L Matrix',
                    cell_metadata: metaUpdate
                });
            }

            // Asignar datos de log para gastos reales
            _plLogTable = 'actual_expenses';
            _plLogOp = existingExp ? 'update' : 'create';
            _plOldVal = existingExp ? String(existingExp.amount || 0) : null;
            _plRecordId = existingExp?.id || null;
        }

        // Log de cambio en P&L Matrix (fire-and-forget)
        if (_plLogOp) {
            const { userId: _plUid, userEmail: _plUe } = extractUser(req);
            logChange(supabase, {
                module: 'pl',
                table: _plLogTable,
                recordId: _plRecordId,
                recordLabel: `${dept} · ${item} · ${type} ${year}/${String(month).padStart(2, '0')}`,
                operation: _plLogOp,
                fieldName: `${section}.${monthKey}`,
                oldValue: _plOldVal,
                newValue: String(value),
                userId: _plUid, userEmail: _plUe,
            }).catch(() => {});
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving P&L cell:', error);
        res.status(500).json({ error: 'Failed to save cell: ' + error.message });
    }
});
/**
 * GET /pl/custom-rows
 * Fetch custom rows filtered by year
 */
router.get('/custom-rows', async (req, res) => {
    try {
        const { year } = req.query;
        let query = supabase
            .from('pl_custom_rows')
            .select('*')
            .order('created_at', { ascending: true });

        if (year) {
            query = query.eq('fiscal_year', year);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ rows: data || [] });
    } catch (error) {
        console.error('Error fetching custom rows:', error);
        res.status(500).json({ error: 'Failed to fetch custom rows' });
    }
});

/**
 * POST /pl/custom-rows
 * Add a new custom row + auto-create expense_category or service in DB
 */
router.post('/custom-rows', async (req, res) => {
    const { block_type, section_key, dept, item_name, fiscal_year } = req.body;

    try {
        if (!block_type || !section_key || !dept || !item_name) {
            return res.status(400).json({ error: 'Missing required fields: block_type, section_key, dept, item_name' });
        }

        const targetYear = fiscal_year || new Date().getFullYear();

        // 1. Insert into pl_custom_rows with fiscal_year
        const { data: customRow, error: insertErr } = await supabase
            .from('pl_custom_rows')
            .insert({ block_type, section_key, dept, item_name, fiscal_year: targetYear })
            .select()
            .single();

        if (insertErr) {
            if (insertErr.code === '23505') { // unique violation
                return res.status(409).json({ error: 'Esta fila ya existe en este bloque' });
            }
            throw insertErr;
        }

        // 2. Auto-create the expense_category or service entry (if needed)
        const { data: deptData } = await supabase
            .from('departments')
            .select('id')
            .eq('name', dept)
            .maybeSingle();

        if (block_type === 'expense') {
            // Check if expense_category exists
            const { data: existingCat } = await supabase
                .from('expense_categories')
                .select('id')
                .eq('name', item_name)
                .maybeSingle();

            if (!existingCat) {
                // Create a new expense_category with a unique code
                const code = item_name.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') + '_' + Date.now().toString(36).slice(-6);
                const { data: newCat } = await supabase.from('expense_categories').insert({
                    name: item_name,
                    code: code,
                    is_general: false
                }).select('id').single();
                // Assign to the target year
                if (newCat) {
                    await supabase.from('category_year_assignments')
                        .upsert({ category_id: newCat.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'category_id, fiscal_year' });
                }
            } else {
                // Category exists but may not be assigned to this year
                await supabase.from('category_year_assignments')
                    .upsert({ category_id: existingCat.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'category_id, fiscal_year' });
            }
        } else if (block_type === 'revenue' && deptData) {
            // Check if service exists for this dept
            const { data: existingSvc } = await supabase
                .from('services')
                .select('id')
                .eq('name', item_name)
                .eq('department_id', deptData.id)
                .maybeSingle();

            if (!existingSvc) {
                const code = item_name.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') + '_' + Date.now().toString(36).slice(-6);
                const { data: newSvc } = await supabase.from('services').insert({
                    department_id: deptData.id,
                    name: item_name,
                    code: code,
                    service_type: 'revenue'
                }).select('id').single();
                // Assign to the target year
                if (newSvc) {
                    await supabase.from('service_year_assignments')
                        .upsert({ service_id: newSvc.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'service_id, fiscal_year' });
                }
            } else {
                // Service exists but may not be assigned to this year
                await supabase.from('service_year_assignments')
                    .upsert({ service_id: existingSvc.id, fiscal_year: targetYear, is_active: true }, { onConflict: 'service_id, fiscal_year' });
            }
        }

        res.json({ success: true, row: customRow });
    } catch (error) {
        console.error('Error adding custom row:', error);
        res.status(500).json({ error: 'Failed to add custom row: ' + error.message });
    }
});

/**
 * DELETE /pl/custom-rows/:id
 * Remove a custom row AND its associated actual_expenses records
 */
router.delete('/custom-rows/:id', async (req, res) => {
    try {
        // 1. Fetch the custom row to get its details before deleting
        const { data: row, error: fetchErr } = await supabase
            .from('pl_custom_rows')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchErr) throw fetchErr;

        // 2. If it's an expense row, also delete associated actual_expenses
        if (row && row.block_type === 'expense') {
            // Find the expense_category by name (case-insensitive)
            const { data: categories } = await supabase
                .from('expense_categories')
                .select('id')
                .ilike('name', row.item_name);

            if (categories && categories.length > 0) {
                // Find the department (case-insensitive)
                const { data: departments } = await supabase
                    .from('departments')
                    .select('id')
                    .ilike('name', row.dept);

                if (departments && departments.length > 0) {
                    const catIds = categories.map(c => c.id);
                    const deptIds = departments.map(d => d.id);

                    // Delete actual_expenses for this category + department
                    const { error: delExpErr } = await supabase
                        .from('actual_expenses')
                        .delete()
                        .in('expense_category_id', catIds)
                        .in('department_id', deptIds);

                    if (delExpErr) console.error('Error deleting associated expenses:', delExpErr);
                    else console.log(`Cascade-deleted actual_expenses for ${row.item_name} in ${row.dept}`);
                }
            }
        }

        // 3. Delete the custom row itself
        const { error } = await supabase
            .from('pl_custom_rows')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting custom row:', error);
        res.status(500).json({ error: 'Failed to delete custom row' });
    }
});

/**
 * PATCH /pl/custom-rows/:id
 * Rename a custom row
 */
router.patch('/custom-rows/:id', async (req, res) => {
    const { item_name } = req.body;
    try {
        if (!item_name || !item_name.trim()) {
            return res.status(400).json({ error: 'item_name is required' });
        }

        const { error } = await supabase
            .from('pl_custom_rows')
            .update({ item_name: item_name.trim() })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error renaming custom row:', error);
        res.status(500).json({ error: 'Failed to rename custom row' });
    }
});

// ================================================
// COST PER HOUR ENDPOINT
// ================================================

/**
 * GET /pl/cost-per-hour/:year/:dept
 * Returns cost-per-hour metrics for a specific department and year.
 * :dept can be: immedia, imcontent, immoralia
 * 
 * Response includes monthly arrays (12 elements, one per month):
 * - people_per_month: number of people with personal cost > 0 that month
 * - personal_cost_per_month: total personal cost for the dept
 * - cost_per_hour: personal cost / (160 * people)
 * - total_hours_per_month: 160 * people
 * - total_expenses_per_month: ALL dept expenses (personal + comisiones + marketing + etc + group cost)
 * - cost_per_hour_real: total expenses / total hours
 */
router.get('/cost-per-hour/:year/:dept', async (req, res) => {
    const { year, dept } = req.params;
    const HOURS_PER_PERSON = 160;
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Map URL dept code to display name
    const DEPT_MAP = {
        immedia: 'Immedia',
        imcontent: 'Imcontent',
        immoralia: 'Immoralia',
    };

    const deptName = DEPT_MAP[dept?.toLowerCase()];
    if (!deptName) {
        return res.status(400).json({
            error: `Invalid department: '${dept}'. Valid values: ${Object.keys(DEPT_MAP).join(', ')}`
        });
    }

    // Personal items per department (mirroring frontend EXPENSE_STRUCTURE)
    // These are used to identify which expense items are "personal" for counting people
    const PERSONAL_ITEMS = {
        Immedia: ['Alba', 'Andrés', 'Leidy'],
        Imcontent: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'],
        Immoralia: ['David', 'Manel', 'Julian'],
    };

    // Expense section keys to aggregate for total department expenses
    const EXPENSE_SECTION_KEYS = ['personal', 'comisiones', 'marketing', 'formacion', 'software', 'adspent', 'gastosOp'];

    // Valid section keys for classification
    const VALID_SECTION_KEYS = new Set([
        'personal', 'comisiones', 'marketing', 'formacion',
        'software', 'gastosOp', 'adspent'
    ]);

    try {
        // 1. Fetch all actual expenses for the year
        const { data: expenseData, error: expError } = await supabase
            .from('actual_expenses')
            .select('*, category:expense_categories(name)')
            .eq('fiscal_year', year);

        if (expError) throw expError;

        // 2. Fetch departments for ID -> name mapping
        const { data: departments } = await supabase
            .from('departments')
            .select('id, name');

        const deptIdMap = {};
        departments?.forEach(d => deptIdMap[d.id] = d.name);

        // 3. Fetch custom rows (in case new personal items were added)
        const { data: customRows } = await supabase
            .from('pl_custom_rows')
            .select('*')
            .eq('fiscal_year', year)
            .eq('block_type', 'expense')
            .eq('section_key', 'personal');

        // Build the full list of known personal item names for this dept
        const personalItemNames = [...(PERSONAL_ITEMS[deptName] || [])];
        customRows?.forEach(cr => {
            if (cr.dept === deptName && !personalItemNames.includes(cr.item_name)) {
                personalItemNames.push(cr.item_name);
            }
        });

        // Exclude "Externos" type entries from person counting
        const countablePersonalItems = personalItemNames.filter(
            name => !name.toLowerCase().includes('externo')
        );

        // 4. Process expense data into keyed monthly values
        // Key: "dept::item::section_key" → monthly values
        const expensesByKey = {};

        expenseData?.forEach(exp => {
            const expDept = deptIdMap[exp.department_id] || 'Otros';
            const catName = exp.category?.name || 'Otros';
            const monthIdx = exp.fiscal_month - 1;
            const val = Number(exp.amount || 0);
            const rawDesc = exp.description || '';
            const sectionKey = VALID_SECTION_KEYS.has(rawDesc) ? rawDesc : '';
            const key = `${expDept}::${catName}::${sectionKey}`;

            if (!expensesByKey[key]) {
                expensesByKey[key] = { dept: expDept, name: catName, section_key: sectionKey, values: Array(12).fill(0) };
            }
            expensesByKey[key].values[monthIdx] += val;
        });

        // 5. Calculate personal cost per month for the department
        const personalCostPerMonth = Array(12).fill(0);
        Object.values(expensesByKey).forEach(entry => {
            if (entry.dept === deptName && (entry.section_key === 'personal' || entry.section_key === '')) {
                // Check if this item name matches any known personal item
                if (personalItemNames.some(pName => pName === entry.name) || entry.section_key === 'personal') {
                    entry.values.forEach((v, i) => personalCostPerMonth[i] += v);
                }
            }
        });

        // 6. Count people per month: a person counts if they have cost > 0 that month
        const peoplePerMonth = Array(12).fill(0);
        countablePersonalItems.forEach(personName => {
            for (let m = 0; m < 12; m++) {
                // Find expense entry matching this person
                const hasExpense = Object.values(expensesByKey).some(entry =>
                    entry.dept === deptName &&
                    entry.name === personName &&
                    entry.values[m] > 0
                );
                if (hasExpense) peoplePerMonth[m]++;
            }
        });

        // 7. Calculate total department expenses per month (all categories)
        const totalExpensesPerMonth = Array(12).fill(0);
        Object.values(expensesByKey).forEach(entry => {
            if (entry.dept === deptName) {
                entry.values.forEach((v, i) => totalExpensesPerMonth[i] += v);
            }
        });

        // 8. Calculate Group cost (Immoral general expenses distributed by revenue %)
        // Fetch revenue data for group % calculation
        let groupCostPerMonth = Array(12).fill(0);
        if (deptName !== 'Immoral') {
            // Get all revenue for the year to calculate dept's share
            const { data: allMonthlyBillings } = await supabase
                .from('monthly_billing')
                .select('id, fiscal_month, fee_paid, client_id, client:clients(is_active, vertical:verticals(name))')
                .eq('fiscal_year', year);

            const { data: billingDetails } = await supabase
                .from('billing_details')
                .select('monthly_billing_id, amount, service:services(code, name)')
                .in('monthly_billing_id', (allMonthlyBillings || []).map(mb => mb.id));

            // Calculate total general revenue and dept revenue per month
            // (simplified — uses same service-to-dept mapping as frontend)
            const deptServiceMapping = {
                Immedia: ['Paid General', 'Paid imfilms', 'Setup inicial'],
                Imcontent: ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers', 'Diseño de Landing', 'Budget Nutfruit'],
                Immoralia: ['Setup inicial IA', 'Automation', 'Consultoría'],
            };

            // Total general revenue per month (all depts)
            // For simplicity, use the existing matrix endpoint approach
            const totalGeneralRevenue = Array(12).fill(0);
            const deptRevenue = Array(12).fill(0);

            // Paid media revenue from monthly billing
            const activeBillings = (allMonthlyBillings || []).filter(mb => mb.client?.is_active);
            activeBillings.forEach(mb => {
                const monthIdx = mb.fiscal_month - 1;
                const fee = Number(mb.fee_paid || 0);
                totalGeneralRevenue[monthIdx] += fee;
                // Fee paid goes to Immedia (Paid General/imfilms)
                if (deptName === 'Immedia') deptRevenue[monthIdx] += fee;
            });

            // Service revenue from billing_details
            const serviceCodeToDept = {
                'BRANDING': 'Imcontent', 'CONTENT_DESIGN': 'Imcontent',
                'AI_CONTENT': 'Imcontent', 'SOCIAL_MEDIA_MGMT': 'Imcontent',
                'DIGITAL_STRATEGY': 'Imcontent', 'INFLUENCER_UGC': 'Imcontent',
                'DISENO_LANDING': 'Imcontent',
                'IMMORALIA_SETUP': 'Immoralia', 'AGENCY_AUTO': 'Immoralia',
                'CONSULTING_AUTO': 'Immoralia', 'PAID_MEDIA_SETUP': 'Immedia',
                'WEB_DEV': 'Imloyal', 'SEO': 'Imseo', 'MKT_AUTO_EMAIL': 'Imloyal',
                'OTHER_HOURS': 'Immoral',
            };

            const mbMap = {};
            activeBillings.forEach(mb => mbMap[mb.id] = mb);

            (billingDetails || []).forEach(detail => {
                if (!detail.service) return;
                const mb = mbMap[detail.monthly_billing_id];
                if (!mb) return;
                const monthIdx = mb.fiscal_month - 1;
                const amount = Number(detail.amount || 0);
                const svcDept = serviceCodeToDept[detail.service.code];

                totalGeneralRevenue[monthIdx] += amount;
                if (svcDept === deptName) deptRevenue[monthIdx] += amount;
            });

            // Immoral expenses (sum all)
            const immoralExpenses = Array(12).fill(0);
            Object.values(expensesByKey).forEach(entry => {
                if (entry.dept === 'Immoral') {
                    entry.values.forEach((v, i) => immoralExpenses[i] += v);
                }
            });

            // Group cost = immoral expenses * (dept revenue / total revenue)
            groupCostPerMonth = totalGeneralRevenue.map((totalRev, i) => {
                const pct = totalRev > 0 ? deptRevenue[i] / totalRev : 0;
                return Math.round(immoralExpenses[i] * pct * 100) / 100;
            });
        }

        // 9. Add group cost to total expenses
        const totalExpWithGroup = totalExpensesPerMonth.map((v, i) =>
            Math.round((v + groupCostPerMonth[i]) * 100) / 100
        );

        // 10. Calculate derived metrics
        const totalHoursPerMonth = peoplePerMonth.map(p => HOURS_PER_PERSON * p);

        const costPerHour = personalCostPerMonth.map((cost, i) =>
            totalHoursPerMonth[i] > 0 ? Math.round((cost / totalHoursPerMonth[i]) * 100) / 100 : 0
        );

        const costPerHourReal = totalExpWithGroup.map((cost, i) =>
            totalHoursPerMonth[i] > 0 ? Math.round((cost / totalHoursPerMonth[i]) * 100) / 100 : 0
        );

        // 11. Calculate annual totals
        const totalHoursYear = totalHoursPerMonth.reduce((a, b) => a + b, 0);
        const totalPersonalYear = personalCostPerMonth.reduce((a, b) => a + b, 0);
        const totalExpensesYear = totalExpWithGroup.reduce((a, b) => a + b, 0);

        res.json({
            department: deptName,
            year: parseInt(year),
            hours_per_person: HOURS_PER_PERSON,
            months: MONTHS,
            people_per_month: peoplePerMonth,
            people_names: countablePersonalItems,
            personal_cost_per_month: personalCostPerMonth,
            cost_per_hour: costPerHour,
            total_hours_per_month: totalHoursPerMonth,
            total_expenses_per_month: totalExpWithGroup,
            group_cost_per_month: groupCostPerMonth,
            cost_per_hour_real: costPerHourReal,
            annual_summary: {
                max_people: Math.max(...peoplePerMonth),
                total_hours: totalHoursYear,
                total_personal_cost: totalPersonalYear,
                avg_cost_per_hour: totalHoursYear > 0 ? Math.round((totalPersonalYear / totalHoursYear) * 100) / 100 : 0,
                total_expenses: totalExpensesYear,
                avg_cost_per_hour_real: totalHoursYear > 0 ? Math.round((totalExpensesYear / totalHoursYear) * 100) / 100 : 0,
            }
        });

    } catch (error) {
        console.error('Error calculating cost per hour:', error);
        res.status(500).json({ error: 'Failed to calculate cost per hour' });
    }
});

export default router;
