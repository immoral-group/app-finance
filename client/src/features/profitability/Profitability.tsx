import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, AccountProfitability } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import { Settings, ChevronLeft, ChevronRight, AlertTriangle, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfitabilitySetup } from './ProfitabilitySetup';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function semaphoreColor(pct: number | null) {
    if (pct === null) return { cell: 'text-muted-foreground', badge: '' };
    if (pct >= 60) return { cell: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
    if (pct >= 40) return { cell: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
    return { cell: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' };
}

function eur(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function eurDec(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── Team detail modal ─────────────────────────────────────────────────────────
function TeamModal({ account, monthIdx, onClose }: {
    account: AccountProfitability; monthIdx: number | null; onClose: () => void;
}) {
    const m = monthIdx !== null ? account.monthly[monthIdx] : null;
    if (!m) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs text-muted-foreground">{account.client_name}</p>
                        <p className="text-base font-bold text-foreground">{MONTH_NAMES_FULL[monthIdx!]}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"><X size={14} /></button>
                </div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Users size={11} /> Equipo · {m.hours.toFixed(1)}h</p>
                {m.members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin horas registradas</p>
                ) : (
                    <div className="divide-y divide-border/30">
                        {m.members.map(mb => (
                            <div key={mb.name} className="flex items-center justify-between py-1.5 text-xs">
                                <span className="text-foreground font-medium">{mb.name}</span>
                                <span className="text-muted-foreground tabular-nums text-right">
                                    {mb.hours.toFixed(1)}h · {eur(mb.labor_cost)}
                                    {mb.cost_per_hour > 0 && <span className="ml-1 opacity-50 text-[10px]">@{mb.cost_per_hour.toFixed(0)}€/h</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main table row ────────────────────────────────────────────────────────────
function Row({ account, monthIdx, annual, onTeam }: {
    account: AccountProfitability;
    monthIdx: number;
    annual: boolean;
    onTeam: (a: AccountProfitability, m: number) => void;
}) {
    const m = account.monthly[monthIdx];
    const revenue = annual ? account.total_revenue : m.revenue;
    const hours = annual ? account.total_hours : m.hours;
    const laborCost = annual ? account.total_labor_cost : m.labor_cost;
    const profit = revenue - laborCost;
    const margin = revenue > 0 && hours > 0 ? (profit / revenue) * 100 : null;
    const feePerHour = hours > 0 ? revenue / hours : null;
    const costPerHour = hours > 0 ? laborCost / hours : null;

    const s = semaphoreColor(margin);

    if (!annual && revenue === 0 && hours === 0) return null; // no data this month

    return (
        <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
            <td className="px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap">
                {account.client_name}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-foreground">
                {revenue > 0 ? eur(revenue) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {feePerHour !== null ? eurDec(feePerHour) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {costPerHour !== null ? eurDec(costPerHour) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {hours > 0 ? (
                    <button
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-primary/10 hover:text-primary text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/50 transition-colors tabular-nums"
                        onClick={() => onTeam(account, monthIdx)}
                        title="Ver detalle del equipo"
                    >
                        {hours.toFixed(1)}h
                        <Users size={11} className="opacity-60" />
                    </button>
                ) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                {laborCost > 0 ? eur(laborCost) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className={cn('px-3 py-2.5 text-right text-sm tabular-nums font-semibold', profit >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400')}>
                {revenue > 0 || laborCost > 0 ? eur(profit) : <span className="text-muted-foreground/40">—</span>}
            </td>
            <td className="px-3 py-2.5 text-right">
                {margin !== null ? (
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums', s.badge)}>
                        {margin.toFixed(1)}%
                    </span>
                ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                )}
            </td>
        </tr>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Profitability() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth()); // 0-based, -1 = annual
    const [showSetup, setShowSetup] = useState(false);
    const [team, setTeam] = useState<{ account: AccountProfitability; month: number } | null>(null);
    const { isSuperAdmin } = useAuth();

    const { data, isLoading, error } = useQuery({
        queryKey: ['profitability-accounts', year],
        queryFn: () => adminApi.getProfitabilityAccounts(year),
        staleTime: 5 * 60_000,
    });

    const accounts = data?.accounts ?? [];
    const annual = month === -1;

    // Totals for the selected period
    const totRevenue = accounts.reduce((s, a) => s + (annual ? a.total_revenue : a.monthly[month].revenue), 0);
    const totCost = accounts.reduce((s, a) => s + (annual ? a.total_labor_cost : a.monthly[month].labor_cost), 0);
    const totHours = accounts.reduce((s, a) => s + (annual ? a.total_hours : a.monthly[month].hours), 0);
    const totProfit = totRevenue - totCost;
    const totMargin = totRevenue > 0 && totHours > 0 ? (totProfit / totRevenue) * 100 : null;

    // Filter out empty rows for the selected month
    const visibleAccounts = annual
        ? accounts.filter(a => a.total_revenue > 0 || a.total_hours > 0)
        : accounts.filter(a => a.monthly[month].revenue > 0 || a.monthly[month].hours > 0);

    if (showSetup) return <ProfitabilitySetup onBack={() => setShowSetup(false)} year={year} />;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Rentabilidad por Cuenta</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Fee − coste de horas internas = beneficio real por cliente</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Year selector */}
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1">
                        <button onClick={() => setYear(y => y - 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronLeft size={13} className="text-muted-foreground" />
                        </button>
                        <span className="text-sm font-semibold text-foreground px-1 tabular-nums">{year}</span>
                        <button onClick={() => setYear(y => y + 1)} className="h-8 w-8 flex items-center justify-center hover:bg-muted/60 rounded-lg transition-colors">
                            <ChevronRight size={13} className="text-muted-foreground" />
                        </button>
                    </div>
                    {/* Month selector */}
                    <div className="flex items-center gap-1 border border-border/60 rounded-lg bg-card px-1.5 py-1">
                        <button
                            onClick={() => setMonth(-1)}
                            className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', month === -1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
                        >
                            Anual
                        </button>
                        {MONTH_NAMES.map((mn, i) => (
                            <button
                                key={i}
                                onClick={() => setMonth(i)}
                                className={cn('px-2 py-1 rounded-md text-xs font-medium transition-colors tabular-nums', month === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}
                            >
                                {mn}
                            </button>
                        ))}
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

            {/* ClickUp debug — visible when no hours loaded */}
            {data && totHours === 0 && data.debug && (
                <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-xs font-mono space-y-1">
                    <p className="font-semibold text-blue-700 dark:text-blue-300 font-sans">Debug ClickUp</p>
                    <p className="text-blue-600 dark:text-blue-400">Entradas recibidas: <strong>{data.debug.total_entries_fetched}</strong></p>
                    <p className="text-blue-600 dark:text-blue-400">Listas configuradas: <strong>{data.debug.configured_lists}</strong></p>
                    {data.debug.sample_entry && (
                        <p className="text-blue-600 dark:text-blue-400">
                            Muestra: user=<strong>{data.debug.sample_entry.user}</strong> list_id=<strong>{data.debug.sample_entry.list_id}</strong> list=<strong>{data.debug.sample_entry.list_name}</strong> ({data.debug.sample_entry.duration_h}h)
                        </p>
                    )}
                    {!data.debug.sample_entry && data.debug.total_entries_fetched === 0 && (
                        <p className="text-blue-600 dark:text-blue-400 font-sans">ClickUp devolvió 0 entradas de tiempo. El token puede no tener acceso al Time Tracking API, o no hay horas registradas en {year}.</p>
                    )}
                    {Object.keys(data.debug.entries_per_list).length > 0 && (
                        <p className="text-blue-600 dark:text-blue-400">Entradas por lista: {JSON.stringify(data.debug.entries_per_list)}</p>
                    )}
                </div>
            )}

            {/* ClickUp error banner */}
            {data?.clickup_error && (
                <div className="flex items-start gap-2.5 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3.5 text-xs">
                    <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-amber-700 dark:text-amber-300">ClickUp: no se han podido cargar las horas</p>
                        <p className="text-amber-600/80 dark:text-amber-400/70 mt-0.5">{data.clickup_error}</p>
                    </div>
                </div>
            )}

            {/* No config */}
            {!isLoading && accounts.length === 0 && !error && (
                <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 text-center">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Sin datos configurados</p>
                    <p className="text-xs text-amber-600/80 mt-1">Configura el mapeo listas ClickUp → clientes en Configurar.</p>
                    {isSuperAdmin() && (
                        <button onClick={() => setShowSetup(true)} className="mt-3 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors">
                            Ir a Configuración
                        </button>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : 'Error cargando datos'}</p>
                </div>
            )}

            {/* Table */}
            {(isLoading || accounts.length > 0) && (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                    <div className="overflow-auto max-h-[calc(100vh-220px)]">
                        <table className="w-full min-w-[780px]">
                            <thead className="sticky top-0 z-10 border-b border-border/50 bg-muted/80 backdrop-blur">
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                                    <th className="px-3 py-3 text-right font-semibold">Fee mensual</th>
                                    <th className="px-3 py-3 text-right font-semibold">Fee/hora</th>
                                    <th className="px-3 py-3 text-right font-semibold">Coste/hora</th>
                                    <th className="px-3 py-3 text-right font-semibold">Horas</th>
                                    <th className="px-3 py-3 text-right font-semibold">Coste Immoral</th>
                                    <th className="px-3 py-3 text-right font-semibold">Beneficio</th>
                                    <th className="px-3 py-3 text-right font-semibold">Rentabilidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading
                                    ? Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="border-b border-border/30">
                                            {Array.from({ length: 8 }).map((_, j) => (
                                                <td key={j} className="px-3 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                                            ))}
                                        </tr>
                                    ))
                                    : visibleAccounts.length === 0
                                        ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                                    Sin datos para {annual ? year : `${MONTH_NAMES_FULL[month]} ${year}`}
                                                </td>
                                            </tr>
                                        )
                                        : visibleAccounts.map(a => (
                                            <Row
                                                key={a.client_id}
                                                account={a}
                                                monthIdx={annual ? 0 : month}
                                                annual={annual}
                                                onTeam={(acc, m) => setTeam({ account: acc, month: m })}
                                            />
                                        ))
                                }
                            </tbody>
                            {!isLoading && visibleAccounts.length > 1 && (
                                <tfoot className="border-t border-border/50 bg-muted/30">
                                    <tr className="text-sm font-semibold">
                                        <td className="px-4 py-3 text-foreground">Total</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-foreground">{eur(totRevenue)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                                            {totHours > 0 ? eurDec(totRevenue / totHours) : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                                            {totHours > 0 ? eurDec(totCost / totHours) : '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{totHours.toFixed(1)}h</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{eur(totCost)}</td>
                                        <td className={cn('px-3 py-3 text-right tabular-nums', totProfit >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400')}>{eur(totProfit)}</td>
                                        <td className="px-3 py-3 text-right">
                                            {totMargin !== null && (
                                                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold', semaphoreColor(totMargin).badge)}>
                                                    {totMargin.toFixed(1)}%
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* Legend */}
            {visibleAccounts.length > 0 && (
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> ≥ 60%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> 40–59%</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> &lt; 40%</span>
                    <span className="text-muted-foreground/60">· Click en horas para ver equipo</span>
                </div>
            )}

            {team && (
                <TeamModal account={team.account} monthIdx={team.month} onClose={() => setTeam(null)} />
            )}
        </div>
    );
}
