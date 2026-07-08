import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Mail, Send, Check, Loader2, Users as UsersIcon, Search, Filter,
    Eye, AlertCircle, X, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

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

interface Template {
    key: string;
    title: string;
    summary: string;
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

// ─────────────────────────────────────────────────────────────────────────────

export default function ReleaseNotifications() {
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [deptFilter, setDeptFilter] = useState<string>('all');
    const [confirmOpen, setConfirmOpen] = useState(false);

    // ── Data ────────────────────────────────────────────────────────────────
    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => adminApi.getUsers(),
    });
    const users: AppUser[] = usersData?.users || [];

    const { data: templatesData, isLoading: templatesLoading } = useQuery({
        queryKey: ['release-templates'],
        queryFn: () => adminApi.listReleaseTemplates(),
    });
    const templates: Template[] = templatesData?.templates || [];

    // Selecciona automáticamente el primer template al cargar
    useEffect(() => {
        if (!selectedTemplate && templates.length > 0) {
            setSelectedTemplate(templates[0].key);
        }
    }, [templates, selectedTemplate]);

    const { data: previewData, isLoading: previewLoading } = useQuery({
        queryKey: ['release-preview', selectedTemplate],
        queryFn: () => adminApi.previewReleaseTemplate(selectedTemplate),
        enabled: !!selectedTemplate,
    });

    // ── Filtered users ──────────────────────────────────────────────────────
    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users
            .filter(u => u.is_active !== false)
            .filter(u => !q || (u.email?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q)))
            .filter(u => roleFilter === 'all' || u.role === roleFilter)
            .filter(u => deptFilter === 'all' || u.department_code === deptFilter);
    }, [users, search, roleFilter, deptFilter]);

    // Roles y depts únicos para los filtros
    const availableRoles = useMemo(() => Array.from(new Set(users.map(u => u.role).filter(Boolean))) as string[], [users]);
    const availableDepts = useMemo(() => Array.from(new Set(users.map(u => u.department_code).filter(Boolean))) as string[], [users]);

    // ── Selection helpers ────────────────────────────────────────────────────
    const toggleUser = (id: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
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
    const selectedEmails = selectedUsers.map(u => u.email).filter(Boolean);

    // ── Send mutation ────────────────────────────────────────────────────────
    const sendMutation = useMutation({
        mutationFn: () => adminApi.sendReleaseNotification({ templateKey: selectedTemplate, to: selectedEmails }),
        onSuccess: (data) => {
            setConfirmOpen(false);
            if (data.failed > 0) {
                toast.warning(`Enviados ${data.sent} · Fallaron ${data.failed}`);
            } else {
                toast.success(`Correo enviado a ${data.sent} usuario${data.sent === 1 ? '' : 's'}`);
                clearSelection();
            }
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Error al enviar');
        },
    });

    const currentTemplate = templates.find(t => t.key === selectedTemplate);

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
                            Elige la novedad, decide a quién enviársela y previsualiza el correo antes de enviar. Cada usuario recibe un correo dedicado a su dirección.
                        </p>
                    </div>
                    <Mail size={48} className="text-white/20" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Panel izquierdo — Novedad + destinatarios */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Selección de template */}
                    <section className="bg-white border rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-indigo-600" />
                            <h2 className="text-sm font-bold text-gray-900">1. Elige la novedad</h2>
                        </div>
                        {templatesLoading ? (
                            <div className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando...</div>
                        ) : templates.length === 0 ? (
                            <div className="text-xs text-gray-500">No hay novedades disponibles.</div>
                        ) : (
                            <div className="space-y-1.5">
                                {templates.map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setSelectedTemplate(t.key)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selectedTemplate === t.key
                                            ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-100'
                                            : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
                                            }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border ${selectedTemplate === t.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
                                                {selectedTemplate === t.key && <Check size={10} />}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-gray-800">{t.title}</div>
                                                <div className="text-[11px] text-gray-500 leading-snug">{t.summary}</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Destinatarios */}
                    <section className="bg-white border rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <UsersIcon size={14} className="text-indigo-600" />
                                <h2 className="text-sm font-bold text-gray-900">2. Elige destinatarios</h2>
                            </div>
                            <div className="text-[11px] text-gray-500">
                                {selectedUserIds.size} · {filteredUsers.length} visibles
                            </div>
                        </div>

                        {/* Búsqueda + filtros */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar por email o nombre..."
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
                                {selectedUserIds.size > 0 && (
                                    <button
                                        onClick={clearSelection}
                                        className="px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100 font-medium"
                                    >
                                        Limpiar selección
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Lista */}
                        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
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
                            {selectedUserIds.size === 0 ? (
                                <span className="text-gray-400">Elige al menos un destinatario</span>
                            ) : (
                                <>
                                    Enviarás <strong>{currentTemplate?.title || '—'}</strong> a <strong className="text-indigo-700">{selectedUserIds.size}</strong> usuario{selectedUserIds.size === 1 ? '' : 's'}
                                </>
                            )}
                        </div>
                        <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={selectedUserIds.size === 0 || !selectedTemplate}
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
                            {previewData?.subject && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={previewData.subject}>
                                    Asunto: <span className="font-semibold text-gray-800">{previewData.subject}</span>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-100 p-4" style={{ minHeight: 600 }}>
                            {previewLoading && (
                                <div className="text-xs text-gray-500 flex items-center gap-1.5 p-4"><Loader2 size={12} className="animate-spin" /> Cargando preview...</div>
                            )}
                            {previewData?.html && (
                                <iframe
                                    title="preview"
                                    srcDoc={previewData.html}
                                    className="w-full rounded-lg border bg-white shadow-inner"
                                    style={{ minHeight: 600, height: '75vh' }}
                                />
                            )}
                            {!previewLoading && !previewData?.html && (
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
                                Se enviará <strong>{currentTemplate?.title}</strong> a <strong className="text-indigo-700">{selectedUserIds.size}</strong> usuario{selectedUserIds.size === 1 ? '' : 's'}.
                            </p>
                            <div className="rounded-lg bg-gray-50 border border-gray-100 max-h-40 overflow-y-auto text-[11px] p-2 space-y-0.5">
                                {selectedUsers.slice(0, 12).map(u => (
                                    <div key={u.id} className="text-gray-700 truncate">{u.display_name || u.email} <span className="text-gray-400">· {u.email}</span></div>
                                ))}
                                {selectedUsers.length > 12 && (
                                    <div className="text-gray-500 italic">… y {selectedUsers.length - 12} más</div>
                                )}
                            </div>
                            <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                                <strong>Aviso:</strong> cada usuario recibirá el correo en su dirección. Esta acción no se puede deshacer.
                            </div>
                        </div>
                        <div className="border-t bg-gray-50 px-5 py-3 flex items-center justify-end gap-2">
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
