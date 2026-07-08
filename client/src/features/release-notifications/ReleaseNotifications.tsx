import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Mail, Send, Check, Loader2, Users as UsersIcon, Search, Filter,
    Eye, AlertCircle, X, Sparkles, Plus, Rocket, Wrench, Bug,
} from 'lucide-react';
import { toast } from 'sonner';
import { CHANGELOG, type ChangelogEntry } from '@/lib/changelog';
import { buildChangelogEmail } from '@/lib/releaseEmailBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AppUser {
    id: string;
    email: string;
    display_name?: string | null;
    role?: string | null;
    department_code?: string | null;
    is_active?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
    superadmin: 'Admin',
    dept_head: 'Jefe Depto',
    partner: 'Partner',
    user: 'Usuario',
};

const DEPT_LABELS: Record<string, string> = {
    IMMED: 'Immedia',
    IMCONT: 'Imcontent',
    IMMOR: 'Immoralia',
    IMSALES: 'Imsales',
    IMFILMS: 'Imfilms',
    IMFASHION: 'Imfashion',
    IMSEO: 'Imseo',
    IMLOYAL: 'Imloyal',
    IMMORAL: 'Immoral',
};

const TYPE_META: Record<ChangelogEntry['type'], { label: string; color: string; icon: any }> = {
    new_module: { label: 'Nuevo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Rocket },
    improvement: { label: 'Mejora', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Wrench },
    fix: { label: 'Corrección', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Bug },
    in_progress: { label: 'En desarrollo', color: 'bg-violet-100 text-violet-700 border-violet-200', icon: Sparkles },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────────────────────────────────────

export default function ReleaseNotifications() {
    const [selectedEntryId, setSelectedEntryId] = useState<string>(CHANGELOG[0]?.id || '');
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [extraEmails, setExtraEmails] = useState<string[]>([]);
    const [manualInput, setManualInput] = useState('');
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [deptFilter, setDeptFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [changelogSearch, setChangelogSearch] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);

    // ── Data ────────────────────────────────────────────────────────────────
    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => adminApi.getUsers(),
    });
    const users: AppUser[] = usersData?.users || [];

    // ── Changelog list (filtrado por tipo y búsqueda) ───────────────────────
    const filteredChangelog = useMemo(() => {
        const q = changelogSearch.trim().toLowerCase();
        return CHANGELOG
            .filter(e => typeFilter === 'all' || e.type === typeFilter)
            .filter(e => !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }, [changelogSearch, typeFilter]);

    // Si el elegido no está en el filtro, mueve la selección al primero visible
    useEffect(() => {
        if (filteredChangelog.length > 0 && !filteredChangelog.some(e => e.id === selectedEntryId)) {
            setSelectedEntryId(filteredChangelog[0].id);
        }
    }, [filteredChangelog, selectedEntryId]);

    const currentEntry = useMemo(
        () => CHANGELOG.find(e => e.id === selectedEntryId) || null,
        [selectedEntryId],
    );

    // ── Preview generado en el cliente ──────────────────────────────────────
    const preview = useMemo(() => {
        if (!currentEntry) return null;
        return buildChangelogEmail(currentEntry);
    }, [currentEntry]);

    // ── Filtered users ──────────────────────────────────────────────────────
    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users
            .filter(u => u.is_active !== false)
            .filter(u => !q || (u.email?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q)))
            .filter(u => roleFilter === 'all' || u.role === roleFilter)
            .filter(u => deptFilter === 'all' || u.department_code === deptFilter);
    }, [users, search, roleFilter, deptFilter]);

    const availableRoles = useMemo(() => Array.from(new Set(users.map(u => u.role).filter(Boolean))) as string[], [users]);
    const availableDepts = useMemo(() => Array.from(new Set(users.map(u => u.department_code).filter(Boolean))) as string[], [users]);

    // ── Selection helpers ────────────────────────────────────────────────────
    const toggleUser = (id: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const selectAllFiltered = () => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            filteredUsers.forEach(u => next.add(u.id));
            return next;
        });
    };
    const clearSelection = () => setSelectedUserIds(new Set());

    const selectedUsers = users.filter(u => selectedUserIds.has(u.id));
    const selectedUserEmails = selectedUsers.map(u => u.email).filter(Boolean);
    const allEmails = Array.from(new Set([...selectedUserEmails, ...extraEmails]));

    // ── Manual email helpers ────────────────────────────────────────────────
    const addManualEmails = () => {
        const parts = manualInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        const valid: string[] = [];
        const invalid: string[] = [];
        parts.forEach(p => (EMAIL_RE.test(p) ? valid : invalid).push(p));
        if (valid.length > 0) {
            setExtraEmails(prev => Array.from(new Set([...prev, ...valid])));
        }
        if (invalid.length > 0) {
            toast.error(`Emails no válidos: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`);
        }
        setManualInput('');
    };
    const removeExtraEmail = (email: string) => {
        setExtraEmails(prev => prev.filter(e => e !== email));
    };

    // ── Send mutation ────────────────────────────────────────────────────────
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendResults, setSendResults] = useState<{ to: string; ok: boolean; error?: string }[]>([]);
    const sendMutation = useMutation({
        mutationFn: () => {
            if (!preview) throw new Error('No hay preview');
            return adminApi.sendReleaseNotificationHtml({
                subject: preview.subject,
                html: preview.html,
                text: preview.text,
                to: allEmails,
            });
        },
        onMutate: () => {
            setSendError(null);
            setSendResults([]);
        },
        onSuccess: (data) => {
            setSendResults(data.results || []);
            if (data.failed > 0) {
                toast.warning(`Enviados ${data.sent} · Fallaron ${data.failed}`);
                setSendError(`Enviados ${data.sent} correctamente, fallaron ${data.failed}. Revisa los detalles abajo.`);
            } else {
                setConfirmOpen(false);
                toast.success(`Correo enviado a ${data.sent} destinatario${data.sent === 1 ? '' : 's'}`);
                clearSelection();
                setExtraEmails([]);
            }
        },
        onError: (err: any) => {
            const msg = err?.message || 'Error al enviar';
            setSendError(msg);
            toast.error(msg);
        },
    });

    // ── Diagnóstico SMTP ─────────────────────────────────────────────────────
    const diagnoseMutation = useMutation({
        mutationFn: () => adminApi.diagnoseReleaseSmtp(true),
        onSuccess: (data) => {
            if (data.ok && data.verified) {
                toast.success(`SMTP OK · desde ${data.smtp_from} (${data.smtp_host}:${data.smtp_port})`);
            } else if (data.reason === 'smtp-not-configured') {
                toast.error('SMTP no configurado en el servidor (faltan SMTP_USER / SMTP_PASS)');
            } else {
                toast.error(`SMTP: ${data.reason || 'fallo'} · ${data.error || ''}`);
            }
        },
        onError: (err: any) => toast.error(err?.message || 'No se pudo diagnosticar'),
    });

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
            {/* Header */}
            <div
                className="relative rounded-2xl px-6 py-5 text-white shadow-lg overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 45%, #ec4899 100%)' }}
            >
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-widest uppercase text-white/80 mb-1">
                            <Sparkles size={13} /> Enviar novedades
                        </div>
                        <h1 className="text-2xl font-bold">Notifica novedades por email</h1>
                        <p className="text-sm text-white/85 mt-1 max-w-2xl">
                            Elige la novedad, decide a quién enviársela (usuarios de la app o direcciones externas) y previsualiza el correo antes de enviar.
                        </p>
                    </div>
                    <Mail size={48} className="text-white/20" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Panel izquierdo — Novedad + destinatarios */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Selección de changelog */}
                    <section className="bg-white border rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-indigo-600" />
                                <h2 className="text-sm font-bold text-gray-900">1. Elige la novedad</h2>
                            </div>
                            <div className="text-[11px] text-gray-500">{filteredChangelog.length} disponibles</div>
                        </div>

                        {/* Filtros del changelog */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="relative col-span-2">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                <Input
                                    value={changelogSearch}
                                    onChange={e => setChangelogSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    className="pl-7 h-7 text-[11px]"
                                />
                            </div>
                            <select
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                                className="h-7 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white"
                            >
                                <option value="all">Tipo (todos)</option>
                                <option value="new_module">Nuevo</option>
                                <option value="improvement">Mejora</option>
                                <option value="fix">Corrección</option>
                                <option value="in_progress">En desarrollo</option>
                            </select>
                        </div>

                        <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1">
                            {filteredChangelog.length === 0 && (
                                <div className="text-xs text-gray-400 p-3 text-center">Sin resultados</div>
                            )}
                            {filteredChangelog.map(entry => {
                                const meta = TYPE_META[entry.type];
                                const Icon = meta.icon;
                                const selected = selectedEntryId === entry.id;
                                return (
                                    <button
                                        key={entry.id}
                                        onClick={() => setSelectedEntryId(entry.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selected
                                            ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-100'
                                            : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
                                            }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border ${selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
                                                {selected && <Check size={10} />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold uppercase border ${meta.color}`}>
                                                        <Icon size={8} /> {meta.label}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">{entry.date}</span>
                                                </div>
                                                <div className="text-[12px] font-semibold text-gray-800 leading-snug">{entry.title}</div>
                                                <div className="text-[10px] text-gray-500 leading-tight line-clamp-2 mt-0.5">{entry.description}</div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Destinatarios */}
                    <section className="bg-white border rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <UsersIcon size={14} className="text-indigo-600" />
                                <h2 className="text-sm font-bold text-gray-900">2. Elige destinatarios</h2>
                            </div>
                            <div className="text-[11px] text-gray-500">
                                {allEmails.length} total{extraEmails.length > 0 ? ` · +${extraEmails.length} externos` : ''}
                            </div>
                        </div>

                        {/* Emails manuales */}
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2 space-y-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                <Plus size={10} /> Añadir emails manuales
                            </div>
                            <div className="flex gap-1.5">
                                <Input
                                    value={manualInput}
                                    onChange={e => setManualInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualEmails(); } }}
                                    placeholder="email@dominio.com, otro@ejemplo.com..."
                                    className="h-7 text-[11px] flex-1"
                                />
                                <Button size="sm" variant="outline" onClick={addManualEmails} className="h-7 text-[11px] gap-1">
                                    <Plus size={11} /> Añadir
                                </Button>
                            </div>
                            {extraEmails.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                    {extraEmails.map(e => (
                                        <span key={e} className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-800 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                                            {e}
                                            <button onClick={() => removeExtraEmail(e)} className="hover:text-rose-600">
                                                <X size={9} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Búsqueda + filtros */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar usuarios por email o nombre..."
                                    className="pl-8 h-8 text-xs"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Filter size={11} className="text-gray-400" />
                                    <select
                                        value={roleFilter}
                                        onChange={e => setRoleFilter(e.target.value)}
                                        className="flex-1 h-7 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white"
                                    >
                                        <option value="all">Todos los roles</option>
                                        {availableRoles.map(r => (
                                            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                                        ))}
                                    </select>
                                </div>
                                <select
                                    value={deptFilter}
                                    onChange={e => setDeptFilter(e.target.value)}
                                    className="h-7 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white"
                                >
                                    <option value="all">Todos los deptos</option>
                                    {availableDepts.map(d => (
                                        <option key={d} value={d}>{DEPT_LABELS[d] || d}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                                <button
                                    onClick={selectAllFiltered}
                                    className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold"
                                >
                                    Seleccionar todos los visibles
                                </button>
                                {(selectedUserIds.size > 0 || extraEmails.length > 0) && (
                                    <button
                                        onClick={() => { clearSelection(); setExtraEmails([]); }}
                                        className="px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100 font-medium"
                                    >
                                        Limpiar todo
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                            {usersLoading && (
                                <div className="text-xs text-gray-500 p-3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando usuarios...</div>
                            )}
                            {!usersLoading && filteredUsers.length === 0 && (
                                <div className="text-xs text-gray-400 p-4 text-center">Sin usuarios que coincidan</div>
                            )}
                            {filteredUsers.map(u => {
                                const active = selectedUserIds.has(u.id);
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => toggleUser(u.id)}
                                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${active ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50'}`}
                                    >
                                        <span className={`flex-shrink-0 h-4 w-4 rounded border ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
                                            {active && <Check size={10} />}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[12px] font-medium text-gray-800 truncate">
                                                {u.display_name || u.email}
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate">
                                                {u.email}
                                                {u.role && <> · <span className="text-indigo-700">{ROLE_LABELS[u.role] || u.role}</span></>}
                                                {u.department_code && <> · {DEPT_LABELS[u.department_code] || u.department_code}</>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* CTA */}
                    <div className="sticky bottom-4 z-10 bg-white border rounded-xl p-3 shadow-lg flex items-center gap-3">
                        <div className="flex-1 min-w-0 text-xs text-gray-600">
                            {allEmails.length === 0 ? (
                                <span className="text-gray-400">Añade al menos un destinatario</span>
                            ) : (
                                <>
                                    Enviarás a <strong className="text-indigo-700">{allEmails.length}</strong> destinatario{allEmails.length === 1 ? '' : 's'}
                                    {extraEmails.length > 0 && <span className="text-emerald-700"> ({extraEmails.length} externo{extraEmails.length === 1 ? '' : 's'})</span>}
                                </>
                            )}
                        </div>
                        <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={allEmails.length === 0 || !currentEntry}
                            onClick={() => setConfirmOpen(true)}
                        >
                            <Send size={12} /> Enviar
                        </Button>
                    </div>
                </div>

                {/* Panel derecho — Preview */}
                <div className="lg:col-span-3">
                    <section className="bg-white border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
                            <div className="flex items-center gap-2">
                                <Eye size={13} className="text-gray-500" />
                                <h2 className="text-sm font-bold text-gray-900">Vista previa</h2>
                            </div>
                            {preview?.subject && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={preview.subject}>
                                    Asunto: <span className="font-semibold text-gray-800">{preview.subject}</span>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-100 p-4" style={{ minHeight: 600 }}>
                            {preview?.html ? (
                                <iframe
                                    title="preview"
                                    srcDoc={preview.html}
                                    className="w-full rounded-lg border bg-white shadow-inner"
                                    style={{ minHeight: 600, height: '75vh' }}
                                />
                            ) : (
                                <div className="text-xs text-gray-400 flex items-center gap-1.5 p-4"><AlertCircle size={12} /> Elige una novedad para ver el preview.</div>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Modal confirmación */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div
                            className="px-5 py-4 text-white"
                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-bold flex items-center gap-2">
                                    <Send size={14} /> Confirmar envío
                                </h3>
                                <button
                                    onClick={() => !sendMutation.isPending && setConfirmOpen(false)}
                                    className="h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-gray-700">
                                Se enviará <strong>{currentEntry?.title}</strong> a <strong className="text-indigo-700">{allEmails.length}</strong> destinatario{allEmails.length === 1 ? '' : 's'}.
                            </p>
                            <div className="rounded-lg bg-gray-50 border border-gray-100 max-h-40 overflow-y-auto text-[11px] p-2 space-y-0.5">
                                {allEmails.slice(0, 15).map(e => {
                                    const u = users.find(x => x.email === e);
                                    return (
                                        <div key={e} className="text-gray-700 truncate">
                                            {u ? <>{u.display_name || u.email} <span className="text-gray-400">· {u.email}</span></> : (
                                                <><span className="text-emerald-700 font-medium">externo</span> <span className="text-gray-600">· {e}</span></>
                                            )}
                                        </div>
                                    );
                                })}
                                {allEmails.length > 15 && (
                                    <div className="text-gray-500 italic">… y {allEmails.length - 15} más</div>
                                )}
                            </div>

                            {sendError && (
                                <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800 space-y-1.5">
                                    <div className="flex items-start gap-1.5">
                                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <strong>Error al enviar:</strong> {sendError}
                                        </div>
                                    </div>
                                    {sendError.toLowerCase().includes('smtp') && (
                                        <div className="text-[11px] text-rose-700 pl-5">
                                            Prueba pulsando "Probar SMTP" abajo. Si dice <em>smtp-not-configured</em>, el admin de Vercel debe añadir las variables <code className="bg-white/60 px-1 rounded">SMTP_USER</code> y <code className="bg-white/60 px-1 rounded">SMTP_PASS</code> en las env vars del proyecto.
                                        </div>
                                    )}
                                </div>
                            )}

                            {sendResults.length > 0 && sendResults.some(r => !r.ok) && (
                                <div className="rounded-md bg-gray-50 border border-gray-200 max-h-32 overflow-y-auto text-[11px] p-2 space-y-0.5">
                                    <div className="font-semibold text-gray-700 mb-1">Detalles por destinatario:</div>
                                    {sendResults.map(r => (
                                        <div key={r.to} className={`truncate ${r.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {r.ok ? '✓' : '✗'} {r.to}{r.error ? ` — ${r.error}` : ''}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                                <strong>Aviso:</strong> cada destinatario recibirá el correo en su dirección. Esta acción no se puede deshacer.
                            </div>
                        </div>
                        <div className="border-t bg-gray-50 px-5 py-3 flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => diagnoseMutation.mutate()}
                                disabled={diagnoseMutation.isPending}
                                className="text-[11px] gap-1"
                                title="Comprueba las credenciales SMTP del servidor"
                            >
                                {diagnoseMutation.isPending
                                    ? <><Loader2 size={11} className="animate-spin" /> Probando...</>
                                    : 'Probar SMTP'
                                }
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={sendMutation.isPending}>
                                Cancelar
                            </Button>
                            <Button size="sm" className="gap-1.5" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                                {sendMutation.isPending
                                    ? <><Loader2 size={12} className="animate-spin" /> Enviando...</>
                                    : <><Send size={12} /> Confirmar envío</>
                                }
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
