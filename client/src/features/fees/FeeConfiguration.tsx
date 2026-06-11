import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';

interface FeeTier {
    min_investment: number;
    max_investment: number | null;
    fee_percentage: number;
    fixed_cost: number;
}

export default function FeeConfiguration() {
    const queryClient = useQueryClient();
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [tiers, setTiers] = useState<FeeTier[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch Clients
    const { data: clientsData, isLoading: loadingClients } = useQuery({
        queryKey: ['clients'],
        queryFn: adminApi.getClients
    });

    // Fetch Tiers when client is selected
    const { data: tiersData, isLoading: loadingTiers } = useQuery({
        queryKey: ['fee-tiers', selectedClientId],
        queryFn: () => adminApi.getFeeTiers(selectedClientId),
        enabled: !!selectedClientId,
    });

    // Sync state with fetched data
    useEffect(() => {
        if (tiersData?.tiers) {
            setTiers(tiersData.tiers.map(t => ({
                min_investment: Number(t.min_investment),
                max_investment: t.max_investment ? Number(t.max_investment) : null,
                fee_percentage: Number(t.fee_percentage),
                fixed_cost: Number(t.fixed_cost || 0)
            })));
            setHasChanges(false);
        } else {
            setTiers([]); // clear if no data or new client
        }
    }, [tiersData]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!selectedClientId) return;
            await adminApi.updateFeeTiers(selectedClientId, tiers);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fee-tiers', selectedClientId] });
            setHasChanges(false);
            alert('Fee tiers saved successfully!');
        },
        onError: (error) => {
            alert('Failed to save fees')
            console.error(error)
        }
    });

    const handleAddTier = () => {
        const lastMax = tiers.length > 0 ? tiers[tiers.length - 1].max_investment : 0;
        setTiers([
            ...tiers,
            {
                min_investment: lastMax || 0,
                max_investment: null,
                fee_percentage: 10,
                fixed_cost: 0
            }
        ]);
        setHasChanges(true);
    };

    const handleRemoveTier = (index: number) => {
        const newTiers = [...tiers];
        newTiers.splice(index, 1);
        setTiers(newTiers);
        setHasChanges(true);
    };

    const updateTier = (index: number, field: keyof FeeTier, value: any) => {
        const newTiers = [...tiers];
        newTiers[index] = { ...newTiers[index], [field]: value };
        setTiers(newTiers);
        setHasChanges(true);
    };

    if (loadingClients) return <div>Loading clients...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Fee Configuration</h1>
                <div className="flex items-center gap-2">
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                    >
                        <option value="">Select a Client</option>
                        {clientsData?.clients?.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedClientId ? (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Investment Tiers & Fees</CardTitle>
                        <Button onClick={handleAddTier} size="sm" variant="outline" className="gap-2">
                            <Plus size={16} /> Add Tier
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {loadingTiers ? (
                            <div className="p-4 text-center">Loading tiers...</div>
                        ) : (
                            <div className="space-y-4">
                                {tiers.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No fee tiers configured. Click "Add Tier" to start.
                                    </div>
                                ) : (
                                    <div className="border rounded-md">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 border-b">
                                                <tr>
                                                    <th className="h-10 px-4 text-left font-medium">Min Investment</th>
                                                    <th className="h-10 px-4 text-left font-medium">Max Investment</th>
                                                    <th className="h-10 px-4 text-left font-medium">Fee %</th>
                                                    <th className="h-10 px-4 text-left font-medium">Fixed Cost</th>
                                                    <th className="h-10 px-4 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {tiers.map((tier, i) => (
                                                    <tr key={i} className="hover:bg-muted/50">
                                                        <td className="p-2">
                                                            <Input
                                                                type="number"
                                                                value={tier.min_investment}
                                                                onChange={(e) => updateTier(i, 'min_investment', Number(e.target.value))}
                                                                className="w-full"
                                                            />
                                                        </td>
                                                        <td className="p-2">
                                                            <Input
                                                                type="number"
                                                                placeholder="Unlimited"
                                                                value={tier.max_investment ?? ''}
                                                                onChange={(e) => updateTier(i, 'max_investment', e.target.value ? Number(e.target.value) : null)}
                                                                className="w-full"
                                                            />
                                                        </td>
                                                        <td className="p-2">
                                                            <div className="relative">
                                                                <Input
                                                                    type="number"
                                                                    value={tier.fee_percentage}
                                                                    onChange={(e) => updateTier(i, 'fee_percentage', Number(e.target.value))}
                                                                    className="w-full pr-6" step="0.01"
                                                                />
                                                                <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-2">
                                                            <Input
                                                                type="number"
                                                                value={tier.fixed_cost}
                                                                onChange={(e) => updateTier(i, 'fixed_cost', Number(e.target.value))}
                                                                className="w-full"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                onClick={() => handleRemoveTier(i)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="flex justify-end pt-4">
                                    <Button
                                        onClick={() => saveMutation.mutate()}
                                        disabled={!hasChanges || saveMutation.isPending}
                                        className="gap-2"
                                    >
                                        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                        <Save size={16} />
                                        Save Changes
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/10">
                    <p className="text-lg font-medium text-muted-foreground">Please select a client to configure fees</p>
                </div>
            )}
        </div>
    );
}
