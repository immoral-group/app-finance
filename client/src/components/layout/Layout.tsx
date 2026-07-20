import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AIChatWidget } from '@/components/shared/AIChatWidget';
import { OnboardingTour } from '@/components/shared/OnboardingTour';
import { MultiOverdueAlertBanner } from '@/features/dunning/MultiOverdueAlertBanner';
import { useAuth } from '@/context/AuthContext';

export function Layout() {
    const { profile, user } = useAuth();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();

    // Cierra el menú al cambiar de ruta
    useEffect(() => {
        setIsMobileOpen(false);
    }, [location.pathname]);

    return (
        <div className="min-h-[100dvh] bg-muted/40 font-sans">
            <Sidebar isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />
            <div className="md:pl-64 flex flex-col min-h-[100dvh] w-full transition-all">
                <Header onMenuToggle={() => setIsMobileOpen(!isMobileOpen)} />
                <MultiOverdueAlertBanner />
                <main className="flex-1 p-4 md:p-6 overflow-x-hidden md:overflow-x-auto w-full max-w-[100vw]">
                    <div className="mx-auto w-full max-w-7xl animate-in fade-in zoom-in duration-300">
                        <Outlet />
                    </div>
                </main>
            </div>
            {/* ChatHub flotante — disponible en toda la app excepto en el espacio imsales */}
            <OnboardingTour />
            {profile && profile.role !== 'partner' && !location.pathname.includes('imsales') && (
                <AIChatWidget
                    userRole={profile.role}
                    deptCode={profile.department_code}
                    year={new Date().getFullYear()}
                    currentUser={user ? { id: user.id, email: user.email || '', full_name: profile.display_name, role: profile.role } : undefined}
                />
            )}
        </div>
    );
}
