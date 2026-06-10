import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// Get Dashboard KPIs
// Get Dashboard KPIs
router.get('/kpis/:year', async (req, res) => {
    const { year } = req.params;

    try {
        console.log(`Fetching dashboard data for year ${year}...`);

        const [billingDetailsResult, expenseResult, paymentResult, recentResult, departmentsResult] = await Promise.all([
            // 1. Billing Details (Granular Income by Dept)
            supabase
                .from('billing_details')
                .select(`
                  amount,
                  departments!inner (code, name),
                  monthly_billing!inner (fiscal_year)
                `)
                .eq('monthly_billing.fiscal_year', year),

            // 2. Expenses (Granular Expenses by Dept)
            supabase
                .from('actual_expenses')
                .select(`
                  amount,
                  departments (code, name)
                `)
                .eq('fiscal_year', year),

            // 3. Pending Payments
            supabase
                .from('payment_schedule')
                .select('id, payment_concept, payee_name, total_amount, due_date')
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(5),

            // 4. Recent Activity
            supabase
                .from('monthly_billing')
                .select('client_name, grand_total, updated_at')
                .order('updated_at', { ascending: false })
                .limit(5),

            // 5. All Departments (to show empty ones)
            supabase
                .from('departments')
                .select('code, name')
                .order('name')
        ]);

        if (billingDetailsResult.error) throw billingDetailsResult.error;
        if (expenseResult.error) throw expenseResult.error;
        if (departmentsResult.error) throw departmentsResult.error;
        // Don't throw for recentResult/paymentResult if possible, but safe to throw for critical ones

        // --- Process Data MATCHING P&L LOGIC ---

        // 1. Initialize Department Buckets (Strict P&L Structure)
        // PRE-FILL ALL DEPARTMENTS to ensure they appear even if empty.
        const deptStats = {
            'IMMED': { name: 'Immedia', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMCONT': { name: 'Imcontent', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMMOR': { name: 'Immoralia', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMSEO': { name: 'Imseo', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMSALES': { name: 'Imsales', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMFASHION': { name: 'Imfashion', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMMORAL': { name: 'Immoral', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } },
            'IMFILMS': { name: 'Imfilms', income: 0, expenses: 0, breakdown: { personal: 0, software: 0, marketing: 0, formacion: 0, adspent: 0, commissions: 0, other: 0 } }
        };

        // Helper to get bucket key from DB code
        const getBucket = (code) => {
            if (!code) return 'IMMORAL';
            const c = code.toUpperCase();
            if (deptStats[c]) return c;
            // Map aliases
            if (c === 'IMLOYAL') return 'IMSEO';
            if (c === 'IMMORAL_GENERAL') return 'IMMORAL';
            return 'IMMORAL'; // Default fallback
        };

        // SERVICE MAPPING (Whitelist from P&L)
        // Only services in this list (or Paid Media) are counted in Revenue.
        const serviceMapping = {
            'PAID_MEDIA_SETUP': 'IMMED',
            'BRANDING': 'IMCONT',
            'CONTENT_DESIGN': 'IMCONT',
            'AI_CONTENT': 'IMCONT',
            'SOCIAL_MEDIA_MGMT': 'IMCONT',
            'DIGITAL_STRATEGY': 'IMCONT',
            'INFLUENCER_UGC': 'IMCONT',
            'IMMORALIA_SETUP': 'IMMOR',
            'AGENCY_AUTO': 'IMMOR',
            'CONSULTING_AUTO': 'IMMOR',
            'WEB_DEV': 'IMSEO',
            'SEO': 'IMSEO',
            'MKT_AUTO_EMAIL': 'IMSEO',
            'CAPTACION': 'IMSALES',
            'BUDGET_NUTFRUIT': 'IMCONT'
        };

        // 2. Calculate INCOME (Revenue)
        const currentYear = new Date().getFullYear();
        const isPastYear = parseInt(year) < currentYear;

        if (isPastYear) {
            // Años pasados: los ingresos están en actual_revenue
            const { data: arData } = await supabase
                .from('actual_revenue')
                .select('amount, description, department_id, departments(code), service:services(code)')
                .eq('fiscal_year', year);

            // Mapeo de nombre de descripción / código de servicio → bucket
            const descToBucket = {
                'Paid General': 'IMMED', 'Paid imfilms': 'IMMED', 'Setup inicial': 'IMMED',
                'Branding': 'IMCONT', 'Diseño': 'IMCONT', 'Contenido con IA': 'IMCONT',
                'RRSS': 'IMCONT', 'Estrategia Digital': 'IMCONT', 'Influencers': 'IMCONT',
                'Diseño de Landing': 'IMCONT', 'Budget Nutfruit': 'IMCONT',
                'Setup inicial IA': 'IMMOR', 'Automation': 'IMMOR', 'Consultoría': 'IMMOR',
                'Web dev': 'IMSEO', 'CRM': 'IMSEO', 'SEO': 'IMSEO',
                'Setup inicial (ims)': 'IMSALES', 'Captación': 'IMSALES',
                'Otros servicios': 'IMMORAL', 'Otras comisiones': 'IMMORAL',
            };

            (arData || []).forEach(r => {
                const amount = Number(r.amount || 0);
                if (!amount) return;
                const svcCode = r.service?.code;
                const desc = r.description;
                // Intentar por código de servicio primero, luego por descripción, luego por dept
                let bucket = svcCode && serviceMapping[svcCode]
                    ? serviceMapping[svcCode]
                    : (desc && descToBucket[desc])
                        ? descToBucket[desc]
                        : getBucket(r.departments?.code);
                if (deptStats[bucket]) deptStats[bucket].income += amount;
            });
        } else {
            // Año actual / futuro: ingresos desde monthly_billing y billing_details
            const mbMap = {};
            const monthlyBillings = await supabase
                .from('monthly_billing')
                .select('id, fee_paid, client_id, client:clients(vertical:verticals(name))')
                .eq('fiscal_year', year);

            if (monthlyBillings.data) {
                monthlyBillings.data.forEach(mb => {
                    mbMap[mb.id] = mb;
                    const feePaid = Number(mb.fee_paid || 0);
                    if (feePaid > 0) {
                        const vertical = mb.client?.vertical?.name || '';
                        if (vertical.toLowerCase() === 'imfilms') {
                            deptStats['IMFILMS'].income += feePaid;
                            deptStats['IMMED'].income += feePaid;
                        } else {
                            deptStats['IMMED'].income += feePaid;
                        }
                    }
                });
            }

            const { data: billDetails } = await supabase
                .from('billing_details')
                .select(`amount, department_id, departments (code), services (code), monthly_billing!inner (fiscal_year)`)
                .eq('monthly_billing.fiscal_year', year);

            if (billDetails) {
                billDetails.forEach(d => {
                    const svcCode = d.services?.code;
                    if (!svcCode || svcCode === 'PAID_MEDIA_STRATEGY') return;
                    const targetBucket = serviceMapping[svcCode];
                    if (targetBucket && deptStats[targetBucket]) {
                        deptStats[targetBucket].income += Number(d.amount || 0);
                    }
                });
            }
        }

        // 3. Process EXPENSES (Actual Expenses + Payroll)
        // Detailed Mapping based on P&L Structure (Names from DB)
        const getExpenseCategoryGroup = (exp) => {
            if (exp && exp.description) {
                // Only use description as section_key if it's a valid known section key
                const VALID_SECTION_KEYS = new Set(['personal', 'comisiones', 'marketing', 'formacion', 'software', 'gastosOp', 'adspent']);
                if (VALID_SECTION_KEYS.has(exp.description)) {
                    if (exp.description === 'gastosOp') return 'other';
                    if (exp.description === 'comisiones') return 'commissions';
                    return exp.description;
                }
            }

            // Fallback: Exact match
            const catName = (exp && exp.category && exp.category.name) ? exp.category.name : ((typeof exp === 'string') ? exp : '');
            const n = catName || '';
            
            // Personal
            if (['Alba', 'Andrés', 'Leidy', 'Yue', 'Flor', 'Bruno', 'Grego', 'Silvia', 'Angie', 'David', 'Manel', 'Daniel', 'Mery', 'Yure', 'Marco', 'Jorge Orts', 'Externos', 'Externos puntuales', 'Gastos de Personal'].includes(n)) return 'personal';
            // Marketing
            if (n === 'Marketing') return 'marketing';
            // Formación
            if (n === 'Formación' || n === 'Formacion') return 'formacion';
            // Software
            if (n === 'Software') return 'software';
            // Adspent (Influencers goes here for Imcontent per user request)
            if (['Adspent', 'Adspent Nutfruit', 'Influencers'].includes(n)) return 'adspent';
            // Commissions
            if (['The connector', 'Marc', 'Christian', 'Gemelos', 'Jorge', 'Olga', 'Comisiones', 'Otras comisiones'].includes(n)) return 'commissions';

            return 'other';
        };

        const { data: expenses } = await supabase
            .from('actual_expenses')
            .select(`
                amount,
                description,
                department_id,
                departments (code),
                category:expense_categories (name)
            `)
            .eq('fiscal_year', year);

        if (expenses) {
            expenses.forEach(item => {
                const code = item.departments?.code;
                const bucket = getBucket(code);
                const catName = item.category?.name || 'Other';
                const amount = Number(item.amount || 0);

                deptStats[bucket].expenses += amount;

                // Breakdown using detailed map
                const group = getExpenseCategoryGroup(item);
                if (deptStats[bucket].breakdown && deptStats[bucket].breakdown[group] !== undefined) {
                    deptStats[bucket].breakdown[group] += amount;
                } else {
                    // Fallback to other
                    if (deptStats[bucket].breakdown) deptStats[bucket].breakdown.other += amount;
                }
            });
        }

        // 3b. Payroll (Fetch separately as it was not in original query)
        const { data: payrollResult } = await supabase
            .from('monthly_payroll')
            .select(`
                total_cost,
                employee:employees (department_id)
            `)
            .eq('fiscal_year', year);

        // Need ID -> Code map
        const { data: depts } = await supabase.from('departments').select('id, code');
        const deptIdToCode = {};
        depts?.forEach(d => deptIdToCode[d.id] = d.code);

        if (payrollResult) {
            payrollResult.forEach(p => {
                const deptId = p.employee?.department_id;
                const code = deptIdToCode[deptId];
                const bucket = getBucket(code);
                const amount = Number(p.total_cost || 0);

                deptStats[bucket].expenses += amount;
                if (deptStats[bucket].breakdown) deptStats[bucket].breakdown.personal += amount;
            });
        }

        // 4. Aggregate IMFILMS expenses into IMMED (Immedia card = Core + Imfilms)
        // We do this AFTER all processing so IMFILMS standalone card keeps its own data
        const imfilmsExpenses = deptStats['IMFILMS'].expenses;
        const imfilmsBreakdown = { ...deptStats['IMFILMS'].breakdown };
        deptStats['IMMED'].expenses += imfilmsExpenses;
        // Merge breakdown
        Object.keys(imfilmsBreakdown).forEach(key => {
            if (deptStats['IMMED'].breakdown[key] !== undefined) {
                deptStats['IMMED'].breakdown[key] += imfilmsBreakdown[key];
            }
        });

        // 5. Calculate Margins and Format
        // For KPI totals, subtract Imfilms to avoid double-counting (since it's already in IMMED)
        const allDepts = Object.entries(deptStats);
        const totalBilling = allDepts.reduce((sum, [code, d]) => {
            if (code === 'IMFILMS') return sum; // skip, already in IMMED
            return sum + d.income;
        }, 0);
        const totalExpensesAggr = allDepts.reduce((sum, [code, d]) => {
            if (code === 'IMFILMS') return sum; // skip, already in IMMED
            return sum + d.expenses;
        }, 0);

        const departmentPerformance = Object.entries(deptStats)
            .map(([code, d]) => ({
                ...d,
                code,
                margin: d.income - d.expenses,
                marginPct: d.income > 0 ? ((d.income - d.expenses) / d.income) * 100 : 0
            }))
            .sort((a, b) => b.income - a.income);

        res.json({
            kpis: {
                totalBilling,
                totalExpenses: totalExpensesAggr,
                netMargin: totalBilling - totalExpensesAggr,
                marginPercentage: totalBilling > 0 ? ((totalBilling - totalExpensesAggr) / totalBilling) * 100 : 0
            },
            departmentPerformance,
            pendingPayments: paymentResult.data || [],
            recentActivity: recentResult.data || []
        });

    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
