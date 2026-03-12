import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { adminApi } from '@/lib/api/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Settings2,
    MoreHorizontal,
    BarChart3,
    LayoutDashboard
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
    IMMED: 'immedia',
    IMCONT: 'imcontent',
    IMMOR: 'immoralia',
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

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const QUARTERS = [
    { label: 'Q1', months: [0, 1, 2] },
    { label: 'Q2', months: [3, 4, 5] },
    { label: 'Q3', months: [6, 7, 8] },
    { label: 'Q4', months: [9, 10, 11] },
];

export default function Dashboard() {
    const { isDeptHead, isSuperAdmin, isPartner, profile } = useAuth();

    // Redirect dept_head to their own department dashboard
    if (isDeptHead() && profile?.department_code) {
        const slug = DEPT_ROUTE_MAP[profile.department_code] || profile.department_code.toLowerCase();
        return <Navigate to={`/departamentos/${slug}`} replace />;
    }

    // Redirect partner to their commissions view
    if (isPartner()) {
        return <Navigate to="/commissions" replace />;
    }
    const [year] = useState(new Date().getFullYear());
    const [visibleWidgets, setVisibleWidgets] = useState<Record<WidgetType, boolean>>({
        kpis: true,
        departments: true,
    });
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [deptFilter, setDeptFilter] = useState<'all' | 'main' | 'verticals'>('main');
    const [visibleVerticals, setVisibleVerticals] = useState<Set<string>>(new Set());
    const [dashboardTab, setDashboardTab] = useState<DashboardTab>('general');
    const [showGroupForCards, setShowGroupForCards] = useState<Set<string>>(new Set());

    // Time period state
    const [timePeriod, setTimePeriod] = useState<TimePeriod>('annual');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3));

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

    // Custom rows for dynamic structures
    const { data: customRowsData } = useQuery({
        queryKey: ['pl-custom-rows'],
        queryFn: adminApi.getCustomRows,
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Period label for KPIs
    const periodLabel = timePeriod === 'monthly'
        ? MONTHS[selectedMonth]
        : timePeriod === 'quarterly'
            ? QUARTERS[selectedQuarter].label
            : 'YTD';

    return (
        <div className="space-y-6" >
            {/* Header with Dashboard tabs */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Overview for Fiscal Year {year}</p>
                </div>
                {isSuperAdmin() && (
                    <div className="flex items-center gap-3">
                        <Button
                            variant={isConfiguring ? "secondary" : "outline"}
                            onClick={() => setIsConfiguring(!isConfiguring)}
                            className="gap-2"
                        >
                            <Settings2 size={16} />
                            {isConfiguring ? 'Done' : 'Customize'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Sub-module tabs: General / Detalle */}
            <div className="flex gap-2 border-b pb-1">
                <button
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${dashboardTab === 'general'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    onClick={() => setDashboardTab('general')}
                >
                    <LayoutDashboard size={16} />
                    General
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${dashboardTab === 'detalle'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    onClick={() => setDashboardTab('detalle')}
                >
                    <BarChart3 size={16} />
                    Detalle
                </button>
            </div>

            {/* Time Period Selector — shared across both tabs */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
                    {([['monthly', 'Mensual'], ['quarterly', 'Trimestral'], ['annual', 'Anual']] as const).map(([key, label]) => (
                        <button
                            key={key}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timePeriod === key
                                ? 'bg-white shadow-sm text-foreground'
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
                        className="border rounded-md px-3 py-1.5 text-sm bg-white"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(Number(e.target.value))}
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>
                )}

                {timePeriod === 'quarterly' && (
                    <select
                        className="border rounded-md px-3 py-1.5 text-sm bg-white"
                        value={selectedQuarter}
                        onChange={e => setSelectedQuarter(Number(e.target.value))}
                    >
                        {QUARTERS.map((q, i) => (
                            <option key={i} value={i}>{q.label} ({MONTHS[q.months[0]]}–{MONTHS[q.months[2]]})</option>
                        ))}
                    </select>
                )}
            </div>

            {isConfiguring && (
                <Card className="bg-muted/50 border-dashed">
                    <CardContent className="p-4 flex flex-wrap gap-4 items-center">
                        <span className="text-sm font-medium">Toggle Widgets:</span>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary">
                                <input
                                    type="checkbox"
                                    checked={visibleWidgets.kpis}
                                    onChange={() => toggleWidget('kpis')}
                                    className="rounded border-gray-300"
                                /> General KPIs
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary">
                                <input
                                    type="checkbox"
                                    checked={visibleWidgets.departments}
                                    onChange={() => toggleWidget('departments')}
                                    className="rounded border-gray-300"
                                /> Departments
                            </label>
                        </div>
                    </CardContent>
                </Card>
            )}

            {dashboardTab === 'general' && (
                <>
                    {/* KPI Cards — from PL matrix */}
                    {
                        visibleWidgets.kpis && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <Card className="bg-white border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between space-y-0 pb-2">
                                            <p className="text-sm font-medium text-muted-foreground">Total Billing ({periodLabel})</p>
                                            <Wallet className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex flex-col mt-2">
                                            <h2 className="text-3xl font-bold">{formatCurrency(plKpis.totalBilling)}</h2>
                                            <p className="text-xs text-muted-foreground mt-1">Gross Revenue</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-white border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between space-y-0 pb-2">
                                            <p className="text-sm font-medium text-muted-foreground">Total Expenses ({periodLabel})</p>
                                            <TrendingDown className="h-4 w-4 text-red-500" />
                                        </div>
                                        <div className="flex flex-col mt-2">
                                            <h2 className="text-3xl font-bold">{formatCurrency(plKpis.totalExpenses)}</h2>
                                            <p className="text-xs text-muted-foreground mt-1">Operational Costs</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-white border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between space-y-0 pb-2">
                                            <p className="text-sm font-medium text-muted-foreground">Net Margin ({periodLabel})</p>
                                            <TrendingUp className="h-4 w-4 text-green-500" />
                                        </div>
                                        <div className="flex flex-col mt-2">
                                            <h2 className={`text-3xl font-bold ${plKpis.netMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(plKpis.netMargin)}
                                            </h2>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {plKpis.marginPercentage.toFixed(1)}% margin
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                            </div>
                        )
                    }

                    {/* Department Profitability — from PL matrix */}
                    {
                        visibleWidgets.departments && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-700">
                                <div className="flex flex-col items-end gap-3 flex-wrap">
                                    <div className="flex gap-2">
                                        <Button
                                            variant={deptFilter === 'main' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setDeptFilter('main')}
                                        >
                                            Hubs
                                        </Button>
                                        <Button
                                            variant={deptFilter === 'verticals' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setDeptFilter('verticals')}
                                        >
                                            Verticales
                                        </Button>
                                        <Button
                                            variant={deptFilter === 'all' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setDeptFilter('all')}
                                        >
                                            Todos
                                        </Button>
                                    </div>
                                    {deptFilter === 'main' && (
                                        <div className="flex flex-wrap gap-2 justify-end w-full animate-in fade-in slide-in-from-top-1 duration-300">
                                            {HUB_OPTIONAL.map(v => (
                                                <label key={v} className={`flex items-center gap-1.5 text-xs cursor-pointer px-3 py-1.5 rounded-full transition-colors border ${visibleVerticals.has(v) ? 'bg-primary/10 border-primary/30 text-primary font-medium' : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'}`}>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={visibleVerticals.has(v)}
                                                        onChange={(e) => {
                                                            const newSet = new Set(visibleVerticals);
                                                            if (e.target.checked) newSet.add(v);
                                                            else newSet.delete(v);
                                                            setVisibleVerticals(next => {
                                                                const s = new Set(next);
                                                                if (e.target.checked) s.add(v);
                                                                else s.delete(v);
                                                                return s;
                                                            });
                                                        }}
                                                    />
                                                    {v}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {deptPerformance
                                        .filter(dept => {
                                            if (deptFilter === 'all') return true;
                                            if (deptFilter === 'main') {
                                                return HUB_CORE.includes(dept.name) || (HUB_OPTIONAL.includes(dept.name) && visibleVerticals.has(dept.name));
                                            }
                                            if (deptFilter === 'verticals') {
                                                return VERTICAL_ONLY.includes(dept.name);
                                            }
                                            return false;
                                        })
                                        .sort((a, b) => b.income - a.income)
                                        .map(dept => {
                                            // Compute dynamic margin based on Group % toggle
                                            const isVertical = VERTICAL_ONLY.includes(dept.name) || HUB_OPTIONAL.includes(dept.name);
                                            const isImmoral = dept.key === 'Immoral';
                                            const isGroupVisible = isImmoral ? false : (!isVertical || showGroupForCards.has(dept.key));
                                            // Dynamic resultado & margin: include Group cost only when visible
                                            const dynamicResultado = isImmoral
                                                ? dept.margin
                                                : isGroupVisible
                                                    ? dept.margin  // income - directExpenses - groupCost
                                                    : dept.income - dept.directExpenses; // income - directExpenses only
                                            const dynamicMarginPct = dept.income > 0 ? (dynamicResultado / dept.income) * 100 : 0;

                                            return (
                                                <Card key={dept.key} className="hover:shadow-md transition-shadow">
                                                    <CardHeader className="pb-2">
                                                        <CardTitle className="text-base font-bold flex justify-between items-center">
                                                            {dept.name}
                                                            <span className={`text-sm font-normal px-2 py-1 rounded-full ${dynamicResultado >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                {dynamicMarginPct.toFixed(1)}% margen
                                                            </span>
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="space-y-4">
                                                            {/* Facturación */}
                                                            <div className="flex justify-between items-center border-b pb-2">
                                                                <span className="text-sm font-medium text-gray-500">Facturación</span>
                                                                <span className="text-lg font-bold text-gray-900">{formatCurrency(dept.income)}</span>
                                                            </div>

                                                            {/* Expenses Breakdown */}
                                                            <div className="space-y-1 text-sm">
                                                                {dept.categories.map(cat => {
                                                                    const val = dept.breakdown[cat.key] || 0;
                                                                    return (
                                                                        <div key={cat.label} className="flex justify-between text-muted-foreground">
                                                                            <span>{cat.label}</span>
                                                                            <span>{val > 0 ? formatCurrency(val) : '—'}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Group % — hidden for verticals by default, toggleable ON/OFF */}
                                                            {!isImmoral && (() => {
                                                                return (
                                                                    <>
                                                                        {isGroupVisible ? (
                                                                            <div
                                                                                className={`flex justify-between text-sm text-indigo-600 border-t pt-2 ${isVertical ? 'cursor-pointer hover:bg-indigo-50/50 -mx-1 px-1 rounded transition-colors' : ''}`}
                                                                                onClick={isVertical ? (e) => {
                                                                                    e.stopPropagation();
                                                                                    setShowGroupForCards(prev => {
                                                                                        const next = new Set(prev);
                                                                                        next.delete(dept.key);
                                                                                        return next;
                                                                                    });
                                                                                } : undefined}
                                                                                title={isVertical ? 'Click para ocultar Group %' : undefined}
                                                                            >
                                                                                <span className="font-medium">Group % <span className="text-indigo-400 font-normal">({dept.groupPctDisplay}%)</span></span>
                                                                                <span className="font-medium">{dept.groupCost > 0 ? formatCurrency(dept.groupCost) : '—'}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex justify-center border-t pt-1">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setShowGroupForCards(prev => {
                                                                                            const next = new Set(prev);
                                                                                            next.add(dept.key);
                                                                                            return next;
                                                                                        });
                                                                                    }}
                                                                                    className="text-gray-300 hover:text-indigo-500 transition-colors p-0.5 rounded-full hover:bg-indigo-50"
                                                                                    title="Mostrar Group %"
                                                                                >
                                                                                    <MoreHorizontal size={16} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}

                                                            {/* Resultado — dynamically computed based on Group visibility */}
                                                            <div className="pt-2 border-t">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-bold text-gray-900">Resultado</span>
                                                                    <span className={`text-xl font-bold ${dynamicResultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        {formatCurrency(dynamicResultado)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    {deptPerformance.length === 0 && (
                                        <Card className="col-span-3 p-6 text-center text-muted-foreground border-dashed">
                                            No department data available.
                                        </Card>
                                    )}
                                </div>
                            </div>
                        )
                    }
                </>
            )}

            {dashboardTab === 'detalle' && (
                <Suspense fallback={
                    <div className="flex items-center justify-center h-96">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                }>
                    <DashboardDetalle
                        year={year}
                        activeMonths={activeMonths}
                        timePeriod={timePeriod}
                    />
                </Suspense>
            )}

        </div >
    );
}
