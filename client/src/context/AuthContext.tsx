import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { adminApi } from '@/lib/api/admin';

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

    const fetchProfile = async () => {
        try {
            const data = await adminApi.getMyProfile();
            setProfile(data.profile);
            setPermissions(data.permissions);
        } catch (err) {
            console.warn('Could not fetch user profile:', err);
            // If profile fetch fails, user can still use app but with no permissions
            setProfile(null);
            setPermissions([]);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                fetchProfile().finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                fetchProfile().finally(() => setLoading(false));
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
        // If profile hasn't loaded yet, allow access (graceful degradation)
        if (!profile) return true;
        // Superadmin bypasses all permission checks
        if (profile.role === 'superadmin') return true;
        return permissions.some(p => p.module === module && p.can_view);
    };

    const canEdit = (module: string): boolean => {
        if (!profile) return true;
        if (profile.role === 'superadmin') return true;
        return permissions.some(p => p.module === module && p.can_edit);
    };

    // When profile is null, treat as superadmin for nav visibility
    const isSuperAdmin = () => profile?.role === 'superadmin';
    const isDeptHead = () => profile?.role === 'dept_head';
    const isPartner = () => profile?.role === 'partner';

    const refreshProfile = async () => {
        await fetchProfile();
    };

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
            {!loading && children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
