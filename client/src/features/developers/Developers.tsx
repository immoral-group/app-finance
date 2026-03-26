import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api/admin';
import { useAuth } from '@/context/AuthContext';
import {
    Key, Plus, Trash2, Copy, Check,
    Shield, Clock, AlertTriangle, BookOpen, ChevronDown,
    ChevronRight, Code, Zap, ToggleLeft, ToggleRight,
    Link2, RefreshCw, FileText, Users as UsersIcon, Landmark
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabType = 'api-keys' | 'docs' | 'integrations';

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    permissions: string[];
    created_at: string;
    last_used_at: string | null;
    is_active: boolean;
    expires_at: string | null;
    full_key?: string; // Only on creation
}

interface Scope {
    key: string;
    label: string;
    module: string;
}

interface DocModule {
    name: string;
    scope: string;
    endpoints: { method: string; path: string; description: string; params?: string[] }[];
}

export default function Developers() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('api-keys');
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [scopes, setScopes] = useState<Scope[]>([]);
    const [docs, setDocs] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Create form
    const [newName, setNewName] = useState('');
    const [newPermissions, setNewPermissions] = useState<string[]>([]);
    const [newExpires, setNewExpires] = useState('');
    const [creating, setCreating] = useState(false);

    // Holded state
    const [holdedStatus, setHoldedStatus] = useState<{ connected: boolean; error?: string } | null>(null);
    const [holdedInvoices, setHoldedInvoices] = useState<any[]>([]);
    const [holdedContacts, setHoldedContacts] = useState<any[]>([]);
    const [holdedTreasury, setHoldedTreasury] = useState<any[]>([]);
    const [holdedLoading, setHoldedLoading] = useState(false);
    const [holdedSection, setHoldedSection] = useState<'invoices' | 'contacts' | 'treasury'>('invoices');
    const [activeIntegration, setActiveIntegration] = useState<string | null>(null);

    // Invoice filters
    const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'pending' | 'paid' | 'partial' | 'overdue'>('all');
    const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<number>(-1); // -1 = all
    const [invoiceYearFilter, setInvoiceYearFilter] = useState<number>(new Date().getFullYear());

    const loadKeys = useCallback(async () => {
        try {
            const res = await adminApi.getApiKeys();
            setKeys(res.keys || []);
        } catch (e) {
            console.error('Error loading API keys:', e);
        }
    }, []);

    const loadScopes = useCallback(async () => {
        try {
            const res = await adminApi.getApiScopes();
            setScopes(res.scopes || []);
        } catch (e) {
            console.error('Error loading scopes:', e);
        }
    }, []);

    const loadDocs = useCallback(async () => {
        try {
            const res = await adminApi.getApiDocs();
            setDocs(res);
        } catch (e) {
            console.error('Error loading docs:', e);
        }
    }, []);

    useEffect(() => {
        Promise.all([loadKeys(), loadScopes(), loadDocs()]).finally(() => setLoading(false));
    }, [loadKeys, loadScopes, loadDocs]);

    const loadHolded = useCallback(async () => {
        setHoldedLoading(true);
        try {
            const [status, invoices, contacts, treasury] = await Promise.all([
                adminApi.getHoldedStatus(),
                adminApi.getHoldedInvoices({ sort: 'created-desc' }).catch(() => ({ invoices: [] })),
                adminApi.getHoldedContacts().catch(() => ({ contacts: [] })),
                adminApi.getHoldedTreasury().catch(() => ({ accounts: [] })),
            ]);
            setHoldedStatus(status);
            setHoldedInvoices(invoices.invoices || []);
            setHoldedContacts(contacts.contacts || []);
            setHoldedTreasury(treasury.accounts || []);
        } catch (e) {
            console.error('Error loading Holded:', e);
        } finally {
            setHoldedLoading(false);
        }
    }, []);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const res = await adminApi.createApiKey({
                name: newName.trim(),
                permissions: newPermissions,
                expires_at: newExpires || undefined,
                created_by: profile?.id,
            });
            if (res.key?.full_key) {
                setNewKeyRevealed(res.key.full_key);
            }
            setNewName('');
            setNewPermissions([]);
            setNewExpires('');
            setShowCreateModal(false);
            await loadKeys();
        } catch (e) {
            console.error('Error creating API key:', e);
        } finally {
            setCreating(false);
        }
    };

    const handleToggleActive = async (id: string, current: boolean) => {
        try {
            await adminApi.updateApiKey(id, { is_active: !current });
            await loadKeys();
        } catch (e) {
            console.error('Error toggling key:', e);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Eliminar permanentemente la API key "${name}"? Esta acción no se puede deshacer.`)) return;
        try {
            await adminApi.deleteApiKey(id);
            await loadKeys();
        } catch (e) {
            console.error('Error deleting key:', e);
        }
    };

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const togglePermission = (scope: string) => {
        setNewPermissions(prev =>
            prev.includes(scope) ? prev.filter(p => p !== scope) : [...prev, scope]
        );
    };

    const groupedScopes = scopes.reduce<Record<string, Scope[]>>((acc, scope) => {
        if (!acc[scope.module]) acc[scope.module] = [];
        acc[scope.module].push(scope);
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Code className="h-6 w-6 text-primary" />
                        Developers
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gestiona API keys, documentación e integraciones externas
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
                {[
                    { key: 'api-keys' as TabType, label: 'API Keys', icon: Key },
                    { key: 'docs' as TabType, label: 'Documentación', icon: BookOpen },
                    { key: 'integrations' as TabType, label: 'Integraciones', icon: Link2 },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => {
                            setActiveTab(tab.key);
                            if (tab.key === 'integrations' && !holdedStatus) loadHolded();
                        }}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                            activeTab === tab.key
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <tab.icon size={15} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* API Keys Tab */}
            {activeTab === 'api-keys' && (
                <div className="space-y-4">
                    {/* New key revealed banner */}
                    {newKeyRevealed && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                        ¡Copia tu API Key ahora!
                                    </h3>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                        Esta es la única vez que verás la clave completa. Guárdala en un lugar seguro.
                                    </p>
                                    <div className="mt-3 flex items-center gap-2">
                                        <code className="flex-1 bg-amber-100 dark:bg-amber-900/50 px-3 py-2 rounded-lg text-xs font-mono text-amber-900 dark:text-amber-100 break-all">
                                            {newKeyRevealed}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(newKeyRevealed, 'new-key')}
                                            className="flex-shrink-0 p-2 rounded-lg bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
                                        >
                                            {copiedId === 'new-key' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-amber-700 dark:text-amber-200" />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setNewKeyRevealed(null)}
                                        className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                                    >
                                        Entendido, ya la copié
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Create button */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                            <Plus size={16} />
                            Crear API Key
                        </button>
                    </div>

                    {/* Keys list */}
                    {keys.length === 0 ? (
                        <div className="bg-card border rounded-xl p-12 text-center">
                            <Key className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-foreground">No hay API Keys</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                                Crea tu primera API key para empezar a integrar aplicaciones externas con tu plataforma.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {keys.map(key => (
                                <div
                                    key={key.id}
                                    className={cn(
                                        'bg-card border rounded-xl p-4 transition-all',
                                        !key.is_active && 'opacity-60'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Key size={14} className={key.is_active ? 'text-primary' : 'text-muted-foreground'} />
                                                <span className="font-semibold text-sm text-foreground">{key.name}</span>
                                                <span className={cn(
                                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                                                    key.is_active
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                )}>
                                                    {key.is_active ? 'Activa' : 'Revocada'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-2">
                                                <code className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                                                    {key.key_prefix}...
                                                </code>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <Clock size={10} />
                                                    Creada {new Date(key.created_at).toLocaleDateString('es-ES')}
                                                </span>
                                                {key.last_used_at && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Zap size={10} />
                                                        Último uso {new Date(key.last_used_at).toLocaleDateString('es-ES')}
                                                    </span>
                                                )}
                                            </div>
                                            {key.permissions.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {key.permissions.map(perm => (
                                                        <span key={perm} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium">
                                                            {perm}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleToggleActive(key.id, key.is_active)}
                                                className="p-2 rounded-lg hover:bg-muted transition-colors"
                                                title={key.is_active ? 'Revocar' : 'Activar'}
                                            >
                                                {key.is_active
                                                    ? <ToggleRight size={18} className="text-emerald-600" />
                                                    : <ToggleLeft size={18} className="text-muted-foreground" />
                                                }
                                            </button>
                                            <button
                                                onClick={() => handleDelete(key.id, key.name)}
                                                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Usage info */}
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
                            <Shield size={14} />
                            Cómo usar tu API Key
                        </h4>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                            Incluye la clave en el header <code className="bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded font-mono">x-api-key</code> de cada request:
                        </p>
                        <div className="mt-3 bg-gray-900 rounded-lg p-3 overflow-x-auto">
                            <code className="text-xs text-green-400 font-mono whitespace-pre">{`curl -H "x-api-key: ig_live_tu_clave_aqui" \\
     https://finance.immoral.es/api/pl/summary/2026`}</code>
                        </div>
                    </div>
                </div>
            )}

            {/* Documentation Tab */}
            {activeTab === 'docs' && docs && (
                <div className="space-y-4">
                    <div className="bg-card border rounded-xl p-5">
                        <h2 className="text-lg font-bold text-foreground">{docs.title} <span className="text-xs font-normal text-muted-foreground ml-2">v{docs.version}</span></h2>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-muted/50 rounded-lg p-3">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Base URL</span>
                                <code className="block text-sm font-mono text-foreground mt-1">{docs.base_url}</code>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Auth Header</span>
                                <code className="block text-sm font-mono text-foreground mt-1">{docs.authentication?.header}</code>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Key Format</span>
                                <code className="block text-sm font-mono text-foreground mt-1">{docs.authentication?.format}</code>
                            </div>
                        </div>
                    </div>

                    {docs.modules?.map((mod: DocModule) => (
                        <DocModuleCard key={mod.name} module={mod} />
                    ))}
                </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
                <div className="space-y-4">
                    {/* Integration Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Holded Card */}
                        <button
                            onClick={() => {
                                setActiveIntegration(activeIntegration === 'holded' ? null : 'holded');
                                if (!holdedStatus) loadHolded();
                            }}
                            className={cn(
                                'bg-card border rounded-xl p-4 text-left transition-all hover:shadow-md',
                                activeIntegration === 'holded' && 'ring-2 ring-primary border-primary'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    H
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-foreground">Holded</h3>
                                        {holdedStatus && (
                                            <span className={cn(
                                                'px-1.5 py-0.5 rounded-full text-[9px] font-semibold',
                                                holdedStatus.connected
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                            )}>
                                                {holdedStatus.connected ? '● Conectado' : '● Error'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Facturación, contactos y tesorería</p>
                                </div>
                            </div>
                        </button>

                        {/* Future integration placeholder */}
                        <div className="border border-dashed rounded-xl p-4 flex items-center gap-3 opacity-40">
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                <Plus size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Más integraciones</h3>
                                <p className="text-[11px] text-muted-foreground">Próximamente</p>
                            </div>
                        </div>
                    </div>

                    {/* Holded Detail Panel */}
                    {activeIntegration === 'holded' && (
                        <div className="space-y-4 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <div className="h-5 w-5 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-[8px]">H</div>
                                    Holded
                                </h3>
                                <button
                                    onClick={loadHolded}
                                    disabled={holdedLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={holdedLoading ? 'animate-spin' : ''} />
                                    {holdedLoading ? 'Cargando...' : 'Actualizar'}
                                </button>
                            </div>

                            {holdedLoading && !holdedStatus ? (
                                <div className="flex items-center justify-center h-48">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                                </div>
                            ) : holdedStatus?.connected ? (
                                <>
                                    {/* Sub-tabs */}
                                    <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
                                        {[
                                            { key: 'invoices' as const, label: `Facturas (${holdedInvoices.length})`, icon: FileText },
                                            { key: 'contacts' as const, label: `Contactos (${holdedContacts.length})`, icon: UsersIcon },
                                            { key: 'treasury' as const, label: `Tesorería (${holdedTreasury.length})`, icon: Landmark },
                                        ].map(sub => (
                                            <button
                                                key={sub.key}
                                                onClick={() => setHoldedSection(sub.key)}
                                                className={cn(
                                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                                                    holdedSection === sub.key
                                                        ? 'bg-background shadow-sm text-foreground'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                )}
                                            >
                                                <sub.icon size={13} />
                                                {sub.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Invoices */}
                                    {holdedSection === 'invoices' && (
                                        <div className="space-y-3">
                                            {/* Filters Row */}
                                            <div className="flex flex-wrap gap-2 items-center">
                                                {/* Status filter */}
                                                <div className="flex gap-1 bg-muted/50 p-0.5 rounded-lg">
                                                    {[
                                                        { key: 'all' as const, label: 'Todas' },
                                                        { key: 'pending' as const, label: 'Pendientes' },
                                                        { key: 'paid' as const, label: 'Pagadas' },
                                                        { key: 'partial' as const, label: 'Parcial' },
                                                        { key: 'overdue' as const, label: 'Vencidas' },
                                                    ].map(f => (
                                                        <button
                                                            key={f.key}
                                                            onClick={() => setInvoiceStatusFilter(f.key)}
                                                            className={cn(
                                                                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                                                                invoiceStatusFilter === f.key
                                                                    ? 'bg-background shadow-sm text-foreground'
                                                                    : 'text-muted-foreground hover:text-foreground'
                                                            )}
                                                        >
                                                            {f.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                {/* Month filter */}
                                                <select
                                                    value={invoiceMonthFilter}
                                                    onChange={e => setInvoiceMonthFilter(Number(e.target.value))}
                                                    className="border rounded-lg px-2.5 py-1 text-xs bg-background text-foreground"
                                                >
                                                    <option value={-1}>Todos los meses</option>
                                                    {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                                                        <option key={i} value={i}>{m}</option>
                                                    ))}
                                                </select>
                                                {/* Year filter */}
                                                <select
                                                    value={invoiceYearFilter}
                                                    onChange={e => setInvoiceYearFilter(Number(e.target.value))}
                                                    className="border rounded-lg px-2.5 py-1 text-xs bg-background text-foreground"
                                                >
                                                    {[2024, 2025, 2026, 2027].map(y => (
                                                        <option key={y} value={y}>{y}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Filtered Table */}
                                            {(() => {
                                                const now = Math.floor(Date.now() / 1000);
                                                const filtered = holdedInvoices.filter((inv: any) => {
                                                    // Status filter
                                                    if (invoiceStatusFilter === 'pending' && inv.status !== 0) return false;
                                                    if (invoiceStatusFilter === 'paid' && inv.status !== 1) return false;
                                                    if (invoiceStatusFilter === 'partial' && inv.status !== 2) return false;
                                                    if (invoiceStatusFilter === 'overdue') {
                                                        if (inv.status === 1 || inv.status === 3) return false; // exclude paid & cancelled
                                                        if (!inv.dueDate || inv.dueDate >= now) return false;
                                                    }
                                                    // Date filter
                                                    if (inv.date) {
                                                        const d = new Date(inv.date * 1000);
                                                        if (d.getFullYear() !== invoiceYearFilter) return false;
                                                        if (invoiceMonthFilter >= 0 && d.getMonth() !== invoiceMonthFilter) return false;
                                                    }
                                                    return true;
                                                });
                                                const totalSubtotal = filtered.reduce((s: number, inv: any) => s + (inv.subtotal || 0), 0);
                                                const totalTotal = filtered.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
                                                const totalPending = filtered.reduce((s: number, inv: any) => s + (inv.paymentsPending || 0), 0);

                                                return (
                                                    <div className="bg-card border rounded-xl overflow-hidden">
                                                        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                                                            <span className="text-[11px] text-muted-foreground font-medium">
                                                                {filtered.length} factura{filtered.length !== 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="bg-muted/50 border-b">
                                                                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Nº</th>
                                                                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Cliente</th>
                                                                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Fecha</th>
                                                                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Vencimiento</th>
                                                                        <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Subtotal</th>
                                                                        <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Total</th>
                                                                        <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Pendiente</th>
                                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Estado</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {filtered.slice(0, 100).map((inv: any, i: number) => {
                                                                        const isOverdue = inv.status !== 1 && inv.status !== 3 && inv.dueDate && inv.dueDate < now;
                                                                        const isCancelled = inv.status === 3;
                                                                        return (
                                                                            <tr key={inv.id || i} className={cn(
                                                                                'hover:bg-muted/20 transition-colors',
                                                                                isOverdue && 'bg-red-50/50 dark:bg-red-950/10',
                                                                                isCancelled && 'opacity-50'
                                                                            )}>
                                                                                <td className="px-3 py-2 font-mono font-medium text-foreground">
                                                                                    {inv.docNumber || inv.invoiceNum || '-'}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-foreground max-w-[200px] truncate">
                                                                                    {inv.contactName || '-'}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-muted-foreground">
                                                                                    {inv.date ? new Date(inv.date * 1000).toLocaleDateString('es-ES') : '-'}
                                                                                </td>
                                                                                <td className={cn('px-3 py-2', isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground')}>
                                                                                    {inv.dueDate ? new Date(inv.dueDate * 1000).toLocaleDateString('es-ES') : '-'}
                                                                                    {isOverdue && <span className="ml-1 text-[9px]">⚠</span>}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                                                                    {inv.subtotal != null ? `${Number(inv.subtotal).toFixed(2)} €` : '-'}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                                                                                    {inv.total != null ? `${Number(inv.total).toFixed(2)} €` : '-'}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                                                                    {inv.paymentsPending != null ? `${Number(inv.paymentsPending).toFixed(2)} €` : '-'}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-center">
                                                                                    <span className={cn(
                                                                                        'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                                                                        isCancelled ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                                                                            : inv.status === 1 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                                                            : isOverdue ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                                                            : inv.status === 2 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                                                                    )}>
                                                                                        {isCancelled ? 'Anulada' : inv.status === 1 ? 'Pagada' : isOverdue ? 'Vencida' : inv.status === 2 ? 'Parcial' : 'Pendiente'}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                                {filtered.length > 0 && (
                                                                    <tfoot>
                                                                        <tr className="bg-muted/50 border-t font-semibold">
                                                                            <td className="px-3 py-2.5" colSpan={4}>Totales</td>
                                                                            <td className="px-3 py-2.5 text-right tabular-nums">{totalSubtotal.toFixed(2)} €</td>
                                                                            <td className="px-3 py-2.5 text-right tabular-nums">{totalTotal.toFixed(2)} €</td>
                                                                            <td className="px-3 py-2.5 text-right tabular-nums">{totalPending.toFixed(2)} €</td>
                                                                            <td></td>
                                                                        </tr>
                                                                    </tfoot>
                                                                )}
                                                            </table>
                                                            {filtered.length === 0 && (
                                                                <div className="py-8 text-center text-sm text-muted-foreground">No se encontraron facturas con estos filtros</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Contacts */}
                                    {holdedSection === 'contacts' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {holdedContacts.slice(0, 50).map((contact: any, i: number) => (
                                                <div key={contact.id || i} className="bg-card border rounded-xl p-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                            {(contact.name || '?').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-foreground truncate">{contact.name || 'Sin nombre'}</p>
                                                            {contact.email && <p className="text-[10px] text-muted-foreground truncate">{contact.email}</p>}
                                                        </div>
                                                    </div>
                                                    {contact.vatnumber && (
                                                        <p className="text-[10px] text-muted-foreground mt-2 font-mono">NIF: {contact.vatnumber}</p>
                                                    )}
                                                </div>
                                            ))}
                                            {holdedContacts.length === 0 && (
                                                <div className="col-span-full py-8 text-center text-sm text-muted-foreground">No se encontraron contactos</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Treasury */}
                                    {holdedSection === 'treasury' && (
                                        <div className="space-y-3">
                                            {/* Total balance */}
                                            <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
                                                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Saldo Total</span>
                                                <span className="text-xl font-bold text-blue-900 dark:text-blue-100 tabular-nums">
                                                    {holdedTreasury.reduce((s: number, a: any) => s + (a.balance || 0), 0).toFixed(2)} €
                                                </span>
                                            </div>
                                            {holdedTreasury.map((acc: any, i: number) => (
                                                <div key={acc.id || i} className="bg-card border rounded-xl p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <Landmark size={18} className="text-primary" />
                                                            <div>
                                                                <p className="text-sm font-semibold text-foreground">{acc.name || 'Cuenta'}</p>
                                                                {acc.iban && <p className="text-[10px] text-muted-foreground font-mono">{acc.iban}</p>}
                                                            </div>
                                                        </div>
                                                        {acc.balance != null && (
                                                            <span className="text-lg font-bold text-foreground tabular-nums">
                                                                {Number(acc.balance).toFixed(2)} €
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {holdedTreasury.length === 0 && (
                                                <div className="py-8 text-center text-sm text-muted-foreground">No se encontraron cuentas de tesorería</div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : holdedStatus ? (
                                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                                    <p className="text-sm text-red-700 dark:text-red-300">Error de conexión: {holdedStatus.error}</p>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="p-6 border-b">
                            <h3 className="text-lg font-bold text-foreground">Crear API Key</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Define un nombre y los permisos para esta clave.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-foreground">Nombre *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="ej: Chatbot Producción"
                                    className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-foreground">Expiración (opcional)</label>
                                <input
                                    type="date"
                                    value={newExpires}
                                    onChange={e => setNewExpires(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-foreground mb-2 block">Permisos</label>
                                <div className="space-y-3">
                                    {Object.entries(groupedScopes).map(([module, moduleScopes]) => (
                                        <div key={module}>
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{module}</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {moduleScopes.map(scope => (
                                                    <button
                                                        key={scope.key}
                                                        type="button"
                                                        onClick={() => togglePermission(scope.key)}
                                                        className={cn(
                                                            'px-2 py-1 rounded-md text-xs font-medium transition-all border',
                                                            newPermissions.includes(scope.key)
                                                                ? 'bg-primary/10 border-primary/30 text-primary'
                                                                : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60'
                                                        )}
                                                    >
                                                        {scope.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t flex justify-end gap-2">
                            <button
                                onClick={() => { setShowCreateModal(false); setNewName(''); setNewPermissions([]); setNewExpires(''); }}
                                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || creating}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {creating ? 'Creando...' : 'Crear Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Documentation Module Card ──────────────────
function DocModuleCard({ module }: { module: DocModule }) {
    const [expanded, setExpanded] = useState(false);

    const methodColors: Record<string, string> = {
        GET: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
        POST: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
        PATCH: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
        PUT: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
        DELETE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    };

    return (
        <div className="bg-card border rounded-xl overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{module.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {module.scope}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {module.endpoints.length} endpoint{module.endpoints.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
            </button>
            {expanded && (
                <div className="border-t divide-y">
                    {module.endpoints.map((ep, i) => (
                        <div key={i} className="px-5 py-3 flex items-start gap-3">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 mt-0.5', methodColors[ep.method] || 'bg-gray-100 text-gray-700')}>
                                {ep.method}
                            </span>
                            <div className="flex-1 min-w-0">
                                <code className="text-xs font-mono text-foreground">{ep.path}</code>
                                <p className="text-xs text-muted-foreground mt-0.5">{ep.description}</p>
                                {ep.params && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {ep.params.map((p, j) => (
                                            <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
