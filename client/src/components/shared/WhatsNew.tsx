import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
    Sparkles, X, CheckCheck,
    Handshake, Shield, LayoutDashboard, Building2, Moon, LogIn, UserCog,
    Rocket, Wrench, Bug, Gift
} from 'lucide-react';
import { CHANGELOG, ChangelogEntry, getSeenIds, markAllSeen } from '@/lib/changelog';

// ── Icon map ─────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
    Handshake, Shield, LayoutDashboard, Building2, Moon, LogIn, UserCog, Rocket, Gift,
};

// ── Type config ──────────────────────────────────────────
const TYPE_CONFIG: Record<ChangelogEntry['type'], {
    label: string;
    icon: React.ElementType;
    gradient: string;
    gradientDark: string;
    badge: string;
    badgeDark: string;
    accent: string;
}> = {
    new_module: {
        label: 'Nuevo',
        icon: Rocket,
        gradient: 'from-emerald-50 to-cyan-50 border-emerald-200/60',
        gradientDark: 'from-emerald-950/40 to-cyan-950/30 border-emerald-700/30',
        badge: 'bg-emerald-100 text-emerald-700 ring-emerald-500/20',
        badgeDark: 'bg-emerald-900/40 text-emerald-300 ring-emerald-400/20',
        accent: 'text-emerald-600 dark:text-emerald-400',
    },
    improvement: {
        label: 'Mejora',
        icon: Wrench,
        gradient: 'from-blue-50 to-indigo-50 border-blue-200/60',
        gradientDark: 'from-blue-950/40 to-indigo-950/30 border-blue-700/30',
        badge: 'bg-blue-100 text-blue-700 ring-blue-500/20',
        badgeDark: 'bg-blue-900/40 text-blue-300 ring-blue-400/20',
        accent: 'text-blue-600 dark:text-blue-400',
    },
    fix: {
        label: 'Corrección',
        icon: Bug,
        gradient: 'from-amber-50 to-orange-50 border-amber-200/60',
        gradientDark: 'from-amber-950/40 to-orange-950/30 border-amber-700/30',
        badge: 'bg-amber-100 text-amber-700 ring-amber-500/20',
        badgeDark: 'bg-amber-900/40 text-amber-300 ring-amber-400/20',
        accent: 'text-amber-600 dark:text-amber-400',
    },
    in_progress: {
        label: 'En desarrollo',
        icon: Wrench,
        gradient: 'from-violet-50 to-purple-50 border-violet-200/60',
        gradientDark: 'from-violet-950/40 to-purple-950/30 border-violet-700/30',
        badge: 'bg-violet-100 text-violet-700 ring-violet-500/20',
        badgeDark: 'bg-violet-900/40 text-violet-300 ring-violet-400/20',
        accent: 'text-violet-600 dark:text-violet-400',
    },
};



// ══════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════

