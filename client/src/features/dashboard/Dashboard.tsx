import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useUrlState } from '@/hooks/useUrlState';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Settings2,
    MoreHorizontal,
    BarChart3,
    LayoutDashboard,
    FileText,
    Landmark,
    AlertCircle,
    X
} from 'lucide-react';

const DashboardDetalle = lazy(() => import('./DashboardDetalle'));

// Widget Types
type WidgetType = 'kpis' | 'departments';
type TimePeriod = 'monthly' | 'quarterly' | 'annual';
type DashboardTab = 'general' | 'detalle';

// Map department_code from profile to route slug
const DEPT_ROUTE_MAP: Record<string, string> = {
    immedia: 'immedia',
    imcontent: 'imcontent',
    immoralia: 'immoralia',
    imsales: 'imsales',
    IMMED: 'immedia',
    IMCONT: 'imcontent',
    IMMOR: 'immoralia',
    IMSALES: 'imsales',
};

// ========== P&L STRUCTURE (same as DepartmentPL — single source of truth) ==========
const REVENUE_STRUCTURE = [
    { dept: 'Immedia', services: ['Paid General', 'Paid imfilms', 'Setup inicial'] },
    { dept: 'Imcontent', services: ['Branding', 'Diseño', 'Contenido con IA', 'RRSS', 'Estrategia Digital', 'Influencers'] },
    { dept: 'Immoralia', services: ['Setup inicial IA', 'Automation', 'Consultoría'] },
    { dept: 'Imloyal', services: ['Web dev', 'CRM', 'Comisiones'] },
    { dept: 'Imseo', services: ['SEO', 'Comisiones'] },
    { dept: 'Immoral', services: ['Otros servicios', 'Otras comisiones'] },
    { dept: 'Imcontent', services: ['Budget Nutfruit'] },
    { dept: 'Imsales', services: ['Setup inicial (ims)'] },
    { dept: 'Imsales', services: ['Captación'] },
];

const EXPENSE_STRUCTURE = {
    personalItems: [
        { dept: 'Immedia', items: ['Alba', 'Andrés', 'Leidy'] },
        { dept: 'Imcontent', items: ['Flor', 'Bruno', 'Grego', 'Silvia', 'Angie'] },
        { dept: 'Immoralia', items: ['David', 'Manel'] },
        { dept: 'Immoral', items: ['Daniel', 'Mery', 'Yure', 'Marco', 'Externos puntuales'] },
        { dept: 'Immedia', items: ['Externos'] },
        { dept: 'Imcontent', items: ['Externos'] },
        { dept: 'Immoralia', items: ['Externos'] },
        { dept: 'Imsales', items: ['Jorge Orts'] },
        { dept: 'Imfilms', items: ['Olga Garasym'] },
    ],
    comisionesItems: [
        { dept: 'Imfilms', items: ['The connector'] },
        { dept: 'Imcontent', items: ['Marc'] },
        { dept: 'Imseo', items: ['Christian'] },
        { dept: 'Imfashion', items: ['Gemelos'] },
        { dept: 'Imsales', items: ['Jorge'] },
        { dept: 'Imfilms', items: ['Olga'] },
        { dept: 'Immoralia', items: ['David'] },
    ],
    marketingItems: [
        { dept: 'Imfilms', items: ['Marketing'] },
        { dept: 'Imcontent', items: ['Marketing'] },
        { dept: 'Immedia', items: ['Marketing'] },
        { dept: 'Immoralia', items: ['Marketing'] },
        { dept: 'Imsales', items: ['Marketing'] },
        { dept: 'Immoral', items: ['Marketing'] },
        { dept: 'Imfashion', items: ['Marketing'] },
    ],
    formacionItems: [
        { dept: 'Imcontent', items: ['Formación'] },
        { dept: 'Immedia', items: ['Formación'] },
        { dept: 'Immoralia', items: ['Formación'] },
        { dept: 'Imsales', items: ['Formación'] },
        { dept: 'Immoral', items: ['Formación'] },
        { dept: 'Imfashion', items: ['Formación'] },
    ],
    softwareItems: [
        { dept: 'Immoral', items: ['Software'] },
        { dept: 'Immedia', items: ['Software'] },
        { dept: 'Imcontent', items: ['Software'] },
        { dept: 'Immoralia', items: ['Software'] },
        { dept: 'Imsales', items: ['Software'] },
    ],
    gastosOpItems: [
        { dept: 'Immoral', items: ['Alquiler', 'Asesoría', 'Suministros', 'Viajes y reuniones', 'Coche de empresa', 'Otras compras', 'Financiamiento (Línea de crédito)'] },
    ],
    adspentItems: [
        { dept: 'Immedia', items: ['Adspent'] },
        { dept: 'Imcontent', items: ['Adspent Nutfruit', 'Influencers'] },
    ]
};

