import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Receipt, BarChart3, CreditCard, Users,
    PieChart, FileText, Settings, LogOut, Wallet, Handshake,
    LineChart, Building2, ChevronDown, ChevronRight, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const Icons: Record<string, any> = {
    LayoutDashboard, Receipt, BarChart3, CreditCard, Users,
    PieChart, FileText, Settings, Wallet, Handshake,
    LineChart, Building2, Shield
};

export function Sidebar() {
    const location = useLocation();
    const { hasPermission, isSuperAdmin, isDeptHead, isPartner, profile, signOut } = useAuth();
    const { isDark } = useTheme();
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        '/departamentos': true
    });

    const toggleMenu = (path: string) => {
        setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const visibleItems = NAV_ITEMS.filter(item => {
        // Partner users: ONLY see commissions
        if (isPartner()) {
            return item.requiredPermission === 'commissions';
        }
        if (item.superadminOnly && !isSuperAdmin()) return false;
        if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
        return true;
    });

    return (
        <div className="h-screen w-60 bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0">

            {/* Logo */}
            <div className="h-14 px-5 flex items-center gap-3 border-b border-sidebar-border flex-shrink-0">
                {/* Icono marca */}
                <div className={cn(
                    'h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden',
                    isDark
                        ? 'bg-primary/20 ring-1 ring-primary/60'
                        : 'bg-primary'
                )}>
                    {isDark && (
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-transparent" />
                    )}
                    <span className={cn(
                        'text-xs font-black tracking-tighter relative z-10',
                        isDark ? 'text-primary neon-text' : 'text-white'
                    )}>FI</span>
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
                            {item.label}
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
        </div>
    );
}
