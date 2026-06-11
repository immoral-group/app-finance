import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CommissionsDashboard } from './CommissionsDashboard';
import { PartnersList } from './PartnersList';
import { PartnerDetail } from './PartnerDetail';
import { Partner, commissionsApi } from '@/lib/api/commissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ChangeLogPanel } from '@/components/ui/ChangeLogPanel';
import { useUrlState } from '@/hooks/useUrlState';

export default function CommissionsIndex() {
    const { profile, isPartner } = useAuth();
    const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
    const [activeTab, setActiveTab] = useUrlState<'dashboard' | 'partners'>('tab', 'dashboard');

    // If user is a partner, fetch their linked partner record
    const { data: partnersData } = useQuery({
        queryKey: ['partners-list'],
        queryFn: () => commissionsApi.getPartners(),
        enabled: isPartner() && !!profile?.partner_id,
    });

    // Auto-select the partner for partner-role users
    useEffect(() => {
        if (isPartner() && profile?.partner_id && partnersData?.partners) {
            const myPartner = partnersData.partners.find((p: Partner) => p.id === profile.partner_id);
            if (myPartner) {
                setSelectedPartner(myPartner);
            }
        }
    }, [isPartner, profile, partnersData]);

    // Partner-role users: show ONLY their partner detail (no tabs, no dashboard, no partner list)
    if (isPartner() && selectedPartner) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Mis Comisiones</h1>
                    <p className="text-muted-foreground mt-1">Resumen de tus comisiones y pagos.</p>
                </div>
                <PartnerDetail partner={selectedPartner} onBack={() => { }} />
            </div>
        );
    }

    // Partner-role user still loading their partner
    if (isPartner() && !selectedPartner) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    // Admin/superadmin: full module view
    if (selectedPartner) {
        return <PartnerDetail partner={selectedPartner} onBack={() => setSelectedPartner(null)} />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Comisiones</h1>
                <p className="text-muted-foreground mt-1">Gestión de comisiones generadas, socios y pagos.</p>
            </div>

            <div className="flex border-b border-border w-full mb-6">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={cn(
                        "py-2 px-4 font-medium text-sm transition-colors border-b-2",
                        activeTab === 'dashboard'
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    Dashboard
                </button>
                <button
                    onClick={() => setActiveTab('partners')}
                    className={cn(
                        "py-2 px-4 font-medium text-sm transition-colors border-b-2",
                        activeTab === 'partners'
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    Partners
                </button>
            </div>

            <div className="w-full">
                {activeTab === 'dashboard' && <CommissionsDashboard />}
                {activeTab === 'partners' && <PartnersList onSelectPartner={setSelectedPartner} />}
            </div>

            {/* Historial de cambios */}
            <ChangeLogPanel module="commissions" />
        </div>
    );
}