// Department display config
const DEPT_CONFIGS: Record<string, {
    label: string;
    deptNames: string[];
    expenseCategories: { label: string; key: string }[];
    // Optional override: custom revenue lookup (for verticals whose P&L revenue row lives under a different dept)
    revenueOverride?: { dept: string; services: string[] }[];
}> = {
    Immedia: {
        label: 'Immedia',
        deptNames: ['Immedia'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
            { label: 'Adspent', key: 'adspent' },
        ],
    },
    Imcontent: {
        label: 'Imcontent',
        deptNames: ['Imcontent'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
            { label: 'Adspent / Influencers', key: 'adspent' },
        ],
    },
    Immoralia: {
        label: 'Immoralia',
        deptNames: ['Immoralia'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
        ],
    },
    Immoral: {
        label: 'Immoral',
        deptNames: ['Immoral'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
            { label: 'Gastos Operativos', key: 'gastosOp' },
        ],
    },
    Imseo: {
        label: 'Imseo',
        deptNames: ['Imseo'],
        expenseCategories: [
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
        ],
    },
    Imloyal: {
        label: 'Imloyal',
        deptNames: ['Imloyal'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Software', key: 'software' },
        ],
    },
    Imsales: {
        label: 'Imsales',
        deptNames: ['Imsales'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
            { label: 'Software', key: 'software' },
        ],
    },
    Imfilms: {
        label: 'Imfilms',
        deptNames: ['Imfilms'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
        ],
        // Imfilms vertical revenue = "Paid imfilms" in the P&L (under Immedia dept)
        revenueOverride: [
            { dept: 'Immedia', services: ['Paid imfilms'] },
        ],
    },
    Imfashion: {
        label: 'Imfashion',
        deptNames: ['Imfashion'],
        expenseCategories: [
            { label: 'Personal', key: 'personal' },
            { label: 'Comisiones', key: 'comisiones' },
            { label: 'Marketing', key: 'marketing' },
            { label: 'Formación', key: 'formacion' },
        ],
    },
};

// Map expense structure keys
const EXPENSE_KEY_MAP: Record<string, { dept: string; items: string[] }[]> = {
    personal: EXPENSE_STRUCTURE.personalItems,
    comisiones: EXPENSE_STRUCTURE.comisionesItems,
    marketing: EXPENSE_STRUCTURE.marketingItems,
    formacion: EXPENSE_STRUCTURE.formacionItems,
    software: EXPENSE_STRUCTURE.softwareItems,
    gastosOp: EXPENSE_STRUCTURE.gastosOpItems,
    adspent: EXPENSE_STRUCTURE.adspentItems,
};

// ALL expense categories for iterating
const ALL_EXPENSE_KEYS = Object.keys(EXPENSE_KEY_MAP);

const HUB_CORE = ['Immedia', 'Imcontent', 'Immoralia'];
const HUB_OPTIONAL = ['Imloyal', 'Imseo', 'Immoral', 'Imsales'];
const VERTICAL_ONLY = ['Imfilms', 'Imfashion'];

