import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { adminApi } from '@/lib/api/admin';
import { activityApi } from '@/lib/api/activity';
import { Loader2 } from 'lucide-react';

export interface UserPermission {
    module: string;
    can_view: boolean;
    can_edit: boolean;
}

export interface UserProfile {
    id: string;
    display_name: string;
    email: string;
    role: 'superadmin' | 'dept_head' | 'user' | 'partner';
    department_code: string | null;
    partner_id?: string | null;
    is_active: boolean;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    permissions: UserPermission[];
    loading: boolean;
    signOut: () => Promise<void>;
    hasPermission: (module: string) => boolean;
    canEdit: (module: string) => boolean;
    isSuperAdmin: () => boolean;
    isDeptHead: () => boolean;
    isPartner: () => boolean;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    permissions: [],
    loading: true,
    signOut: async () => { },
    hasPermission: () => false,
    canEdit: () => false,
    isSuperAdmin: () => false,
    isDeptHead: () => false,
    isPartner: () => false,
    refreshProfile: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [permissions, setPermissions] = useState<UserPermission[]>([]);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);

    const fetchProfile = async () => {
        try {
            const data = await adminApi.getMyProfile();
            setProfile(data.profile);
            setPermissions(data.permissions);
        } catch (err) {
            console.warn('Could not fetch user profile:', err);
            setProfile(null);
            setPermissions([]);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                fetchProfile().finally(() => {
                    setLoading(false);
                    initialLoadDone.current = true;
                });
            } else {
                setLoading(false);
                initialLoadDone.current = true;
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                // SOLO bloquear rendering en la carga inicial.
                // En TOKEN_REFRESHED (al volver a la pestaña) NO poner loading=true,
                // porque eso desmonta y remonta toda la app perdiendo todo el estado.
                if (!initialLoadDone.current) {
                    setLoading(true);
                }

                fetchProfile().then(() => {
                    if (_event === 'SIGNED_IN' && session.user?.id) {
                        activityApi.logActivity(session.user.id, 'login').catch(() => { });
                    }
                }).finally(() => {
                    setLoading(false);
                    initialLoadDone.current = true;
                });
            } else {
                setProfile(null);
                setPermissions([]);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setPermissions([]);
    };

    const hasPermission = (module: string): boolean => {
        if (!profile) return true;
        if (profile.role === 'superadmin') return true;
        return permissions.some(p => p.module === module && p.can_view);
    };

    const canEdit = (module: string): boolean => {
        if (!profile) return true;
        if (profile.role === 'superadmin') return true;
        return permissions.some(p => p.module === module && p.can_edit);
    };

    const isSuperAdmin = () => profile?.role === 'superadmin';
    const isDeptHead = () => profile?.role === 'dept_head';
    const isPartner = () => profile?.role === 'partner';

    const refreshProfile = async () => {
        await fetchProfile();
    };

    // SOLO mostrar loader en la carga INICIAL.
    // Después de eso, renderizar children SIEMPRE para no perder estado.
    if (!initialLoadDone.current) {
        return (
            <AuthContext.Provider value={{
                session,
                user: session?.user ?? null,
                profile,
                permissions,
                loading,
                signOut,
                hasPermission,
                canEdit,
                isSuperAdmin,
                isDeptHead,
                isPartner,
                refreshProfile,
            }}>
                <div className="flex h-screen items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </AuthContext.Provider>
        );
    }

    return (
        <AuthContext.Provider value={{
            session,
            user: session?.user ?? null,
            profile,
            permissions,
            loading,
            signOut,
            hasPermission,
            canEdit,
            isSuperAdmin,
            isDeptHead,
            isPartner,
            refreshProfile,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
