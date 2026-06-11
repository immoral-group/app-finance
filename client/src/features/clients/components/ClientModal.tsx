import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { CreateClientDTO, Client, FeeConfig } from '../../../types/client';
import { clientsApi } from '../../../lib/api/clients';

interface ClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CreateClientDTO) => Promise<void>;
    initialData?: Client;
    readOnly?: boolean;
    defaultVerticalId?: string;
}

const DEFAULT_FEE_CONFIG: FeeConfig = {
    fee_type: 'fixed',
    fixed_pct: 10,
    variable_ranges: [
        { min: 0, max: null, pct: 10 }
    ],
    platform_cost_first: 700,
    platform_cost_additional: 300,
    calculation_type: 'auto',
    use_platform_costs: true
};

export const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, onSave, initialData, readOnly = false, defaultVerticalId }) => {
    const [formData, setFormData] = useState<CreateClientDTO>({
        name: '',
        legal_name: '',
        tax_id: '',
        email: '',
        vertical_id: '', // Optional
        fee_config: DEFAULT_FEE_CONFIG,
        notes: ''
    });
    const [verticals, setVerticals] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        clientsApi.getVerticals().then(setVerticals).catch(console.error);
    }, []);

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                legal_name: initialData.legal_name || '',
                tax_id: initialData.tax_id || '',
                email: initialData.email || '',
                vertical_id: initialData.vertical_id || '',
                fee_config: initialData.fee_config || DEFAULT_FEE_CONFIG,
                notes: initialData.notes || ''
            });
        } else {
            setFormData({
                name: '',
                legal_name: '',
                tax_id: '',
                email: '',
                vertical_id: defaultVerticalId || '',
                fee_config: DEFAULT_FEE_CONFIG,
                notes: ''
            });
        }
    }, [initialData, isOpen]);

    const updateFeeConfig = (field: keyof FeeConfig, value: any) => {
        setFormData(prev => ({
            ...prev,
            fee_config: { ...prev.fee_config, [field]: value }
        }));
    };

    const addRange = () => {
        setFormData(prev => ({
            ...prev,
            fee_config: {
                ...prev.fee_config,
                variable_ranges: [
                    ...prev.fee_config.variable_ranges,
                    { min: 0, max: null, pct: 0 }
                ]
            }
        }));
    };

    const removeRange = (index: number) => {
        setFormData(prev => ({
            ...prev,
            fee_config: {
                ...prev.fee_config,
                variable_ranges: prev.fee_config.variable_ranges.filter((_, i) => i !== index)
            }
        }));
    };

    const updateRange = (index: number, field: 'min' | 'max' | 'pct', value: number | null) => {
        const newRanges = [...formData.fee_config.variable_ranges];
        newRanges[index] = { ...newRanges[index], [field]: value };
        updateFeeConfig('variable_ranges', newRanges);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Error saving client:', error);
            alert('Error saving client');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold">
                        {readOnly ? 'Detalles del Cliente' : (initialData ? 'Editar Cliente' : 'Nuevo Cliente')}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2">Información General</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Nombre Comercial *</label>
                                <Input
                                    disabled={readOnly}
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Google"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Razón Social</label>
                                <Input
                                    disabled={readOnly}
                                    value={formData.legal_name}
                                    onChange={e => setFormData({ ...formData, legal_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Vertical</label>
                                <select
                                    disabled={readOnly || !!defaultVerticalId}
                                    className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-offset-1 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                    value={formData.vertical_id || ''}
                                    onChange={e => setFormData({ ...formData, vertical_id: e.target.value })}
                                >
                                    {defaultVerticalId ? (
                                        verticals.filter(v => v.id === defaultVerticalId).map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="">-- Seleccionar --</option>
                                            {verticals.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Email Contacto</label>
                                <Input
                                    disabled={readOnly}
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">NIF/CIF</label>
                                <Input
                                    disabled={readOnly}
                                    value={formData.tax_id}
                                    onChange={e => setFormData({ ...formData, tax_id: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Fee Configuration — hidden when opened from Imsales billing (not relevant for sales) */}
                    {!defaultVerticalId && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2 flex items-center justify-between">
                            Configuración de Billing
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {formData.fee_config.calculation_type === 'auto' ? 'Cálculo Automático' : 'Manual'}
                            </span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Left Column: Fee Type */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Tipo de Fee</label>
                                    <select
                                        disabled={readOnly}
                                        className="w-full border rounded-md p-2 text-sm bg-white"
                                        value={formData.fee_config.fee_type}
                                        onChange={e => updateFeeConfig('fee_type', e.target.value)}
                                    >
                                        <option value="fixed">Fijo (% constante)</option>
                                        <option value="variable">Variable (por rangos)</option>
                                    </select>
                                </div>

                                {formData.fee_config.fee_type === 'fixed' ? (
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">% Base Fee</label>
                                        <div className="relative">
                                            <Input
                                                disabled={readOnly}
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={formData.fee_config.fixed_pct}
                                                onChange={e => updateFeeConfig('fixed_pct', parseFloat(e.target.value))}
                                                className="pr-8"
                                            />
                                            <span className="absolute right-3 top-2.5 text-gray-400">%</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="border rounded-md p-3 bg-gray-50 space-y-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-sm font-medium">Rangos de Inversión</label>
                                            {!readOnly && (
                                                <Button type="button" variant="outline" size="sm" onClick={addRange}>
                                                    <Plus className="h-3 w-3 mr-1" /> Add
                                                </Button>
                                            )}
                                        </div>
                                        {formData.fee_config.variable_ranges.map((range, idx) => (
                                            <div key={idx} className="flex gap-2 items-center text-sm">
                                                <Input
                                                    disabled={readOnly}
                                                    type="number"
                                                    placeholder="Min"
                                                    value={range.min}
                                                    onChange={e => updateRange(idx, 'min', parseFloat(e.target.value))}
                                                    className="w-20"
                                                />
                                                <span>-</span>
                                                <Input
                                                    disabled={readOnly}
                                                    type="number"
                                                    placeholder="Max (vacio = inf)"
                                                    value={range.max || ''}
                                                    onChange={e => updateRange(idx, 'max', e.target.value ? parseFloat(e.target.value) : null)}
                                                    className="w-20"
                                                />
                                                <span>€</span>
                                                <span className="text-gray-400">→</span>
                                                <div className="relative w-20">
                                                    <Input
                                                        disabled={readOnly}
                                                        type="number"
                                                        value={range.pct}
                                                        onChange={e => updateRange(idx, 'pct', parseFloat(e.target.value))}
                                                        className="pr-6"
                                                    />
                                                    <span className="absolute right-2 top-2 text-xs text-gray-400">%</span>
                                                </div>
                                                {!readOnly && (
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRange(idx)}>
                                                        <Trash2 className="h-3 w-3 text-red-500" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Platform Costs */}
                            <div className="space-y-4">
                                <div className={`p-4 rounded-md border transition-colors ${formData.fee_config.use_platform_costs !== false ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className={`text-sm font-semibold ${formData.fee_config.use_platform_costs !== false ? 'text-blue-900' : 'text-gray-500'}`}>Costos de Plataforma</h4>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="use_platform_costs"
                                                checked={formData.fee_config.use_platform_costs !== false}
                                                onChange={e => updateFeeConfig('use_platform_costs', e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                            <label htmlFor="use_platform_costs" className="text-xs text-gray-600 cursor-pointer">
                                                {formData.fee_config.use_platform_costs !== false ? 'Activo' : 'Inactivo'}
                                            </label>
                                        </div>
                                    </div>

                                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${formData.fee_config.use_platform_costs !== false ? '' : 'opacity-50 pointer-events-none'}`}>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">1ª Plataforma (Base)</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-2.5 text-gray-400">€</span>
                                                <Input
                                                    disabled={readOnly || formData.fee_config.use_platform_costs === false}
                                                    type="number"
                                                    value={formData.fee_config.platform_cost_first}
                                                    onChange={e => updateFeeConfig('platform_cost_first', parseFloat(e.target.value))}
                                                    className="pl-6"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Plataformas Adicionales</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-2.5 text-gray-400">€</span>
                                                <Input
                                                    disabled={readOnly || formData.fee_config.use_platform_costs === false}
                                                    type="number"
                                                    value={formData.fee_config.platform_cost_additional}
                                                    onChange={e => updateFeeConfig('platform_cost_additional', parseFloat(e.target.value))}
                                                    className="pl-6"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-blue-800 mt-2">
                                        * Se aplica costo base siempre que haya al menos 1 plataforma.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white border-t mt-8 py-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {readOnly ? 'Cerrar' : 'Cancelar'}
                        </Button>
                        {!readOnly && (
                            <Button type="submit">
                                {initialData ? 'Guardar Cambios' : 'Crear Cliente'}
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};