const DEPT_DOT_COLORS: Record<string, string> = {
    Immedia: '#6366f1',
    Imcontent: '#ec4899',
    Immoralia: '#f59e0b',
    Imloyal: '#10b981',
    Imseo: '#3b82f6',
    Immoral: '#8b5cf6',
    Imsales: '#ef4444',
    Imfilms: '#14b8a6',
    Imfashion: '#f97316',
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const QUARTERS = [
    { label: 'Q1', months: [0, 1, 2] },
    { label: 'Q2', months: [3, 4, 5] },
    { label: 'Q3', months: [6, 7, 8] },
    { label: 'Q4', months: [9, 10, 11] },
];

export default function Dashboard() {
    const { isDeptHead, isPartner, profile } = useAuth();

    // Redirect dept_head to their own department dashboard
    if (isDeptHead() && profile?.department_code) {
        const slug = DEPT_ROUTE_MAP[profile.department_code] || profile.department_code.toLowerCase();
        return <Navigate to={`/departamentos/${slug}`} replace />;
    }

    // Redirect partner to their commissions view
    if (isPartner()) {
        return <Navigate to="/commissions" replace />;
    }

    return <DashboardContent />;
}

function DashboardContent() {
    const { isSuperAdmin } = useAuth();
    const [year] = useState(new Date().getFullYear());
    const [visibleWidgets, setVisibleWidgets] = useState<Record<WidgetType, boolean>>({
        kpis: true,
        departments: true,
    });
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [deptFilter, setDeptFilter] = useUrlState<'all' | 'main' | 'verticals'>('depts', 'main');
    const [visibleVerticals, setVisibleVerticals] = useState<Set<string>>(new Set());
    const [dashboardTab, setDashboardTab] = useUrlState<DashboardTab>('tab', 'general');
    const [showGroupForCards, setShowGroupForCards] = useState<Set<string>>(new Set());

    // Holded invoice detail modal
    const [holdedDetailType, setHoldedDetailType] = useState<'pending' | 'overdue' | null>(null);
    const [holdedDetailInvoices, setHoldedDetailInvoices] = useState<any[]>([]);
    const [holdedDetailLoading, setHoldedDetailLoading] = useState(false);

    const openHoldedDetail = async (type: 'pending' | 'overdue') => {
        setHoldedDetailType(type);
        setHoldedDetailLoading(true);
        try {
            const res = await adminApi.getHoldedInvoices();
            const invoices = res?.invoices || [];
            const now = Math.floor(Date.now() / 1000);
            const filtered = invoices.filter((inv: any) => {
                if (inv.status === 1 || inv.status === 3) return false; // exclude paid & cancelled
                if (type === 'overdue') return inv.dueDate && inv.dueDate < now;
                return !inv.dueDate || inv.dueDate >= now; // pending = not yet overdue
            });
            setHoldedDetailInvoices(filtered);
        } catch {
            setHoldedDetailInvoices([]);
        }
        setHoldedDetailLoading(false);
    };

    // Time period state
    const [timePeriod, setTimePeriod] = useUrlState<TimePeriod>('period', 'annual');
    const [selectedMonth, setSelectedMonth] = useUrlState('month', new Date().getMonth(), (v) => Number(v));
    const [selectedQuarter, setSelectedQuarter] = useUrlState('quarter', Math.floor(new Date().getMonth() / 3), (v) => Number(v));

    // Get active months based on time period
    const activeMonths = useMemo(() => {
        if (timePeriod === 'monthly') return [selectedMonth];
        if (timePeriod === 'quarterly') return QUARTERS[selectedQuarter].months;
        return Array.from({ length: 12 }, (_, i) => i);
    }, [timePeriod, selectedMonth, selectedQuarter]);

    // Load configs from local storage
    useEffect(() => {
        const saved = localStorage.getItem('dashboard_config');
        if (saved) {
            try {
                setVisibleWidgets(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse dashboard config", e);
            }
        }
    }, []);

    const toggleWidget = (widget: WidgetType) => {
        const newConfig = { ...visibleWidgets, [widget]: !visibleWidgets[widget] };
        setVisibleWidgets(newConfig);
        localStorage.setItem('dashboard_config', JSON.stringify(newConfig));
    };

    // Fetch PL matrix (REAL) to compute department cards FROM SAME SOURCE as DepartmentPL
    const { data: plRealData, isLoading: isLoadingPL } = useQuery({
        queryKey: ['pl-matrix', year, 'real'],
        queryFn: () => adminApi.getPLMatrix(year, 'real'),
    });

    // Custom rows for dynamic structures — filtered by year
    const { data: customRowsData } = useQuery({
        queryKey: ['pl-custom-rows', year],
        queryFn: () => adminApi.getCustomRows(year),
        staleTime: 60000,
    });
    const customRows = customRowsData?.rows || [];

    const mergedExpenseKeyMap = useMemo(() => {
        const expCustom = customRows.filter((r: any) => r.block_type === 'expense');
        const merged: Record<string, { dept: string; items: string[] }[]> = {};
        Object.keys(EXPENSE_KEY_MAP).forEach(k => {
            merged[k] = EXPENSE_KEY_MAP[k].map(g => ({ ...g, items: [...g.items] }));
        });
        expCustom.forEach((cr: any) => {
            if (!merged[cr.section_key]) return;
            let group = merged[cr.section_key].find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, items: [] };
                merged[cr.section_key].push(group);
            }
            if (!group.items.includes(cr.item_name)) group.items.push(cr.item_name);
        });
        return merged;
    }, [customRows]);

    const mergedRevenueStructure = useMemo(() => {
        const revCustom = customRows.filter((r: any) => r.block_type === 'revenue');
        const merged = REVENUE_STRUCTURE.map(g => ({ ...g, services: [...g.services] }));
        revCustom.forEach((cr: any) => {
            let group = merged.find(g => g.dept === cr.dept);
            if (!group) {
                group = { dept: cr.dept, services: [] };
                merged.push(group);
            }
            if (!group.services.includes(cr.item_name)) group.services.push(cr.item_name);
        });
        return merged;
    }, [customRows]);

    // Build lookup from PL matrix rows — SAME format as DepartmentPL
    // Build reverse mapping: "dept::item" → [sectionKey, ...]
    const dashExpenseSectionMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        Object.entries(mergedExpenseKeyMap).forEach(([sectionKey, deptItems]) => {
            deptItems.forEach(({ dept, items }) => {
                items.forEach(item => {
                    const k = `${dept}::${item}`;
                    if (!map[k]) map[k] = [];
                    if (!map[k].includes(sectionKey)) map[k].push(sectionKey);
                });
            });
        });
        return map;
    }, [mergedExpenseKeyMap]);

    // Build lookup from PL matrix rows — uses section keys for expenses (same as DepartmentPL)
    const plValues = useMemo(() => {
        const vals: Record<string, number> = {};
        if (plRealData?.sections) {
            const revenueSection = plRealData.sections.find((s: any) => s.code === 'REVENUE');
            revenueSection?.rows?.forEach((row: any) => {
                if (row.values && row.dept && row.name) {
                    row.values.forEach((val: number, monthIdx: number) => {
                        vals[`revenue-${row.dept}-${row.name}-${monthIdx}`] = val || 0;
                    });
                }
            });
            const expenseSection = plRealData.sections.find((s: any) => s.code === 'EXPENSES');
            if (expenseSection?.rows) {
                // Process legacy rows first, then section_key rows second
                const legacyRows = expenseSection.rows.filter((r: any) => !r.section_key);
                const sectionKeyRows = expenseSection.rows.filter((r: any) => !!r.section_key);

                legacyRows.forEach((row: any) => {
                    if (row.values && row.name && Array.isArray(row.values)) {
                        const dept = row.dept || 'General';
                        row.values.forEach((val: number, monthIdx: number) => {
                            const mapKey = `${dept}::${row.name}`;
                            const ms = dashExpenseSectionMap[mapKey];
                            if (ms && ms.length > 0) {
                                ms.forEach(sk => { vals[`${sk}-${dept}-${row.name}-${monthIdx}`] = val || 0; });
                            } else {
                                vals[`expense-${dept}-${row.name}-${monthIdx}`] = val || 0;
                            }
                        });
                    }
                });

                sectionKeyRows.forEach((row: any) => {
                    if (row.values && row.name && Array.isArray(row.values)) {
                        const dept = row.dept || 'General';
                        row.values.forEach((val: number, monthIdx: number) => {
                            vals[`${row.section_key}-${dept}-${row.name}-${monthIdx}`] = val || 0;
                        });
                    }
                });
            }
        }
        return vals;
    }, [plRealData, dashExpenseSectionMap]);

    // Helper: get value from PL lookup — uses section key directly (matches key format in plValues)
    const getVal = (section: string, dept: string, item: string, month: number): number => {
        return plValues[`${section}-${dept}-${item}-${month}`] || 0;
    };

    // Compute department performance from PL matrix
    const deptPerformance = useMemo(() => {
        if (!plRealData?.sections) return [];

        // Total general revenue per month (for Group %)
        const totalGenRevenue = Array(12).fill(0);
        mergedRevenueStructure.forEach(g => {
            g.services.forEach(s => {
                for (let m = 0; m < 12; m++) {
                    totalGenRevenue[m] += getVal('revenue', g.dept, s, m);
                }
            });
        });

        // ALL Immoral expenses per month (for Group % distribution)
        // This includes personal, marketing, formación, software, gastosOp — ALL categories where dept=Immoral
        const immoralExpensesMonthly = Array(12).fill(0);
        ALL_EXPENSE_KEYS.forEach(catKey => {
            const items = mergedExpenseKeyMap[catKey] || [];
            items.filter(g => g.dept === 'Immoral').forEach(g => {
                g.items.forEach(item => {
                    for (let m = 0; m < 12; m++) {
                        immoralExpensesMonthly[m] += getVal(catKey, g.dept, item, m);
                    }
                });
            });
        });

        return Object.entries(DEPT_CONFIGS).map(([deptKey, config]) => {
            // Revenue (filtered by active months)
            // Use revenueOverride if defined, otherwise standard REVENUE_STRUCTURE filter
            const revenueSource = config.revenueOverride
                ? config.revenueOverride
                : mergedRevenueStructure.filter(g => config.deptNames.includes(g.dept));
            let income = 0;
            revenueSource.forEach(g => {
                g.services.forEach(s => {
                    for (const m of activeMonths) {
                        income += getVal('revenue', g.dept, s, m);
                    }
                });
            });

            // Expenses per category (filtered by active months)
            const breakdown: Record<string, number> = {};
            let totalExpenses = 0;
            config.expenseCategories.forEach(cat => {
                const items = mergedExpenseKeyMap[cat.key] || [];
                let catTotal = 0;
                items.filter(g => config.deptNames.includes(g.dept))
                    .forEach(g => {
                        g.items.forEach(item => {
                            for (const m of activeMonths) {
                                catTotal += getVal(cat.key, g.dept, item, m);
                            }
                        });
                    });
                breakdown[cat.key] = catTotal;
                totalExpenses += catTotal;
            });

            // Group % = dept revenue per month / total general revenue per month
            // Applied to ALL Immoral expenses (not just gastosOp)
            let groupCostPeriod = 0;
            const deptRevMonthly = Array(12).fill(0);
            revenueSource.forEach(g => {
                g.services.forEach(s => {
                    for (let m = 0; m < 12; m++) {
                        deptRevMonthly[m] += getVal('revenue', g.dept, s, m);
                    }
                });
            });

            for (const m of activeMonths) {
                const pct = totalGenRevenue[m] > 0 ? deptRevMonthly[m] / totalGenRevenue[m] : 0;
                groupCostPeriod += immoralExpensesMonthly[m] * pct;
            }

            // Group % (billing share over active months)
            const totalGenRevenueActive = activeMonths.reduce((sum, m) => sum + totalGenRevenue[m], 0);
            const groupPctPeriod = totalGenRevenueActive > 0
                ? (income / totalGenRevenueActive) * 100
                : 0;

            // Don't add Group cost for Immoral itself (it IS the source)
            const isImmoral = deptKey === 'Immoral';
            const finalGroupCost = isImmoral ? 0 : groupCostPeriod;

            const totalWithGroup = totalExpenses + finalGroupCost;
            const margin = income - totalWithGroup;
            const marginPct = income > 0 ? (margin / income) * 100 : 0;

            return {
                name: config.label,
                key: deptKey,
                income: Math.round(income * 100) / 100,
                expenses: Math.round(totalWithGroup * 100) / 100,
                directExpenses: Math.round(totalExpenses * 100) / 100,
                margin: Math.round(margin * 100) / 100,
                marginPct,
                groupPctAnnual: Math.round(groupPctPeriod * 10) / 10,
                groupPctDisplay: Math.round(groupPctPeriod * 10) / 10,
                groupCost: Math.round(finalGroupCost * 100) / 100,
                breakdown,
                categories: config.expenseCategories,
            };
        });
    }, [plValues, plRealData, activeMonths, mergedRevenueStructure, mergedExpenseKeyMap]);

    // Compute KPIs from PL matrix — Total Expenses = sum of ALL direct P&L expense lines (no Group redistribution)
    const plKpis = useMemo(() => {
        let totalBilling = 0;

        // Revenue: sum all revenue structure items across active months
        mergedRevenueStructure.forEach(g => {
            g.services.forEach(s => {
                for (const m of activeMonths) {
                    totalBilling += getVal('revenue', g.dept, s, m);
                }
            });
        });

        // Expenses: sum ALL expense lines from ALL categories across active months (direct from P&L, no redistribution)
        let totalExpenses = 0;
        ALL_EXPENSE_KEYS.forEach(catKey => {
            const items = mergedExpenseKeyMap[catKey] || [];
            items.forEach(g => {
                g.items.forEach(item => {
                    for (const m of activeMonths) {
                        totalExpenses += getVal(catKey, g.dept, item, m);
                    }
                });
            });
        });

        return {
            totalBilling: Math.round(totalBilling * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            netMargin: Math.round((totalBilling - totalExpenses) * 100) / 100,
            marginPercentage: totalBilling > 0 ? ((totalBilling - totalExpenses) / totalBilling) * 100 : 0,
        };
    }, [plValues, activeMonths, mergedRevenueStructure, mergedExpenseKeyMap]);

    const isLoading = isLoadingPL;

    // Holded summary for dashboard cards
    const { data: holdedSummary } = useQuery({
        queryKey: ['holded-summary'],
        queryFn: () => adminApi.getHoldedSummary(),
        staleTime: 300000, // 5 minutes
        retry: 1,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">Cargando datos…</p>
                </div>
            </div>
        );
    }

    const periodLabel = timePeriod === 'monthly'
        ? MONTHS[selectedMonth]
        : timePeriod === 'quarterly'
            ? QUARTERS[selectedQuarter].label
            : 'Anual';

    return (
        <div className="space-y-8 pb-8">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Ejercicio fiscal {year}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Tabs */}
                    <div className="inline-flex bg-muted rounded-xl p-1">
                        {([['general', 'General', LayoutDashboard], ['detalle', 'Análisis', BarChart3]] as const).map(([key, label, Icon]) => (
                            <button
                                key={key}
                                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${dashboardTab === key
                                    ? 'bg-white dark:bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={() => setDashboardTab(key as DashboardTab)}
                            >
                                <Icon size={13} />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Period */}
                    <div className="inline-flex bg-muted rounded-xl p-1">
                        {([['monthly', 'Mes'], ['quarterly', 'Trim.'], ['annual', 'Año']] as const).map(([key, label]) => (
                            <button
                                key={key}
                                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${timePeriod === key
                                    ? 'bg-white dark:bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={() => setTimePeriod(key as TimePeriod)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {timePeriod === 'monthly' && (
                        <select
                            className="h-9 border border-border rounded-xl px-3 text-xs bg-card font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(Number(e.target.value))}
                        >
                            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                    )}
                    {timePeriod === 'quarterly' && (
                        <select
                            className="h-9 border border-border rounded-xl px-3 text-xs bg-card font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={selectedQuarter}
                            onChange={e => setSelectedQuarter(Number(e.target.value))}
                        >
                            {QUARTERS.map((q, i) => (
                                <option key={i} value={i}>{q.label} · {MONTHS[q.months[0]]}–{MONTHS[q.months[2]]}</option>
                            ))}
                        </select>
                    )}

                    {isSuperAdmin() && (
                        <Button
                            variant={isConfiguring ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setIsConfiguring(!isConfiguring)}
                            className="h-9 gap-1.5 text-xs font-semibold"
                        >
                            <Settings2 size={13} />
                            {isConfiguring ? 'Listo' : 'Widgets'}
                        </Button>
                    )}
                </div>
            </div>

            {isConfiguring && (
                <div className="flex items-center gap-5 px-5 py-3.5 bg-muted/50 rounded-xl border border-border text-xs">
                    <span className="font-semibold text-muted-foreground">Secciones:</span>
                    {(['kpis', 'departments'] as WidgetType[]).map(w => (
                        <label key={w} className="flex items-center gap-2 cursor-pointer text-foreground font-medium">
                            <input type="checkbox" checked={visibleWidgets[w]} onChange={() => toggleWidget(w)} className="rounded border-border" />
                            {w === 'kpis' ? 'KPIs' : 'Departamentos'}
                        </label>
                    ))}
                </div>
            )}

            {dashboardTab === 'general' && (
                <>
                    {/* ── KPI Cards ──────────────────────────────────────── */}
                    {visibleWidgets.kpis && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                            {/* Facturación */}
                            <div className="card-executive bg-card rounded-2xl border border-border overflow-hidden">
                                <div className="h-1 w-full bg-blue-500" />
                                <div className="p-4 sm:p-6 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Facturación</p>
                                        <div className="h-8 w-8 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                                            <Wallet size={15} className="text-blue-600 dark:text-blue-400" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular leading-none break-all">{formatCurrency(plKpis.totalBilling)}</p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
                                        <span className="text-xs text-muted-foreground">Ingresos brutos</span>
                                        <span className="text-[11px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{periodLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Gastos */}
                            <div className="card-executive bg-card rounded-2xl border border-border overflow-hidden">
                                <div className="h-1 w-full bg-red-500" />
                                <div className="p-4 sm:p-6 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Gastos</p>
                                        <div className="h-8 w-8 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                                            <TrendingDown size={15} className="text-red-500" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular leading-none break-all">{formatCurrency(plKpis.totalExpenses)}</p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
                                        <span className="text-xs text-muted-foreground">Costes operativos</span>
                                        <span className="text-[11px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{periodLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Resultado */}
                            <div className="card-executive bg-card rounded-2xl border border-border overflow-hidden">
                                <div className={`h-1 w-full ${plKpis.netMargin >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <div className="p-4 sm:p-6 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resultado</p>
                                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${plKpis.netMargin >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                                            <TrendingUp size={15} className={plKpis.netMargin >= 0 ? 'text-emerald-600' : 'text-red-500'} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className={`text-2xl sm:text-3xl font-bold tracking-tight tabular leading-none break-all ${plKpis.netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {plKpis.netMargin >= 0 ? '+' : ''}{formatCurrency(plKpis.netMargin)}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
                                        <span className="text-xs text-muted-foreground">Beneficio neto</span>
                                        <span className="text-[11px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{periodLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Margen % */}
                            <div className="card-executive bg-card rounded-2xl border border-border overflow-hidden">
                                <div className={`h-1 w-full ${plKpis.marginPercentage >= 0 ? 'bg-violet-500' : 'bg-red-500'}`} />
                                <div className="p-4 sm:p-6 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Margen</p>
                                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${plKpis.marginPercentage >= 0 ? 'bg-violet-50 dark:bg-violet-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                                            <BarChart3 size={15} className={plKpis.marginPercentage >= 0 ? 'text-violet-600' : 'text-red-500'} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className={`text-2xl sm:text-3xl font-bold tracking-tight tabular leading-none ${plKpis.marginPercentage >= 0 ? 'text-violet-600' : 'text-red-600'}`}>
                                            {plKpis.marginPercentage.toFixed(1)}%
                                        </p>
                                    </div>
                                    <div className="border-t border-border pt-3 mt-auto">
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${plKpis.marginPercentage >= 0 ? 'bg-violet-500' : 'bg-red-500'}`}
                                                style={{ width: `${Math.min(100, Math.max(0, Math.abs(plKpis.marginPercentage)))}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Department Performance ──────────────────────────── */}
                    {visibleWidgets.departments && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <h2 className="text-base font-bold tracking-tight text-foreground">Rendimiento por departamento</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · {year}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {deptFilter === 'main' && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {HUB_OPTIONAL.map(v => (
                                                <label key={v} className={`flex items-center gap-1.5 text-xs cursor-pointer px-3 py-1.5 rounded-lg transition-all border font-semibold ${visibleVerticals.has(v) ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/60 bg-card'}`}>
                                                    <input type="checkbox" className="sr-only" checked={visibleVerticals.has(v)} onChange={(e) => setVisibleVerticals(prev => { const s = new Set(prev); e.target.checked ? s.add(v) : s.delete(v); return s; })} />
                                                    {v}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                    <div className="inline-flex bg-muted rounded-xl p-1">
                                        {([['main', 'Hubs'], ['verticals', 'Verticales'], ['all', 'Todos']] as const).map(([key, label]) => (
                                            <button key={key}
                                                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${deptFilter === key ? 'bg-white dark:bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => setDeptFilter(key)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {deptPerformance
                                    .filter(dept => {
                                        if (deptFilter === 'all') return true;
                                        if (deptFilter === 'main') return HUB_CORE.includes(dept.name) || (HUB_OPTIONAL.includes(dept.name) && visibleVerticals.has(dept.name));
                                        return VERTICAL_ONLY.includes(dept.name);
                                    })
                                    .sort((a, b) => b.income - a.income)
                                    .map(dept => {
                                        const isVertical = VERTICAL_ONLY.includes(dept.name) || HUB_OPTIONAL.includes(dept.name);
                                        const isImmoral = dept.key === 'Immoral';
                                        const isGroupVisible = isImmoral ? false : (!isVertical || showGroupForCards.has(dept.key));
                                        const dynamicResultado = isImmoral ? dept.margin : isGroupVisible ? dept.margin : dept.income - dept.directExpenses;
                                        const dynamicMarginPct = dept.income > 0 ? (dynamicResultado / dept.income) * 100 : 0;
                                        const accentColor = DEPT_DOT_COLORS[dept.name] || '#6366f1';
                                        const isPositive = dynamicResultado >= 0;

                                        return (
                                            <div key={dept.key} className="card-executive bg-card rounded-2xl border border-border overflow-hidden">
                                                <div className="p-4 sm:p-6">
                                                    {/* Header */}
                                                    <div className="flex items-center justify-between mb-6">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                                                            <span className="text-sm font-bold text-foreground">{dept.name}</span>
                                                        </div>
                                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${isPositive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'}`}>
                                                            {dynamicMarginPct.toFixed(1)}%
                                                        </span>
                                                    </div>

                                                    {/* Revenue — hero */}
                                                    <div className="mb-5">
                                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Facturación</p>
                                                        <p className="text-xl sm:text-2xl font-bold tracking-tight tabular leading-none break-all">{formatCurrency(dept.income)}</p>
                                                    </div>

                                                    {/* Margin bar */}
                                                    <div className="mb-5">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Margen</span>
                                                            <span className={`text-xs font-bold tabular ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {isPositive ? '+' : ''}{formatCurrency(dynamicResultado)}
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-700 ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
                                                                style={{ width: `${Math.min(100, Math.max(0, Math.abs(dynamicMarginPct)))}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Expense breakdown */}
                                                    <div className="space-y-2 border-t border-border pt-4">
                                                        {dept.categories.map(cat => {
                                                            const val = dept.breakdown[cat.key] || 0;
                                                            if (val === 0) return null;
                                                            return (
                                                                <div key={cat.key} className="flex justify-between items-center">
                                                                    <span className="text-xs text-muted-foreground">{cat.label}</span>
                                                                    <span className="text-xs font-semibold tabular text-foreground/80">{formatCurrency(val)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Group % */}
                                                    {!isImmoral && (
                                                        <div className="mt-3">
                                                            {isGroupVisible ? (
                                                                <div
                                                                    className={`flex justify-between items-center text-xs text-primary/70 ${isVertical ? 'cursor-pointer hover:text-primary' : ''}`}
                                                                    onClick={isVertical ? () => setShowGroupForCards(prev => { const n = new Set(prev); n.delete(dept.key); return n; }) : undefined}
                                                                >
                                                                    <span>Group % <span className="opacity-60">({dept.groupPctDisplay}%)</span></span>
                                                                    <span className="font-semibold tabular">{dept.groupCost > 0 ? formatCurrency(dept.groupCost) : '—'}</span>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    className="w-full flex justify-center text-muted-foreground/25 hover:text-primary/50 transition-colors mt-1"
                                                                    onClick={() => setShowGroupForCards(prev => { const n = new Set(prev); n.add(dept.key); return n; })}
                                                                >
                                                                    <MoreHorizontal size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Net result */}
                                                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resultado</span>
                                                        <span className={`text-base font-bold tabular ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {isPositive ? '+' : ''}{formatCurrency(dynamicResultado)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {deptPerformance.length === 0 && (
                                    <div className="col-span-3 py-20 text-center text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
                                        Sin datos de departamentos
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Holded ─────────────────────────────────────────── */}
                    {holdedSummary?.connected && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-7 w-7 rounded-xl bg-blue-600 flex items-center justify-center">
                                    <span className="text-white text-[11px] font-black">H</span>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold tracking-tight text-foreground leading-none">Holded</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">Facturación · Tesorería</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Pendientes', value: holdedSummary.invoices_pending?.total || 0, sub: `${holdedSummary.invoices_pending?.count || 0} sin vencer`, icon: FileText, iconBg: 'bg-amber-50 dark:bg-amber-950/30', iconColor: 'text-amber-500', click: () => openHoldedDetail('pending') },
                                    { label: 'Vencidas', value: holdedSummary.invoices_overdue?.total || 0, sub: `${holdedSummary.invoices_overdue?.count || 0} facturas`, icon: AlertCircle, iconBg: (holdedSummary.invoices_overdue?.count || 0) > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: (holdedSummary.invoices_overdue?.count || 0) > 0 ? 'text-red-500' : 'text-emerald-500', valueColor: (holdedSummary.invoices_overdue?.count || 0) > 0 ? 'text-red-600' : '', click: () => openHoldedDetail('overdue') },
                                    { label: 'Por Recibir', value: holdedSummary.invoices_estimado?.total || 0, sub: `${holdedSummary.invoices_estimado?.count || 0} facturas`, icon: TrendingUp, iconBg: 'bg-violet-50 dark:bg-violet-950/30', iconColor: 'text-violet-500' },
                                    { label: 'Saldo en Caja', value: holdedSummary.treasury_balance || 0, sub: 'Total en tesorería', icon: Landmark, iconBg: 'bg-blue-50 dark:bg-blue-950/30', iconColor: 'text-blue-500' },
                                ].map(({ label, value, sub, icon: Icon, iconBg, iconColor, valueColor, click }) => (
                                    <div
                                        key={label}
                                        className={`card-executive bg-card rounded-2xl border border-border p-5 ${click ? 'cursor-pointer' : ''}`}
                                        onClick={click}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                                            <div className={`h-8 w-8 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
                                                <Icon size={14} />
                                            </div>
                                        </div>
                                        <p className={`text-lg sm:text-xl font-bold tabular leading-none break-all ${valueColor || 'text-foreground'}`}>{formatCurrency(value)}</p>
                                        <p className="text-[11px] text-muted-foreground mt-2">{sub}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Holded Invoice Detail Modal */}
            {holdedDetailType && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setHoldedDetailType(null)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${holdedDetailType === 'overdue' ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30'}`}>
                                    {holdedDetailType === 'overdue' ? <AlertCircle size={18} /> : <FileText size={18} />}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">
                                        {holdedDetailType === 'overdue' ? 'Facturas Vencidas' : 'Facturas Pendientes'}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {holdedDetailType === 'overdue' ? 'Con fecha de vencimiento pasada' : 'Pendientes de cobro sin vencer'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setHoldedDetailType(null)}
                                className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                            >
                                <X size={16} className="text-muted-foreground" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {holdedDetailLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                </div>
                            ) : holdedDetailInvoices.length === 0 ? (
                                <div className="py-16 text-center text-sm text-muted-foreground">
                                    No hay facturas {holdedDetailType === 'overdue' ? 'vencidas' : 'pendientes'}
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30">
                                            <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground">Nº</th>
                                            <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground">Cliente</th>
                                            <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground">Vencimiento</th>
                                            <th className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {holdedDetailInvoices.map((inv: any, i: number) => {
                                            const now = Math.floor(Date.now() / 1000);
                                            const isOverdue = inv.dueDate && inv.dueDate < now;
                                            return (
                                                <tr key={inv.id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                                    <td className="px-5 py-3 font-mono text-xs font-bold text-foreground">{inv.docNumber || '-'}</td>
                                                    <td className="px-5 py-3 text-xs text-foreground max-w-[200px] truncate">{inv.contactName || '-'}</td>
                                                    <td className={`px-5 py-3 text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                                        {inv.dueDate ? new Date(inv.dueDate * 1000).toLocaleDateString('es-ES') : '-'}
                                                    </td>
                                                    <td className="px-5 py-3 text-right text-xs font-bold tabular text-foreground">
                                                        {inv.total != null ? `${Number(inv.total).toFixed(2)} €` : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t bg-muted/30">
                                            <td className="px-5 py-3 text-xs font-bold" colSpan={3}>
                                                Total ({holdedDetailInvoices.length} factura{holdedDetailInvoices.length !== 1 ? 's' : ''})
                                            </td>
                                            <td className="px-5 py-3 text-right text-xs font-bold tabular">
                                                {holdedDetailInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0).toFixed(2)} €
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {dashboardTab === 'detalle' && (
                <Suspense fallback={
                    <div className="flex items-center justify-center h-96">
                        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    </div>
                }>
                    <DashboardDetalle year={year} activeMonths={activeMonths} timePeriod={timePeriod} />
                </Suspense>
            )}

        </div>
    );
}