export function WhatsNew() {
    const { hasPermission, isSuperAdmin, isPartner } = useAuth();
    const { isDark } = useTheme();
    const [open, setOpen] = useState(false);
    const [seenIds, setSeenIds] = useState<Set<string>>(() => getSeenIds());
    const panelRef = useRef<HTMLDivElement>(null);

    // ── Filter entries by user permissions ────────────────
    const visibleEntries = useMemo(() => {
        if (isPartner()) return []; // Partners don't see novedades
        return CHANGELOG.filter(entry => {
            // superadminOnly entries
            if (entry.superadminOnly && !isSuperAdmin()) return false;
            // Module-specific entries: check permission
            if (entry.moduleKey && !isSuperAdmin() && !hasPermission(entry.moduleKey)) return false;
            return true;
        }).slice(0, 5);
    }, [hasPermission, isSuperAdmin, isPartner]);

    const unseenCount = useMemo(() => {
        return visibleEntries.filter(e => !seenIds.has(e.id)).length;
    }, [visibleEntries, seenIds]);

    // ── Close on outside click ───────────────────────────
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    // ── Mark all as seen ─────────────────────────────────
    const handleMarkAllSeen = () => {
        const ids = visibleEntries.map(e => e.id);
        markAllSeen(ids);
        setSeenIds(new Set([...seenIds, ...ids]));
    };

    // ── Don't render if no entries (or partner) ──────────
    if (visibleEntries.length === 0) return null;

    return (
        <div className="relative" ref={panelRef}>
            {/* ── Trigger Button ── */}
            <button
                onClick={() => setOpen(prev => !prev)}
                className={`relative flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-200
                    ${open
                        ? isDark ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'
                        : isDark ? 'text-muted-foreground hover:text-primary hover:bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                    }`}
                title="Novedades"
            >
                <Sparkles size={18} className={unseenCount > 0 && !open ? 'animate-pulse' : ''} />

                {/* Badge */}
                {unseenCount > 0 && (
                    <span className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 shadow-lg
                        ${isDark
                            ? 'bg-primary text-primary-foreground shadow-primary/40'
                            : 'bg-red-500 text-white shadow-red-500/30'
                        }`}
                        style={isDark ? { boxShadow: '0 0 12px hsl(195 100% 50% / 0.5)' } : undefined}
                    >
                        {unseenCount}
                    </span>
                )}
            </button>

            {/* ── Panel ── */}
            {open && (
                <div
                    className={`absolute right-0 sm:-right-4 md:right-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-[420px] max-h-[80vh] rounded-2xl border shadow-2xl overflow-hidden z-50
                        ${isDark
                            ? 'bg-card/95 border-border backdrop-blur-xl'
                            : 'bg-white/95 border-gray-200/80 backdrop-blur-xl'
                        }`}
                    style={{
                        animation: 'slideInPanel 0.25s ease-out',
                    }}
                >
                    {/* Header */}
                    <div className={`sticky top-0 z-10 px-5 py-4 border-b backdrop-blur-sm
                        ${isDark ? 'bg-card/80 border-border' : 'bg-white/80 border-gray-100'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className={`flex items-center justify-center h-8 w-8 rounded-lg
                                    ${isDark ? 'bg-primary/15' : 'bg-gradient-to-br from-violet-100 to-cyan-100'}`}>
                                    <Gift size={16} className={isDark ? 'text-primary' : 'text-violet-600'} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground leading-none">Novedades</h3>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {unseenCount > 0 ? `${unseenCount} sin ver` : 'Todo al día'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {unseenCount > 0 && (
                                    <button
                                        onClick={handleMarkAllSeen}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                                            ${isDark
                                                ? 'text-primary hover:bg-primary/10'
                                                : 'text-blue-600 hover:bg-blue-50'
                                            }`}
                                    >
                                        <CheckCheck size={13} />
                                        Marcar vistas
                                    </button>
                                )}
                                <button
                                    onClick={() => setOpen(false)}
                                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Entries */}
                    <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-3 space-y-2.5">
                        {visibleEntries.map((entry, i) => {
                            const config = TYPE_CONFIG[entry.type];
                            const TypeIcon = config.icon;
                            const EntryIcon = entry.icon ? ICON_MAP[entry.icon] : null;
                            const isUnseen = !seenIds.has(entry.id);

                            return (
                                <div
                                    key={entry.id}
                                    className={`group relative rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-md
                                        ${isDark
                                            ? `bg-gradient-to-br ${config.gradientDark} ${isUnseen ? 'ring-1 ring-primary/20' : ''}`
                                            : `bg-gradient-to-br ${config.gradient} ${isUnseen ? 'ring-1 ring-blue-300/40' : ''}`
                                        }`}
                                    style={{
                                        animation: `fadeSlideIn 0.3s ease-out ${i * 0.06}s both`,
                                    }}
                                >
                                    {/* Unseen dot */}
                                    {isUnseen && (
                                        <div className={`absolute top-3 right-3 h-2 w-2 rounded-full
                                            ${isDark ? 'bg-primary shadow-[0_0_8px_hsl(195_100%_50%/0.6)]' : 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]'}`}
                                        />
                                    )}

                                    <div className="flex gap-3">
                                        {/* Icon */}
                                        <div className={`flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg transition-colors
                                            ${isDark
                                                ? 'bg-white/5 group-hover:bg-white/10'
                                                : 'bg-white/70 group-hover:bg-white/90'
                                            }`}>
                                            {EntryIcon
                                                ? <EntryIcon size={18} className={config.accent} />
                                                : <TypeIcon size={18} className={config.accent} />
                                            }
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ring-1
                                                    ${isDark ? config.badgeDark : config.badge}`}>
                                                    <TypeIcon size={10} />
                                                    {config.label}
                                                </span>
                                            </div>

                                            <h4 className={`text-sm font-semibold leading-tight mb-1
                                                ${isDark ? 'text-foreground' : 'text-gray-900'}`}>
                                                {entry.title}
                                            </h4>

                                            <p className={`text-xs leading-relaxed
                                                ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
                                                {entry.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Footer hint */}
                        <div className="flex items-center justify-center gap-1.5 pt-2 pb-1">
                            <span className="text-[10px] text-muted-foreground/60">
                                Mostrando {visibleEntries.length} novedades según tus permisos
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes slideInPanel {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
