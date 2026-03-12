import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Receipt, BarChart3, CreditCard, Users,
    PieChart, FileText, Settings, LogOut, Wallet, Handshake,
    LineChart, Building2, ChevronDown, ChevronRight, Shield, X, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { getModuleHighlights, dismissModuleHighlight, ChangelogEntry } from '@/lib/changelog';

const Icons: Record<string, any> = {
    LayoutDashboard, Receipt, BarChart3, CreditCard, Users,
    PieChart, FileText, Settings, Wallet, Handshake,
    LineChart, Building2, Shield, Activity
};

// ── Highlight Tooltip (rendered via portal to body) ──────
function HighlightTooltip({
    highlight,
    anchorRef,
    onDismiss,
    onClose,
    onHoverChange,
    isDark,
}: {
    highlight: ChangelogEntry;
    anchorRef: React.RefObject<HTMLSpanElement | null>;
    onDismiss: () => void;
    onClose: () => void;
    onHoverChange: (isHovered: boolean) => void;
    isDark: boolean;
}) {
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({
                top: rect.top - 4,
                left: rect.right + 14,
            });
        }
    }, [anchorRef]);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        }
        setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose, anchorRef]);

    return createPortal(
        <div
            ref={tooltipRef}
            className={cn(
                'fixed w-72 rounded-xl border p-4 shadow-2xl z-[9999]',
                isDark
                    ? 'bg-card border-border backdrop-blur-xl'
                    : 'bg-white border-gray-200 shadow-xl'
            )}
            style={{
                top: pos.top,
                left: pos.left,
                animation: 'fadeSlideInRight 0.2s ease-out',
            }}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
        >
            {/* Arrow */}
            <div className={cn(
                'absolute left-0 top-4 -translate-x-[5px] w-2.5 h-2.5 rotate-45 border-l border-b',
                isDark ? 'bg-card border-border' : 'bg-white border-gray-200'
            )} />

            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <span className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-2',
                        highlight.type === 'new_module'
                            ? isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                            : highlight.type === 'improvement'
                                ? isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'
                                : isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'
                    )}>
                        {highlight.type === 'new_module' ? '✨ Nuevo' : highlight.type === 'improvement' ? '🔧 Mejora' : '🐛 Fix'}
                    </span>
                    <h4 className="text-xs font-semibold text-foreground leading-tight mb-1.5">
                        {highlight.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {highlight.description}
                    </p>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                    className={cn(
                        'flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-lg transition-colors',
                        isDark ? 'hover:bg-white/10 text-muted-foreground hover:text-foreground' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                    )}
                    title="Descartar"
                >
                    <X size={13} />
                </button>
            </div>
        </div>,
        document.body
    );
}

// ── Pulsing Dot with refined hover logic ───────────────
function HighlightDot({
    moduleKey,
    highlight,
    isDark,
    onDismiss,
}: {
    moduleKey: string;
    highlight: ChangelogEntry;
    isDark: boolean;
    onDismiss: (moduleKey: string, entryId: string) => void;
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const dotRef = useRef<HTMLSpanElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleOpen = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowTooltip(true);
    };

    const handleClose = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setShowTooltip(false);
        }, 300); // 300ms to move from dot to tooltip
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return (
        <>
            <span
                ref={dotRef}
                className="relative flex h-3 w-3 cursor-pointer z-10 ml-auto"
                onMouseEnter={handleOpen}
                onMouseLeave={handleClose}
            >
                <span className={cn(
                    'absolute inset-0 rounded-full animate-ping opacity-60',
                    isDark ? 'bg-primary' : 'bg-blue-500'
                )} />
                <span className={cn(
                    'relative inline-flex h-3 w-3 rounded-full',
                    isDark ? 'bg-primary shadow-[0_0_10px_hsl(195_100%_50%/0.6)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]'
                )} />
            </span>

            {showTooltip && (
                <HighlightTooltip
                    highlight={highlight}
                    anchorRef={dotRef}
                    isDark={isDark}
                    onClose={() => setShowTooltip(false)}
                    onHoverChange={(hovered) => hovered ? handleOpen() : handleClose()}
                    onDismiss={() => {
                        onDismiss(moduleKey, highlight.id);
                        setShowTooltip(false);
                    }}
                />
            )}
        </>
    );
}

