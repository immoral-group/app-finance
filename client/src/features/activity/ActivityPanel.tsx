import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activityApi, ActivityRange, ActivityLog, UserActivity } from '@/lib/api/activity';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
    Search, X, Users, Activity, Loader2,
    ChevronDown, ToggleLeft, ToggleRight, Trash2, Check
} from 'lucide-react';
import { format } from 'date-fns';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const RANGE_OPTIONS: { value: ActivityRange; label: string }[] = [
    { value: 'week', label: 'Última Semana' },
    { value: 'month', label: 'Último Mes' },
    { value: 'year', label: 'Este Año' },
];

const ROLE_LABELS: Record<string, string> = {
    superadmin: 'Admin',
    dept_head: 'Jefe Depto',
    partner: 'Partner',
    user: 'Usuario',
};

// ─── Professional Bar Chart (Recharts) ─────────────────────
function ActivityChart({ logs, range }: { logs: ActivityLog[]; range: ActivityRange }) {
    const data = useMemo(() => {
        const now = new Date();
        const map = new Map<string, number>();

        if (range === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                map.set(format(d, 'dd MMM'), 0);
            }
            logs.forEach(l => {
                const key = format(new Date(l.created_at), 'dd MMM');
                if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
            });
        } else if (range === 'month') {
            for (let i = 29; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                map.set(format(d, 'dd MMM'), 0);
            }
            logs.forEach(l => {
                const key = format(new Date(l.created_at), 'dd MMM');
                if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
            });
        } else {
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now);
                d.setMonth(d.getMonth() - i);
                map.set(format(d, 'MMM yy'), 0);
            }
            logs.forEach(l => {
                const key = format(new Date(l.created_at), 'MMM yy');
                if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
            });
        }

        return Array.from(map.entries()).map(([name, Accesos]) => ({ name, Accesos }));
    }, [logs, range]);

    return (
        <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        dy={10}
                        interval={range === 'month' ? 4 : 0} // Skip ticks for month to avoid clutter
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        allowDecimals={false}
                    />
                    <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            fontSize: '12px'
                        }}
                        itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}
                    />
                    <Bar
                        dataKey="Accesos"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={range === 'month' ? 12 : 32}
                        animationDuration={1000}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.Accesos > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}
                                fillOpacity={entry.Accesos > 0 ? 0.9 : 0.4}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ══════════════════════════════════════════════════════════
