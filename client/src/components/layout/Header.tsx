import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sun, Moon, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { WhatsNew } from '@/components/shared/WhatsNew';

export function Header() {
    const { profile, signOut, isSuperAdmin } = useAuth();
    const { toggleTheme, isDark } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const displayName = profile?.display_name || 'Usuario';
    const roleLabel =
        profile?.role === 'superadmin' ? 'Superadmin' :
            profile?.role === 'dept_head' ? 'Jefe de Depto.' : 'Usuario';

    const initials = displayName
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase();

    // Cerrar menú al hacer click fuera
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="h-14 px-5 border-b border-border bg-card flex items-center justify-between sticky top-0 z-30 w-full backdrop-blur-sm">

            {/* Buscador */}
            <div className="w-72">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar…"
                        className="w-full h-8 pl-8 pr-3 rounded-lg border border-input bg-muted/50 text-sm outline-none focus:ring-1 focus:ring-ring transition-all placeholder:text-muted-foreground/60"
                    />
                </div>
            </div>

            {/* Right side: What's New + User */}
            <div className="flex items-center gap-2">
                <WhatsNew />

                {/* Usuario */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(prev => !prev)}
                        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-accent/60 transition-all group"
                    >
                        {/* Avatar */}
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
                        ${isDark
                                ? 'bg-primary/20 text-primary ring-1 ring-primary/40 group-hover:ring-primary/70 neon-glow'
                                : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                            }`}>
                            {initials}
                        </div>
                        <div className="text-left hidden md:block">
                            <p className="text-xs font-semibold leading-none text-foreground">{displayName}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{roleLabel}</p>
                        </div>
                        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown */}
                    {menuOpen && (
                        <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl border border-border shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150
                        ${isDark ? 'bg-card' : 'bg-white'}`}>

                            {/* Info usuario */}
                            <div className="px-4 py-3 border-b border-border">
                                <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
                            </div>

                            <div className="p-1.5 space-y-0.5">
                                {/* Toggle tema */}
                                <button
                                    onClick={() => { toggleTheme(); setMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent/60 transition-colors"
                                >
                                    {isDark ? (
                                        <><Sun className="w-4 h-4 text-amber-400" /><span>Modo claro</span></>
                                    ) : (
                                        <><Moon className="w-4 h-4 text-indigo-500" /><span>Modo oscuro</span></>
                                    )}
                                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium
                                    ${isDark ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                                        {isDark ? 'DARK' : 'LIGHT'}
                                    </span>
                                </button>

                                {/* Configuración */}
                                {isSuperAdmin() && (
                                    <Link
                                        to="/settings"
                                        onClick={() => setMenuOpen(false)}
                                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent/60 transition-colors"
                                    >
                                        <Settings className="w-4 h-4 text-muted-foreground" />
                                        <span>Configuración</span>
                                    </Link>
                                )}

                                <div className="h-px bg-border my-1" />

                                {/* Sign out */}
                                <button
                                    onClick={() => { signOut(); setMenuOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>Cerrar sesión</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
