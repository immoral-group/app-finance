import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, AccountProfitability } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Settings, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, DollarSign, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfitabilitySetup } from './ProfitabilitySetup';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function semaphore(margin: number | null): { color: string; bg: string; dot: string } {
    if (margin === null) return { color: 'text-muted-foreground', bg: 'bg-muted/40', dot: 'bg-muted-foreground/30' };
    if (margin >= 60) return { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40', dot: 'bg-emerald-500' };
    if (margin >= 40) return { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40', dot: 'bg-amber-500' };
    return { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40', dot: 'bg-red-500' };
}

function fmt(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

// ── Detail panel (modal) for a client × month ────────────────────────────────
function DetailPanel({
    account,
    monthIdx,
    onClose,
}: {
    account: AccountProfitability;
    monthIdx: number;
    onClose: () => void;
}) {
    const m = account.monthly[monthIdx];
    const sem = semaphore(m.margin_pct);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{account.client_name}</p>
                        <p className="text-lg font-bold text-foreground">{MONTH_NAMES[monthIdx]}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Facturado</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{fmt(m.revenue)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coste labor</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{fmt(m.labor_cost)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Beneficio</p>
                        <p className={cn('text-sm font-bold mt-0.5', m.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {fmt(m.gross_profit)}
                        </p>
                    </div>
                    <div className={cn('rounded-xl px-3 py-2.5', sem.bg)}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Margen</p>
                        <p className={cn('text-sm font-bold mt-0.5', sem.color)}>
                            {m.margin_pct !== null ? `${m.margin_pct.toFixed(1)}%` : '—'}
                        </p>
                    </div>
                </div>

                {/* Horas + equipo */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 font-medium">
                        <Users size={11} /> Equipo · {m.hours.toFixed(1)}h totales
                    </p>
                    {m.members.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin horas registradas</p>
                    ) : (
                        <div className="space-y-1.5">
                            {m.members.map(mb => (
                                <div key={mb.name} className="flex items-center justify-between text-xs">
                                    <span className="text-foreground font-medium">{mb.name}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                        {mb.hours.toFixed(1)}h · {fmt(mb.labor_cost)}
                                        {mb.cost_per_hour > 0 && (
                                            <span className="ml-1 text-[9px] opacity-60">@{mb.cost_per_hour.toFixed(0)}€/h</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, sub }: {
    icon: React.ElementType; label: string; value: string; sub?: string;
}) {
    return (
        <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-primary" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                <p className="text-base font-bold text-foreground leading-tight mt-0.5">{value}</p>
                {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ── Matrix table: clients × months ───────────────────────────────────────────
function MatrixTable({ accounts }: { accounts: AccountProfitability[] }) {
    const [detail, setDetail] = useState<{ account: AccountProfitability; month: number } | null>(null);

    // Which months have any data at all?
    const activeMonths = MONTH_NAMES.map((_, i) =>
        accounts.some(a => a.monthly[i].revenue > 0 || a.monthly[i].hours > 0)
    );
    const visibleMonths = activeMonths.some(Boolean)
        ? MONTH_NAMES.map((_, i) => i).filter(i => activeMonths[i])
        : MONTH_NAMES.map((_, i) => i);

    return (
        <>
            <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                        <thead className="border-b border-border/50 bg-muted/40">
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-muted/40 z-10 min-w-[140px]">Cliente</th>
                                {visibleMonths.map(i => (
                                    <th key={i} className="px-2 py-3 text-center font-semibold min-w-[60px]">{MONTH_NAMES[i]}</th>
                                ))}
                                <th className="px-3 py-3 text-right font-semibold min-w-[90px]">Anual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {accounts.map(account => {
                                const annualSem = semaphore(account.total_margin_pct);
                                return (
                                    <tr key={account.client_id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-2.5 sticky left-0 bg-card z-10">
                                            <div className="flex items-center gap-2">
                                                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', annualSem.dot)} />
                                                <span className="text-sm font-medium text-foreground truncate max-w-[120px]">{account.client_name}</span>
                                            </div>
                                        </td>
                                        {visibleMonths.map(i => {
                                            const m = account.monthly[i];
                                            const hasData = m.revenue > 0 || m.hours > 0;
                                            const sem = semaphore(m.margin_pct);
                                            // Label: si hay margen calculado lo mostramos; si no, lo más relevante (€ o h)
                                            const label = m.margin_pct !== null
                                                ? `${m.margin_pct.toFixed(0)}%`
                                                : m.hours > 0
                                                    ? `${m.hours.toFixed(0)}h`
                                                    : m.revenue > 0
                                                        ? fmt(m.revenue)
                                                        : '—';
                                            const tooltip = `${account.client_name} · ${MONTH_NAMES[i]}\nFacturado: ${fmt(m.revenue)}\nHoras: ${m.hours.toFixed(1)}h\nCoste labor: ${fmt(m.labor_cost)}\nBeneficio: ${fmt(m.gross_profit)}${m.margin_pct !== null ? `\nMargen: ${m.margin_pct.toFixed(1)}%` : '\nMargen: —'}`;
                                            return (
                                                <td key={i} className="px-1 py-1.5 text-center">
                                                    {hasData ? (
                                                        <button
                                                            onClick={() => setDetail({ account, month: i })}
                                                            className={cn(
                                                                'w-full px-1 py-1.5 rounded-lg text-[11px] font-bold tabular-nums transition-all hover:scale-105 hover:shadow-sm',
                                                                m.margin_pct !== null ? sem.bg : 'bg-muted/40',
                                                                m.margin_pct !== null ? sem.color : 'text-muted-foreground',
                                                            )}
                                                            title={tooltip}
                                                        >
                                                            {label}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground/30">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="text-xs">
                                                <p className="font-semibold text-foreground tabular-nums">{fmt(account.total_revenue)}</p>
                                                <p className={cn('text-[10px] tabular-nums font-medium', annualSem.color)}>
                                                    {account.total_margin_pct !== null ? `${account.total_margin_pct.toFixed(1)}%` : '—'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {accounts.length > 1 && (() => {
                            const totalByMonth = visibleMonths.map(i => ({
                                revenue: accounts.reduce((s, a) => s + a.monthly[i].revenue, 0),
                                labor_cost: accounts.reduce((s, a) => s + a.monthly[i].labor_cost, 0),
                            }));
                            const totalRevenue = accounts.reduce((s, a) => s + a.total_revenue, 0);
                            const totalCost = accounts.reduce((s, a) => s + a.total_labor_cost, 0);
                            const avgMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null;
                            return (
                                <tfoot className="border-t border-border/50 bg-muted/30">
                                    <tr className="text-xs font-semibold">
                                        <td className="px-4 py-2.5 sticky left-0 bg-muted/30 text-muted-foreground">Total</td>
                                        {visibleMonths.map((i, idx) => {
                                            const tb = totalByMonth[idx];
                                            const hasData = tb.revenue > 0;
                                            const m = tb.revenue > 0 ? ((tb.revenue - tb.labor_cost) / tb.revenue) * 100 : null;
                                            const sem = semaphore(m);
                                            return (
                                                <td key={i} className="px-1 py-1.5 text-center">
                                                    {hasData ? (
                                                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', sem.bg, sem.color)}>
                                                            {m !== null ? `${m.toFixed(0)}%` : '—'}
                                                        </span>
                                                    ) : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2.5 text-right">
                                            <p className="text-foreground tabular-nums">{fmt(totalRevenue)}</p>
                                            {avgMargin !== null && (
                                                <p className={cn('text-[10px] tabular-nums font-medium', semaphore(avgMargin).color)}>
                                                    {avgMargin.toFixed(1)}%
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            );
                        })()}
                    </table>
                </div>
            </div>

            {detail && (
                <DetailPanel
                    account={detail.account}
                    monthIdx={detail.month}
                    onClose={() => setDetail(null)}
                />
            )}
        </>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Profitability() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [showSetup, setShowSetup] = useState(false);
    const { isSuperAdmin } = useAuth();

    const { data, isLoading, error } = useQuery({
        queryKey: ['profitability-accounts', year],
        queryFn: () => adminApi.getProfitabilityAccounts(year),
        staleTime: 5 * 60_000,
    });

    const accounts = data?.accounts ?? [];

    const totalRevenue = accounts.reduce((s, a) => s + a.total_revenue, 0);
    const totalCost = accounts.reduce((s, a) => s + a.total_labor_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const totalHours = accounts.reduce((s, a) => s + a.total_hours, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

    const green = accounts.filter(a => (a.total_margin_pct ?? 0) >= 60).length;
    const yellow = accounts.filter(a => { const m = a.total_margin_pct ?? 0; return m >= 40 && m < 60; }).length;
    const red = accounts.filter(a => (a.total_margin_pct ?? 100) < 40).length;

    if (showSetup) {
        return <ProfitabilitySetup onBack={() => setShowSetup(false)} year={year} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Rentabilidad por Cuenta</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Margen bruto por cliente · horas ClickUp vs facturación</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1">
                        <button onClick={() => setYear(y => y - 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronLeft size={14} className="text-muted-foreground" />
                        </button>
                        <span className="text-sm font-semibold text-foreground px-2 tabular-nums">{year}</span>
                        <button onClick={() => setYear(y => y + 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronRight size={14} className="text-muted-foreground" />
                        </button>
                    </div>
                    {isSuperAdmin() && (
                        <button
                            onClick={() => setShowSetup(true)}
                            className="h-9 px-3 rounded-lg border border-border/60 bg-card hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                        >
                            <Settings size={13} />
                            Configurar
                        </button>
                    )}
                </div>
            </div>

            {/* Summary cards */}
            {(accounts.length > 0 || isLoading) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <SummaryCard icon={DollarSign} label="Facturado" value={isLoading ? '…' : fmt(totalRevenue)} />
                    <SummaryCard icon={TrendingDown} label="Coste labor" value={isLoading ? '…' : fmt(totalCost)} />
                    <SummaryCard icon={TrendingUp} label="Beneficio bruto" value={isLoading ? '…' : fmt(totalProfit)} />
                    <SummaryCard
                        icon={TrendingUp}
                        label="Margen medio"
                        value={isLoading ? '…' : avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
                        sub={!isLoading ? `${green} verde · ${yellow} amarillo · ${red} rojo` : undefined}
                    />
                    <SummaryCard
                        icon={Clock}
                        label="Horas totales"
                        value={isLoading ? '…' : `${totalHours.toFixed(0)}h`}
                        sub={!isLoading ? `${accounts.length} cuentas` : undefined}
                    />
                </div>
            )}

            {/* No config warning */}
            {!isLoading && accounts.length === 0 && !error && (
                <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 text-center">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Sin datos configurados</p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
                        Configura el mapeo de listas ClickUp → clientes para ver la rentabilidad.
                    </p>
                    {isSuperAdmin() && (
                        <button
                            onClick={() => setShowSetup(true)}
                            className="mt-3 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                        >
                            Ir a Configuración
                        </button>
                    )}
                </div>
            )}

            {/* ClickUp connection issue */}
            {data?.clickup_error && (
                <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">No se han podido cargar horas desde ClickUp</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">{data.clickup_error}</p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/60 mt-2">Los datos de facturación se muestran igualmente, pero el coste laboral y el margen requieren las horas.</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        {error instanceof Error ? error.message : 'Error cargando datos'}
                    </p>
                </div>
            )}

            {/* Loading skeleton */}
            {isLoading && (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />
                        ))}
                    </div>
                </div>
            )}

            {/* Matrix */}
            {!isLoading && accounts.length > 0 && (
                <MatrixTable accounts={accounts} />
            )}

            {/* Legend */}
            {accounts.length > 0 && (
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Verde ≥ 60%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> Amarillo 40–59%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Rojo &lt; 40%</span>
                    <span className="text-muted-foreground/60">· Click en celda para ver detalle del mes</span>
                </div>
            )}
        </div>
    );
}