// Main Panel (Embedded Version)
// ══════════════════════════════════════════════════════════
export default function ActivityPanel() {
    const queryClient = useQueryClient();
    const [range, setRange] = useState<ActivityRange>('week');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserActivity | null>(null);
    const [detailRange, setDetailRange] = useState<ActivityRange>('week');
    const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);

    // Global activity data
    const { data: activityData, isLoading } = useQuery({
        queryKey: ['activity-all', range],
        queryFn: () => activityApi.getAllActivity(range),
    });

    // Selected user's logs
    const { data: userLogsData } = useQuery({
        queryKey: ['activity-user', selectedUser?.id, detailRange],
        queryFn: () => activityApi.getUserActivity(selectedUser!.id, detailRange),
        enabled: !!selectedUser,
    });

    const users = activityData?.users || [];
    const allLogs = activityData?.logs || [];
    const userLogs = userLogsData?.logs || [];

    // Toggle user active state
    const toggleActiveMut = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            adminApi.updateUser(id, { is_active }),
        onMutate: ({ id, is_active }) => {
            setSelectedUser(prev => prev && prev.id === id ? { ...prev, is_active } : prev);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activity-all'] });
            queryClient.invalidateQueries({ queryKey: ['users'] }); // Keep parent user list in sync
        },
        onError: (_err, { id, is_active }) => {
            setSelectedUser(prev => prev && prev.id === id ? { ...prev, is_active: !is_active } : prev);
        },
    });

    // Delete user
    const deleteUserMut = useMutation({
        mutationFn: (id: string) => adminApi.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activity-all'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setSelectedUser(null);
        },
    });

    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;
        const q = searchTerm.toLowerCase();
        return users.filter(u => u.display_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }, [users, searchTerm]);

    const totalActive = users.filter(u => u.is_active).length;
    const mostActive = users.length > 0 ? users.reduce((a, b) => a.access_count > b.access_count ? a : b) : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Visión General</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Métricas de interacción con la plataforma</p>
                </div>
                <div className="relative">
                    <Button variant="outline" onClick={() => setRangeDropdownOpen(!rangeDropdownOpen)} className="gap-2">
                        {RANGE_OPTIONS.find(r => r.value === range)?.label}
                        <ChevronDown size={14} />
                    </Button>
                    {rangeDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-xl z-50 min-w-[160px] overflow-hidden">
                            {RANGE_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => { setRange(opt.value); setRangeDropdownOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${range === opt.value ? 'text-primary bg-accent' : 'text-popover-foreground hover:bg-accent/50'}`}>
                                    {range === opt.value && <Check size={14} />}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuarios Activos</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{totalActive}</p>
                    <p className="text-xs text-muted-foreground mt-1">de {users.length} registrados</p>
                </Card>
                <Card className="p-4 shadow-sm border-primary/20 bg-primary/5">
                    <p className="text-xs text-primary/80 uppercase tracking-wider font-medium">Accesos Registrados</p>
                    <p className="text-3xl font-bold text-primary mt-2">{activityData?.total_logs || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">en el período seleccionado</p>
                </Card>
                <Card className="p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuario Más Activo</p>
                    <p className="text-lg font-bold text-foreground mt-2 truncate">{mostActive?.display_name || '—'}</p>
                    <p className="text-xs text-primary mt-1 font-medium">{mostActive?.access_count || 0} accesos</p>
                </Card>
            </div>

            {/* Global Activity Chart md */}
            <Card className="p-5 shadow-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Actividad de Acceso Global</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{allLogs.length} accesos en este periodo</p>
                    </div>
                </div>
                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
                ) : (
                    <ActivityChart logs={allLogs} range={range} />
                )}
            </Card>

            {/* Search */}
            <div className="flex items-center gap-3 pt-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar usuario..."
                        className="w-full h-10 pl-10 pr-4 bg-card border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors shadow-sm"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium bg-muted/50 px-3 py-1.5 rounded-full border">
                    <Users size={14} />
                    <span>{filteredUsers.length} usuarios</span>
                </div>
            </div>

            {/* Users Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? (
                    <div className="col-span-full flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>
                ) : filteredUsers.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 border rounded-xl border-dashed">No se encontraron usuarios.</div>
                ) : (
                    filteredUsers.map(u => (
                        <Card key={u.id}
                            className={`p-4 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${selectedUser?.id === u.id ? 'border-primary shadow-md ring-1 ring-primary/20 bg-primary/5' : 'shadow-sm'} ${!u.is_active ? 'opacity-60 grayscale-[50%]' : ''}`}
                            onClick={() => { setSelectedUser(u); setDetailRange('week'); }}
                        >
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                                    {u.display_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0 flex-1 mt-0.5">
                                    <p className="text-sm font-semibold text-foreground truncate leading-tight">{u.display_name}</p>
                                    <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{u.email}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                            {ROLE_LABELS[u.role] || u.role}
                                        </Badge>
                                        <span className={`text-[10px] font-bold ${u.is_active ? 'text-green-500' : 'text-red-500'}`}>
                                            {u.is_active ? '● Activa' : '● Inactiva'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 bg-muted/40 px-2 py-1.5 rounded-md border border-border/50">
                                    <p className="text-lg font-bold text-primary leading-none">{u.access_count}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">accesos</p>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {/* ──── MODAL: User Detail ──── */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedUser(null)}>
                    <Card className="max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl !rounded-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                    {selectedUser.display_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
                                </div>
                                <h2 className="text-base font-bold text-foreground">{selectedUser.display_name}</h2>
                            </div>
                            <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-md transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Activity Chart */}
                        <div className="px-6 py-5 border-b">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">Actividad Reciente</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">{userLogs.length} accesos en este periodo</p>
                                </div>
                                <select
                                    className="bg-muted/50 border rounded-lg px-3 py-1.5 text-xs text-foreground font-medium appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                                    value={detailRange}
                                    onChange={e => setDetailRange(e.target.value as ActivityRange)}
                                >
                                    {RANGE_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <ActivityChart logs={userLogs} range={detailRange} />
                        </div>

                        {/* Contact Info */}
                        <div className="px-6 py-5 border-b bg-muted/10">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Email</p>
                                    <p className="text-sm text-foreground mt-0.5">{selectedUser.email}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Rol / Permisos</p>
                                    <p className="text-sm text-foreground mt-0.5">{ROLE_LABELS[selectedUser.role] || selectedUser.role}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Registrado el</p>
                                    <p className="text-sm text-foreground mt-0.5">{selectedUser.created_at ? format(new Date(selectedUser.created_at), 'dd/MM/yyyy') : '—'}</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Estado de la cuenta</p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => toggleActiveMut.mutate({ id: selectedUser.id, is_active: !selectedUser.is_active })}
                                            className="transition-transform hover:scale-105"
                                            disabled={toggleActiveMut.isPending}
                                        >
                                            {selectedUser.is_active
                                                ? <ToggleRight size={32} className="text-green-500" />
                                                : <ToggleLeft size={32} className="text-muted-foreground" />
                                            }
                                        </button>
                                        <span className={`text-xs font-medium ${selectedUser.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                                            {selectedUser.is_active ? 'Con acceso' : 'Acceso revocado'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Logs (Table view for detail) */}
                        {userLogs.length > 0 && (
                            <div className="px-6 py-4">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historial detallado</h4>
                                <div className="max-h-[160px] overflow-y-auto custom-scrollbar border rounded-lg bg-card text-xs">
                                    <table className="w-full">
                                        <thead className="bg-muted/50 sticky top-0 border-b">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Acción</th>
                                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ruta</th>
                                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Fecha y Hora</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {userLogs.slice(0, 30).map(log => (
                                                <tr key={log.id} className="hover:bg-muted/30">
                                                    <td className="px-3 py-2 text-foreground capitalize flex items-center gap-1.5">
                                                        <Activity size={10} className="text-primary" />
                                                        {log.action}
                                                    </td>
                                                    <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">{log.page_path || '—'}</td>
                                                    <td className="px-3 py-2 text-muted-foreground text-right">{format(new Date(log.created_at), 'dd/MM/yy HH:mm')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="px-6 py-4 flex justify-between items-center border-t bg-muted/10">
                            <Button
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2"
                                onClick={() => {
                                    if (confirm(`¿Eliminar al usuario ${selectedUser.display_name} de manera permanente?`)) {
                                        deleteUserMut.mutate(selectedUser.id);
                                    }
                                }}
                            >
                                <Trash2 size={14} className="mr-1.5" />
                                Eliminar Usuario
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setSelectedUser(null)}
                            >
                                Cerrar Ventana
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