// ══════════════════════════════════════════════════════════
// Sidebar
// ══════════════════════════════════════════════════════════

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const location = useLocation();
    const { hasPermission, isSuperAdmin, isDeptHead, isPartner, profile, signOut } = useAuth();
    const { isDark } = useTheme();
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        '/departamentos': true
    });
    const [moduleHighlights, setModuleHighlights] = useState<Map<string, ChangelogEntry>>(() => getModuleHighlights());

    const handleDismissHighlight = useCallback((moduleKey: string, entryId: string) => {
        dismissModuleHighlight(entryId);
        setModuleHighlights(prev => {
            const next = new Map(prev);
            next.delete(moduleKey);
            return next;
        });
    }, []);

    const toggleMenu = (path: string) => {
        setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const visibleItems = NAV_ITEMS.filter(item => {
        if (isPartner()) {
            return item.requiredPermission === 'commissions';
        }
        if (item.superadminOnly && !isSuperAdmin()) return false;
        if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
        return true;
    });

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/50 md:hidden animate-in fade-in"
                    onClick={onClose}
                />
            )}
            <div className={cn(
                "h-screen w-60 bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out md:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>

            {/* Logo */}
            <div className="h-14 px-5 flex items-center gap-3 border-b border-sidebar-border flex-shrink-0">
                <div className={cn(
                    'h-9 w-9 flex items-center justify-center flex-shrink-0 relative overflow-hidden',
                )}>
                    <img src="/src/assets/logo.png" alt="Logo" className="h-full w-full object-contain" />
                </div>

                <div>
                    <p className={cn(
                        'text-sm font-bold leading-none tracking-tight',
                        isDark ? 'text-primary neon-text' : 'text-sidebar-foreground'
                    )}>
                        Finance
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/50 tracking-widest uppercase leading-none mt-0.5">
                        Immoral Growth
                    </p>
                </div>
            </div>

            {/* Perfil mini */}
            {profile && (
                <div className="px-4 py-3 border-b border-sidebar-border flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className={cn(
                            'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                            isDark ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'bg-primary/10 text-primary'
                        )}>
                            {profile.display_name?.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                                {profile.display_name}
                            </p>
                            <span className={cn(
                                'text-[9px] uppercase tracking-wider font-semibold',
                                isDark ? 'text-primary/70' : 'text-primary/60'
                            )}>
                                {profile.role === 'superadmin' ? 'Admin' : profile.role === 'dept_head' ? 'Jefe Depto' : profile.role === 'partner' ? 'Partner' : 'Usuario'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
                {visibleItems.map((item) => {
                    const Icon = Icons[item.icon || ''];
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedMenus[item.path];
                    const isActive = location.pathname === item.path;
                    const isChildActive = hasChildren && item.children!.some(c => location.pathname === c.path);

                    if (hasChildren) {
                        let filteredChildren = item.children!;
                        if (isDeptHead() && profile?.department_code) {
                            filteredChildren = item.children!.filter(c => {
                                if (!c.deptCode) return true;
                                return c.deptCode === profile.department_code;
                            });
                        }
                        if (filteredChildren.length === 0) return null;

                        const parentHighlight = item.requiredPermission ? moduleHighlights.get(item.requiredPermission) : undefined;

                        return (
                            <div key={item.path}>
                                <button
                                    onClick={() => toggleMenu(item.path)}
                                    className={cn(
                                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-xs font-medium w-full',
                                        isChildActive
                                            ? isDark
                                                ? 'bg-primary/15 text-primary'
                                                : 'bg-sidebar-accent text-sidebar-accent-foreground'
                                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                                    )}
                                >
                                    {Icon && <Icon size={16} className={isChildActive && isDark ? 'text-primary' : ''} />}
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {parentHighlight && (
                                        <HighlightDot
                                            moduleKey={item.requiredPermission!}
                                            highlight={parentHighlight}
                                            isDark={isDark}
                                            onDismiss={handleDismissHighlight}
                                        />
                                    )}
                                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                                {isExpanded && (
                                    <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border/60 pl-2.5">
                                        {filteredChildren.map(child => {
                                            const isChildItemActive = location.pathname === child.path;
                                            return (
                                                <Link
                                                    key={child.path}
                                                    to={child.path}
                                                    className={cn(
                                                        'flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-xs',
                                                        isChildItemActive
                                                            ? isDark
                                                                ? 'bg-primary/15 text-primary font-semibold'
                                                                : 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                                                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
                                                    )}
                                                >
                                                    <div className={cn(
                                                        'h-1.5 w-1.5 rounded-full flex-shrink-0',
                                                        isChildItemActive
                                                            ? isDark ? 'bg-primary' : 'bg-primary'
                                                            : 'bg-sidebar-foreground/25'
                                                    )} />
                                                    {child.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    const highlight = item.requiredPermission ? moduleHighlights.get(item.requiredPermission) : undefined;

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-xs font-medium',
                                isActive
                                    ? isDark
                                        ? 'bg-primary/15 text-primary'
                                        : 'bg-sidebar-accent text-sidebar-accent-foreground'
                                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                            )}
                        >
                            {Icon && <Icon size={16} className={isActive && isDark ? 'text-primary' : ''} />}
                            <span className="flex-1">{item.label}</span>
                            {highlight && (
                                <HighlightDot
                                    moduleKey={item.requiredPermission!}
                                    highlight={highlight}
                                    isDark={isDark}
                                    onDismiss={handleDismissHighlight}
                                />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
                <button
                    onClick={signOut}
                    className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-sidebar-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all text-xs font-medium"
                >
                    <LogOut size={16} />
                    Cerrar sesión
                </button>
            </div>

            {/* Guided highlight animations */}
            <style>{`
                @keyframes fadeSlideInRight {
                    from { opacity: 0; transform: translateX(-6px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
            </div>
        </>
    );
}
