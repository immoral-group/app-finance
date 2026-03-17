import express from 'express';
import supabase from '../config/supabase.js';
import { createNotifications } from './notifications.js';

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

        // 2. Fetch Actual Income (Billing)
        // We need to sum specific columns from monthly_billing based on departments
        const { data: billingData, error: billingError } = await supabase
            .from('monthly_billing')
            .select('*')
            .eq('fiscal_year', year);

        if (billingError) throw billingError;

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

        // B. Process Real Income (Billing)
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

        // 2. Fetch Services assigned to this year (via junction table)
        const { data: svcAssignments } = await supabase
            .from('service_year_assignments')
            .select('service_id')
            .eq('fiscal_year', year)
            .eq('is_active', true);
        const assignedSvcIds = (svcAssignments || []).map(a => a.service_id);

        let services = [];
        if (assignedSvcIds.length > 0) {
            const { data: svcData } = await supabase
                .from('services')
                .select('id, name, code, department_id')
                .in('id', assignedSvcIds)
                .eq('is_active', true)
                .order('name');
            services = svcData || [];
        }

        // 3. Fetch Expense Categories assigned to this year (via junction table)
        const { data: catAssignments } = await supabase
            .from('category_year_assignments')
            .select('category_id')
            .eq('fiscal_year', year)
            .eq('is_active', true);
        const assignedCatIds = (catAssignments || []).map(a => a.category_id);

        let expenseCategories = [];
        if (assignedCatIds.length > 0) {
            const { data: catData } = await supabase
                .from('expense_categories')
                .select('id, name, code, parent_category_id, is_general')
                .in('id', assignedCatIds)
                .eq('is_active', true)
                .order('display_order');
            expenseCategories = catData || [];
        }

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

                    // Resolve service name
                    let name = line.description;
                    if (line.service_id) {
                        const svc = services?.find(s => s.id === line.service_id);
                        if (svc) name = svc.name;
                    }
                    name = name || 'Sin descripción';

                    if (!revenueByDept[deptName]) revenueByDept[deptName] = { rows: [], subtotal: Array(12).fill(0) };

                    revenueByDept[deptName].rows.push({
                        id: line.id,
                        name,
                        values,
                        metadata: rowMetadata,
                        editable: true
                    });
                    values.forEach((v, i) => revenueByDept[deptName].subtotal[i] += v);
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
                        rows: [],
                        subtotal: Array(12).fill(0)
                    };

                    expensesByCategory[key].rows.push({
                        id: line.id,
                        name: line.description || catName,
                        values,
                        metadata: rowMetadata,
                        editable: true
                    });
                    values.forEach((v, i) => expensesByCategory[key].subtotal[i] += v);
                }
            });

            // Build INGRESOS section
            const ingresoRows = [];
            let ingresoSubtotal = Array(12).fill(0);
            Object.entries(revenueByDept).forEach(([deptName, data]) => {
                ingresoRows.push({
                    type: 'header',
                    name: deptName,
                    values: data.subtotal
                });
                data.rows.forEach(row => ingresoRows.push({ ...row, type: 'item', dept: deptName }));
                data.subtotal.forEach((v, i) => ingresoSubtotal[i] += v);
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
                data.rows.forEach(row => {
                    gastoRows.push({
                        type: 'item',
                        dept: data.dept,
                        name: data.name,
                        values: row.values,
                        metadata: row.metadata,
                        editable: true
                    });
                });
                data.subtotal.forEach((v, i) => gastoSubtotal[i] += v);
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
                    const serviceName = rev.service?.name || rev.description || 'Otros';
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
                    'IMMORALIA_SETUP': 'Setup inicial IA',
                    'AGENCY_AUTO': 'Automation',
                    'CONSULTING_AUTO': 'Consultoría',
                    'WEB_DEV': 'Web dev',
                    'SEO': 'SEO',
                    'MKT_AUTO_EMAIL': 'CRM',
                    'OTHER_HOURS': 'Otros servicios',
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
                ...buildDeptRows('Imcontent', ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers']),
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
                console.warn(`Service not found for ${dept} - ${item}`);
            }
        } else {
            const { data: catData } = await supabase.from('expense_categories').select('id').eq('name', item).maybeSingle();
            if (catData) {
                categoryId = catData.id;
            } else {
                // Auto-create expense category if not found
                const code = item.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') + '_' + Date.now().toString(36).slice(-6);
                const { data: newCat, error: catErr } = await supabase.from('expense_categories')
                    .insert({ name: item, code: code, is_general: false })
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

        if (type === 'budget') {
            // BUDGET SAVE
            if (!categoryId && !serviceId) throw new Error(`Category/Service not found for ${item} in ${dept}`);

            let query = supabase.from('budget_lines')
                .select('id, cell_metadata')
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
                await supabase.from('budget_lines')
                    .update({
                        [monthKey]: Number(value),
                        cell_metadata: newMeta,
                        notes: item
                    })
                    .eq('id', existingLine.id);
            } else {
                const insertMeta = {};
                if (comment || (assigned_to && assigned_to.length > 0)) {
                    insertMeta[monthKey] = { comment, assigned_to, updated_at: new Date().toISOString() };
                }

                await supabase.from('budget_lines').insert({
                    fiscal_year: year,
                    department_id: departmentId,
                    line_type: section === 'revenue' ? 'revenue' : 'expense',
                    service_id: serviceId,
                    expense_category_id: categoryId,
                    [monthKey]: Number(value),
                    notes: item,
                    cell_metadata: insertMeta
                });
            }

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
                    .select('id')
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

                return res.json({ success: true });
            }

            if (!categoryId) throw new Error(`Category not found for expense item: ${item}`);

            // Query for existing expense record
            let expQuery = supabase
                .from('actual_expenses')
                .select('id, cell_metadata')
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

export default router;
