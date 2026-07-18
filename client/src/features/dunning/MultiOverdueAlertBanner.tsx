import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { dunningApi } from '@/lib/api/dunning';
import { useAuth } from '@/context/AuthContext';

// Alerta global que salta cuando uno o más clientes acumulan >= threshold
// facturas vencidas. Solo se muestra a superadmins. Cada vez que el usuario
// enfoca la ventana o vuelve a la pestaña, revalidamos: la alerta debe
// reaparecer aunque la sesión llevara horas abierta.
//
// El "cerrar" es de sesión y por ventana: se guarda el conjunto de clientes
// escondidos en sessionStorage; si aparecen clientes nuevos vuelve a saltar.

const HIDE_KEY = 'dunning:multi-alert:hidden-keys';

function readHidden(): Set<string> {
    try {
        const raw = sessionStorage.getItem(HIDE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch { return new Set(); }
}

function writeHidden(set: Set<string>) {
    try { sessionStorage.setItem(HIDE_KEY, JSON.stringify(Array.from(set))); } catch { /* ignore */ }
}

export function MultiOverdueAlertBanner() {
    const { profile } = useAuth();
    const isSuperAdmin = profile?.role === 'superadmin';

    const query = useQuery({
        queryKey: ['dunning', 'multi-alerts'],
        queryFn: () => dunningApi.listMultiOverdueAlerts(),
        enabled: isSuperAdmin,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        staleTime: 60 * 1000,
    });

    // Al recibir foco de nuevo (visibilitychange no siempre dispara focus en
    // todos los navegadores), forzamos revalidación explícita.
    useEffect(() => {
        if (!isSuperAdmin) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') query.refetch();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [isSuperAdmin, query]);

    if (!isSuperAdmin) return null;
    if (!query.data || !query.data.enabled) return null;

    const alerts = query.data.alerts || [];
    if (alerts.length === 0) return null;

    const hidden = readHidden();
    const visible = alerts.filter(a => !hidden.has(a.contact_id || a.contact_name));
    if (visible.length === 0) return null;

    const totalInvoices = visible.reduce((s, a) => s + a.invoice_count, 0);
    const totalAmount = visible.reduce((s, a) => s + Number(a.total_amount || 0), 0);
    const amountFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalAmount);

    const dismiss = () => {
        const next = new Set(hidden);
        for (const a of visible) next.add(a.contact_id || a.contact_name);
        writeHidden(next);
        // Fuerza rerender sin hacer refetch (los datos siguen siendo válidos,
        // solo cambia el filtro local de sesión).
        query.refetch();
    };

    return (
        <div className="sticky top-0 z-40 border-b border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800">
            <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-start gap-3">
                <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={18} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                        {visible.length === 1
                            ? `${visible[0].contact_name || 'Un cliente'} acumula ${visible[0].invoice_count} facturas vencidas`
                            : `${visible.length} clientes con múltiples facturas vencidas`}
                    </p>
                    <p className="text-xs text-red-800 dark:text-red-200/90 mt-0.5">
                        {totalInvoices} facturas · {amountFmt} de deuda ·{' '}
                        <Link to="/payments/dunning" className="underline font-medium">Ver módulo impagos</Link>
                    </p>
                    {visible.length > 1 && (
                        <p className="text-[11px] text-red-700 dark:text-red-300 mt-1 truncate">
                            {visible.slice(0, 4).map(a => `${a.contact_name || '—'} (${a.invoice_count})`).join(' · ')}
                            {visible.length > 4 && ` · +${visible.length - 4}`}
                        </p>
                    )}
                </div>
                <button
                    onClick={dismiss}
                    className="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300"
                    aria-label="Ocultar durante esta sesión"
                    title="Ocultar durante esta sesión (vuelve a aparecer si hay clientes nuevos o abres otra pestaña)"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
