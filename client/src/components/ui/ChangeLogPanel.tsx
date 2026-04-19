import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { changelogApi, ChangeEntry, ChangeOperation } from '@/lib/api/changelog';
import { ChevronDown, ChevronUp, History, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Config visual por operación ────────────────────────────
const OP_CONFIG: Record<ChangeOperation, { label: string; dot: string; bg: string; text: string }> = {
    create: { label: 'Creado',      dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700' },
    update: { label: 'Editado',     dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700' },
    delete: { label: 'Eliminado',   dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700'   },
};

// ─── Helpers ─────────────────────────────────────────────────
function displayEmail(email: string | null): string {
    if (!email) return 'Sistema';
    return email.split('@')[0]; // mostrar solo el alias
}

function timeAgo(iso: string): string {
    try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
    } catch {
        return iso;
    }
}

function fullDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

// ─── Fila individual del historial ──────────────────────────
function ChangeRow({ entry }: { entry: ChangeEntry }) {
    const op = OP_CONFIG[entry.operation] ?? OP_CONFIG.update;
    return (
        <div className="flex items-start gap-3 py-2.5 border-b last:border-0 group">
            {/* Bullet coloreado */}
            <div className="mt-1.5 shrink-0">
                <span className={`block w-2 h-2 rounded-full ${op.dot}`} />
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {/* Badge operación */}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${op.bg} ${op.text}`}>
                        {op.label}
                    </span>
                    {/* Etiqueta del registro */}
                    {entry.record_label && (
                        <span className="text-sm font-medium text-foreground truncate max-w-[200px]" title={entry.record_label}>
                            {entry.record_label}
                        </span>
                    )}
                    {/* Campo cambiado */}
                    {entry.field_name && (
                        <span className="text-xs text-muted-foreground">
                            · <span className="font-mono">{entry.field_name}</span>
                        </span>
                    )}
                </div>

                {/* Valor antiguo → nuevo */}
                {(entry.old_value || entry.new_value) && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        {entry.old_value && (
                            <span className="line-through opacity-60">{entry.old_value}</span>
                        )}
                        {entry.old_value && entry.new_value && (
                            <span className="text-muted-foreground/40">→</span>
                        )}
                        {entry.new_value && (
                            <span className="font-medium text-foreground">{entry.new_value}</span>
                        )}
                    </div>
                )}

                {/* Usuario + fecha */}
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                    <span className="font-medium">{displayEmail(entry.changed_by_email)}</span>
                    <span title={fullDateTime(entry.changed_at)}>{timeAgo(entry.changed_at)}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Panel principal ─────────────────────────────────────────
interface ChangeLogPanelProps {
    /** Módulo a filtrar: 'media' | 'payments' | 'billing' | 'payroll' */
    module: string;
    /** Límite inicial de entradas */
    limit?: number;
}

export function ChangeLogPanel({ module, limit = 30 }: ChangeLogPanelProps) {
    const [open,   setOpen]   = useState(false);
    const [offset, setOffset] = useState(0);

    const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
        queryKey: ['change-log', module, offset],
        queryFn:  () => changelogApi.getChanges({ module, limit, offset }),
        enabled:  open,                      // solo carga al abrir el panel
        staleTime: 0,                        // siempre fresco al abrir
        refetchInterval: open ? 20_000 : false, // auto-refresh cada 20s mientras está abierto
    });

    const changes = data?.changes ?? [];
    const total   = data?.total   ?? 0;
    const hasMore = offset + limit < total;
    const hasPrev = offset > 0;

    const handleToggle = () => {
        setOpen(o => !o);
        if (!open) setOffset(0); // reiniciar paginación al abrir
    };

    return (
        <div className="mt-6 border rounded-lg bg-card overflow-hidden">
            {/* ── Header (siempre visible) ── */}
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <History size={15} />
                    <span>Historial de cambios</span>
                    {total > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold">
                            {total > 99 ? '99+' : total}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {open && (
                        <>
                            {dataUpdatedAt > 0 && !isFetching && (
                                <span className="text-[10px] text-muted-foreground/50 hidden sm:inline">
                                    act. {timeAgo(new Date(dataUpdatedAt).toISOString())}
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={e => { e.stopPropagation(); refetch(); }}
                                title="Actualizar ahora"
                            >
                                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                            </Button>
                        </>
                    )}
                    {open ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
                </div>
            </button>

            {/* ── Contenido expandible ── */}
            {open && (
                <div className="border-t">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 size={18} className="animate-spin mr-2" />
                            <span className="text-sm">Cargando historial...</span>
                        </div>
                    ) : changes.length === 0 ? (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            No hay cambios registrados aún en este módulo.
                        </div>
                    ) : (
                        <>
                            <div className="px-4 max-h-[380px] overflow-y-auto">
                                {changes.map(entry => (
                                    <ChangeRow key={entry.id} entry={entry} />
                                ))}
                            </div>

                            {/* Paginación */}
                            {(hasMore || hasPrev) && (
                                <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                                    <span>{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
                                    <div className="flex gap-2">
                                        {hasPrev && (
                                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOffset(o => Math.max(0, o - limit))}>
                                                ← Anterior
                                            </Button>
                                        )}
                                        {hasMore && (
                                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOffset(o => o + limit)}>
                                                Siguiente →
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
