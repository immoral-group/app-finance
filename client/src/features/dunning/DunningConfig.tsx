import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    dunningApi, DunningBank, DunningConfig as DunningConfigType, DunningTemplate,
    PlanItem, PlanSummary, RunResult,
} from '@/lib/api/dunning';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import {
    Save, Settings, Calendar, Mail, Loader2, Eye, Info, Check, Play, Send, RefreshCw,
    AlertTriangle, X, Zap, Palette, Trash2, Plus,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// Configuración de Impagos — Fase 3
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'rules' | 'schedule' | 'brand' | 'templates' | 'run';

const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'rules', label: 'Reglas', icon: Settings },
    { key: 'schedule', label: 'Programación', icon: Calendar },
    { key: 'brand', label: 'Marca y bancos', icon: Palette },
    { key: 'templates', label: 'Plantillas', icon: Mail },
    { key: 'run', label: 'Ejecutar', icon: Zap },
];

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ── Tab: Reglas ────────────────────────────────────────────────────────────────

function RulesTab({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const [form, setForm] = useState(config);
    useEffect(() => setForm(config), [config]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Reglas de clasificación</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Define cuándo una factura entra en cada nivel de impago según los días vencidos.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nivel 1 · desde / hasta</label>
                        <div className="flex items-center gap-2">
                            <Input type="number" min={1} value={form.level_1_days_min}
                                onChange={e => setForm({ ...form, level_1_days_min: Number(e.target.value) })} />
                            <span className="text-muted-foreground">—</span>
                            <Input type="number" min={1} value={form.level_1_days_max}
                                onChange={e => setForm({ ...form, level_1_days_max: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nivel 2 · desde / hasta</label>
                        <div className="flex items-center gap-2">
                            <Input type="number" min={1} value={form.level_2_days_min}
                                onChange={e => setForm({ ...form, level_2_days_min: Number(e.target.value) })} />
                            <span className="text-muted-foreground">—</span>
                            <Input type="number" min={1} value={form.level_2_days_max}
                                onChange={e => setForm({ ...form, level_2_days_max: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nivel 3 · desde</label>
                        <Input type="number" min={1} value={form.level_3_days_min}
                            onChange={e => setForm({ ...form, level_3_days_min: Number(e.target.value) })} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Repetición nivel 3 (cada X días)</label>
                        <Input type="number" min={1} value={form.level_3_repeat_every_days}
                            onChange={e => setForm({ ...form, level_3_repeat_every_days: Number(e.target.value) })} />
                        <p className="text-[11px] text-muted-foreground mt-1">Frecuencia con la que se reenvía el nivel 3 mientras la factura siga impaga.</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Importe mínimo (€)</label>
                        <Input type="number" min={0} step="0.01" value={form.min_amount}
                            onChange={e => setForm({ ...form, min_amount: Number(e.target.value) })} />
                        <p className="text-[11px] text-muted-foreground mt-1">Se ignoran facturas por debajo de este importe.</p>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Copia oculta (BCC) opcional</label>
                    <Input type="email" placeholder="administracion@immoral.es"
                        value={form.bcc_email || ''}
                        onChange={e => setForm({ ...form, bcc_email: e.target.value })} />
                    <p className="text-[11px] text-muted-foreground mt-1">Cada recordatorio incluirá esta dirección en BCC para tener visibilidad interna.</p>
                </div>

                <div className="flex justify-end pt-2 border-t">
                    <Button onClick={() => onSave(form)} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                        Guardar reglas
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Tab: Programación ─────────────────────────────────────────────────────────

function ScheduleTab({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const [form, setForm] = useState(config);
    useEffect(() => setForm(config), [config]);

    const toggleDay = (day: number) => {
        const set = new Set(form.send_days || []);
        if (set.has(day)) set.delete(day); else set.add(day);
        setForm({ ...form, send_days: Array.from(set).sort() });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Cuándo se envían los recordatorios</CardTitle>
                <p className="text-xs text-muted-foreground">Elige uno o varios días de la semana y la hora del envío.</p>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                        <p className="text-sm font-semibold text-foreground">Sistema activo</p>
                        <p className="text-xs text-muted-foreground">Los recordatorios solo se enviarán si el sistema está activado.</p>
                    </div>
                    <button
                        onClick={() => setForm({ ...form, enabled: !form.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        role="switch"
                        aria-checked={form.enabled}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Días de envío</label>
                    <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((label, idx) => {
                            const active = (form.send_days || []).includes(idx);
                            return (
                                <button key={idx} onClick={() => toggleDay(idx)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                        active ? 'bg-primary text-primary-foreground border-primary'
                                              : 'bg-background text-foreground border-border hover:bg-muted'
                                    }`}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">Ejemplo: solo lunes, o lunes y jueves.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Hora</label>
                        <Input type="number" min={0} max={23} value={form.send_hour}
                            onChange={e => setForm({ ...form, send_hour: Number(e.target.value) })} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Minuto</label>
                        <Input type="number" min={0} max={59} value={form.send_minute}
                            onChange={e => setForm({ ...form, send_minute: Number(e.target.value) })} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Zona horaria</label>
                        <Input value={form.timezone}
                            onChange={e => setForm({ ...form, timezone: e.target.value })} />
                    </div>
                </div>

                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 flex items-start gap-2">
                    <Info className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs text-blue-900 dark:text-blue-200">
                        El scheduler real (cron) se conecta en Fase 2b. Por ahora esta configuración queda guardada y puedes disparar los envíos manualmente desde la tab <em>Ejecutar</em>.
                    </p>
                </div>

                <div className="flex justify-end pt-2 border-t">
                    <Button onClick={() => onSave(form)} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                        Guardar programación
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Tab: Marca y bancos ───────────────────────────────────────────────────────

function BrandTab({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const [form, setForm] = useState(config);
    useEffect(() => setForm(config), [config]);

    const updateBank = (idx: number, patch: Partial<DunningBank>) => {
        const banks = [...(form.banks || [])];
        banks[idx] = { ...banks[idx], ...patch };
        setForm({ ...form, banks });
    };
    const addBank = () => setForm({ ...form, banks: [...(form.banks || []), { name: 'Nuevo banco', url: 'https://', color: '#1e40af' }] });
    const removeBank = (idx: number) => setForm({ ...form, banks: form.banks.filter((_, i) => i !== idx) });

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Marca del email</CardTitle>
                    <p className="text-xs text-muted-foreground">Colores, logotipo textual y firma que aparecen en todos los recordatorios.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">URL del logo (imagen)</label>
                        <Input value={form.brand_logo_url} onChange={e => setForm({ ...form, brand_logo_url: e.target.value })} placeholder="https://imfinance.immoral.es/logo.png" />
                        {form.brand_logo_url && (
                            <div className="mt-2 p-3 rounded-lg bg-slate-800 inline-block">
                                <img src={form.brand_logo_url} alt="Logo preview" style={{ maxHeight: 34 }} />
                            </div>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                            URL pública del logotipo (PNG/SVG). Aparece en el hero de cada email. Por defecto se sirve <code>/logo.png</code> del propio proyecto.
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Texto del logo (fallback si no hay imagen)</label>
                        <Input value={form.brand_logo_text} onChange={e => setForm({ ...form, brand_logo_text: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Color primario (hero)</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={form.brand_primary_color}
                                    onChange={e => setForm({ ...form, brand_primary_color: e.target.value })}
                                    className="h-9 w-16 rounded border cursor-pointer" />
                                <Input value={form.brand_primary_color} onChange={e => setForm({ ...form, brand_primary_color: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Color secundario (degradado)</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={form.brand_secondary_color}
                                    onChange={e => setForm({ ...form, brand_secondary_color: e.target.value })}
                                    className="h-9 w-16 rounded border cursor-pointer" />
                                <Input value={form.brand_secondary_color} onChange={e => setForm({ ...form, brand_secondary_color: e.target.value })} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Firma (HTML)</label>
                        <textarea value={form.signature_html}
                            onChange={e => setForm({ ...form, signature_html: e.target.value })}
                            rows={3}
                            className="w-full text-sm px-3 py-2 rounded border bg-background resize-y" />
                        <p className="text-[11px] text-muted-foreground mt-1">Se admite HTML básico (&lt;br&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a&gt;).</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Botón Stripe (texto)</label>
                            <Input value={form.cta_stripe_label} onChange={e => setForm({ ...form, cta_stripe_label: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Estado (badge)</label>
                            <Input value={form.status_label} onChange={e => setForm({ ...form, status_label: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Texto antes de bancos</label>
                            <Input value={form.cta_bank_prefix} onChange={e => setForm({ ...form, cta_bank_prefix: e.target.value })} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base">Bancos para pago por transferencia</CardTitle>
                        <p className="text-xs text-muted-foreground">Botones que aparecen debajo del botón de tarjeta. Cada uno lleva a la web del banco.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addBank}>
                        <Plus size={14} className="mr-1.5" /> Añadir banco
                    </Button>
                </CardHeader>
                <CardContent>
                    {(form.banks || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No hay bancos configurados. Añade uno para que aparezca el bloque en el email.</p>
                    ) : (
                        <div className="space-y-2">
                            {form.banks.map((bank, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                                    <input type="color" value={bank.color}
                                        onChange={e => updateBank(idx, { color: e.target.value })}
                                        className="h-9 w-12 rounded border cursor-pointer shrink-0" />
                                    <Input value={bank.name} onChange={e => updateBank(idx, { name: e.target.value })} placeholder="Nombre" className="max-w-[180px]" />
                                    <Input value={bank.url} onChange={e => updateBank(idx, { url: e.target.value })} placeholder="https://..." className="flex-1" />
                                    <span
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0"
                                        style={{ background: bank.color }}
                                    >{bank.name || 'Banco'}</span>
                                    <button onClick={() => removeBank(idx)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={() => onSave(form)} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                    Guardar marca y bancos
                </Button>
            </div>
        </div>
    );
}

// ── Tab: Plantillas (V2 — formulario simple) ─────────────────────────────────

function TemplateEditorV2({ template, config, onSaved }: { template: DunningTemplate; config: DunningConfigType; onSaved: () => void }) {
    const [form, setForm] = useState(template);
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

    useEffect(() => setForm(template), [template.id]);

    const saveMutation = useMutation({
        mutationFn: () => dunningApi.updateTemplate(template.id, {
            name: form.name,
            subject: form.subject,
            hero_title: form.hero_title,
            hero_subtitle: form.hero_subtitle,
            intro_copy: form.intro_copy,
            outro_copy: form.outro_copy,
        } as any),
        onSuccess: () => onSaved(),
    });

    const previewMutation = useMutation({
        mutationFn: () => dunningApi.previewV2({ template: form, config }),
        onSuccess: (r) => setPreview({ subject: r.subject, html: r.html }),
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nombre interno</label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Asunto del email</label>
                    <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Título del hero</label>
                        <Input value={form.hero_title || ''} onChange={e => setForm({ ...form, hero_title: e.target.value })} placeholder="Segundo recordatorio de pago" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Subtítulo del hero</label>
                        <Input value={form.hero_subtitle || ''} onChange={e => setForm({ ...form, hero_subtitle: e.target.value })} placeholder="Seguimiento automático de factura pendiente" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Texto principal (antes de las tarjetas)</label>
                    <textarea value={form.intro_copy || ''} onChange={e => setForm({ ...form, intro_copy: e.target.value })}
                        rows={6} className="w-full text-sm px-3 py-2 rounded border bg-background resize-y" />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Texto de cierre (después de los bancos)</label>
                    <textarea value={form.outro_copy || ''} onChange={e => setForm({ ...form, outro_copy: e.target.value })}
                        rows={4} className="w-full text-sm px-3 py-2 rounded border bg-background resize-y" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                    Variables disponibles: <code>{'{{contact_name}}'}</code>, <code>{'{{invoice_number}}'}</code>, <code>{'{{days_overdue}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{invoice_date}}'}</code>, <code>{'{{due_date}}'}</code>.
                </p>

                <div className="flex justify-between items-center pt-2 border-t">
                    <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                        {previewMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Eye size={14} className="mr-2" />}
                        Previsualizar
                    </Button>
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : saveMutation.isSuccess ? <Check size={14} className="mr-2" /> : <Save size={14} className="mr-2" />}
                        Guardar plantilla
                    </Button>
                </div>
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
                <div className="rounded-lg border bg-card overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>Vista previa</span>
                        <button onClick={() => previewMutation.mutate()} className="text-[11px] text-primary hover:underline">
                            Recargar
                        </button>
                    </div>
                    {preview ? (
                        <div className="max-h-[720px] overflow-y-auto">
                            <div className="px-3 py-2 border-b text-xs bg-background">
                                <span className="text-muted-foreground">Asunto:</span>{' '}
                                <span className="font-semibold text-foreground">{preview.subject}</span>
                            </div>
                            <iframe title="preview" srcDoc={preview.html} sandbox=""
                                style={{ width: '100%', height: 680, border: 'none', background: '#f3f4f6' }} />
                        </div>
                    ) : (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            Pulsa <em>Previsualizar</em> para ver el email con datos de ejemplo.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TemplatesTab({ config }: { config: DunningConfigType }) {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['dunning', 'templates'],
        queryFn: () => dunningApi.listTemplates(),
    });

    const templates = data?.templates || [];
    const byLevel = useMemo(() => {
        const m = new Map<number, DunningTemplate>();
        for (const t of templates) if (t.active && !m.has(t.level)) m.set(t.level, t);
        return m;
    }, [templates]);

    const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1);
    const active = byLevel.get(activeLevel);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="animate-spin mr-2" size={18} /> Cargando plantillas…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                {([1, 2, 3] as const).map(lvl => {
                    const isActive = activeLevel === lvl;
                    return (
                        <button key={lvl} onClick={() => setActiveLevel(lvl)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                isActive ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-foreground border-border hover:bg-muted'
                            }`}>
                            Nivel {lvl}
                        </button>
                    );
                })}
                <span className="text-xs text-muted-foreground ml-auto">
                    {active ? `Editando: ${active.name}` : 'Sin plantilla activa'}
                </span>
            </div>

            {active ? (
                <TemplateEditorV2 template={active} config={config} onSaved={() => refetch()} />
            ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No hay plantilla activa para el nivel {activeLevel}.
                </div>
            )}
        </div>
    );
}

// ── Tab: Ejecutar ─────────────────────────────────────────────────────────────

function ActionRow({ title, description, action, icon: Icon, danger = false }: {
    title: string; description: string; action: React.ReactNode; icon: any; danger?: boolean;
}) {
    return (
        <div className={`rounded-lg border p-4 flex items-start gap-4 ${danger ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/50' : ''}`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-primary/10 text-primary'}`}>
                <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <div className="shrink-0">{action}</div>
        </div>
    );
}

function PreviewModal({ plan, summary, testMode, testModeEmail, onClose }: {
    plan: PlanItem[]; summary: PlanSummary; testMode: boolean; testModeEmail: string | null; onClose: () => void;
}) {
    const sends = plan.filter(p => p.action === 'send' && !!p.dest_email);
    const skips = plan.filter(p => p.action === 'skip' || (p.action === 'send' && !p.dest_email));
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card rounded-xl border shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-foreground">Preview de envíos</h3>
                        <p className="text-xs text-muted-foreground">
                            Se enviarían {summary.will_send} emails ahora mismo · N1 {summary.by_level['1']} · N2 {summary.by_level['2']} · N3 {summary.by_level['3']}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                {testMode && (
                    <div className="px-5 py-2 bg-amber-100 dark:bg-amber-950/30 border-b border-amber-300 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle size={14} /> Modo prueba activo — todos los envíos irán a <strong>{testModeEmail || '(sin destino)'}</strong>, no a los clientes.
                    </div>
                )}
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {sends.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">A enviar ({sends.length})</p>
                            <table className="w-full text-xs">
                                <thead className="text-[11px] uppercase text-muted-foreground border-b">
                                    <tr>
                                        <th className="text-left py-1.5 px-2">Factura</th>
                                        <th className="text-left py-1.5 px-2">Cliente</th>
                                        <th className="text-left py-1.5 px-2">Destino</th>
                                        <th className="text-center py-1.5 px-2">Días</th>
                                        <th className="text-center py-1.5 px-2">Nivel</th>
                                        <th className="text-right py-1.5 px-2">Importe</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {sends.map(p => (
                                        <tr key={p.invoice.id}>
                                            <td className="py-1.5 px-2 font-mono">{p.invoice.invoice_number || p.invoice.id.slice(0, 6)}</td>
                                            <td className="py-1.5 px-2">{p.invoice.contact_name}</td>
                                            <td className="py-1.5 px-2 truncate max-w-[220px]">
                                                <span className={p.redirect_reason ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                                                    {p.dest_email}
                                                </span>
                                                {p.redirect_reason && (
                                                    <span className="ml-1 text-[10px] uppercase text-amber-500">
                                                        [{p.redirect_reason === 'test_mode' ? 'PRUEBA' : 'OVERRIDE'}]
                                                    </span>
                                                )}
                                                {p.redirect_reason && p.invoice.contact_email && (
                                                    <div className="text-[10px] text-muted-foreground line-through">{p.invoice.contact_email}</div>
                                                )}
                                            </td>
                                            <td className="py-1.5 px-2 text-center font-semibold">{p.days_overdue}</td>
                                            <td className="py-1.5 px-2 text-center">
                                                <span className="inline-flex px-1.5 rounded bg-primary/10 text-primary font-semibold">N{p.level}</span>
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-semibold">{formatCurrency(p.invoice.amount, p.invoice.currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {skips.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Se omitirán ({skips.length})</p>
                            <table className="w-full text-xs">
                                <tbody className="divide-y divide-border/40">
                                    {skips.map(p => (
                                        <tr key={p.invoice.id}>
                                            <td className="py-1 px-2 font-mono text-muted-foreground">{p.invoice.invoice_number || p.invoice.id.slice(0, 6)}</td>
                                            <td className="py-1 px-2 text-muted-foreground">{p.invoice.contact_name}</td>
                                            <td className="py-1 px-2 text-muted-foreground text-[11px] italic">{p.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {plan.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8">
                            No hay facturas vencidas que requieran recordatorio ahora mismo.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function TestSendModal({ onClose }: { onClose: () => void }) {
    const [templateId, setTemplateId] = useState('');
    const [email, setEmail] = useState('');

    const { data: templatesData } = useQuery({
        queryKey: ['dunning', 'templates'],
        queryFn: () => dunningApi.listTemplates(),
    });

    const sendMutation = useMutation({
        mutationFn: () => dunningApi.testSend({ template_id: templateId, to_email: email }),
    });

    const templates = templatesData?.templates || [];

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card rounded-xl border shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">Enviar recordatorio de prueba</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Plantilla</label>
                        <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                            className="w-full text-sm px-3 py-2 rounded border bg-background">
                            <option value="">Selecciona una plantilla…</option>
                            {templates.filter(t => t.active).map(t => (
                                <option key={t.id} value={t.id}>Nivel {t.level} · {t.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Enviar a</label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
                        <p className="text-[11px] text-muted-foreground mt-1">Se rellena con datos de ejemplo. El asunto lleva prefijo [PRUEBA] y el botón Stripe apunta a un link ficticio.</p>
                    </div>
                    {sendMutation.isSuccess && (
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 flex items-start gap-2">
                            <Check className="text-emerald-600 shrink-0 mt-0.5" size={14} />
                            <p className="text-xs text-emerald-900 dark:text-emerald-200">Email enviado a {sendMutation.data?.to}</p>
                        </div>
                    )}
                    {sendMutation.isError && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 flex items-start gap-2">
                            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={14} />
                            <p className="text-xs text-red-900 dark:text-red-200">{String(sendMutation.error)}</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={onClose}>Cerrar</Button>
                        <Button onClick={() => sendMutation.mutate()}
                            disabled={!templateId || !email || sendMutation.isPending}>
                            {sendMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Send size={14} className="mr-2" />}
                            Enviar prueba
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RunResultsModal({ results, dryRun, onClose }: { results: RunResult[]; dryRun: boolean; onClose: () => void }) {
    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card rounded-xl border shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-foreground">
                            {dryRun ? 'Resultado del dry-run' : 'Envío completado'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {dryRun ? `${results.length} envíos simulados` : `${sent} enviados · ${failed} fallidos · ${skipped} omitidos`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                    {results.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">No había nada que enviar.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {results.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    {r.status === 'sent' && <Check size={14} className="text-emerald-500 shrink-0" />}
                                    {r.status === 'would-send' && <Play size={14} className="text-blue-500 shrink-0" />}
                                    {r.status === 'failed' && <X size={14} className="text-red-500 shrink-0" />}
                                    {r.status === 'skipped' && <Info size={14} className="text-muted-foreground shrink-0" />}
                                    <span className="font-mono">{r.invoice_id.slice(0, 12)}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="capitalize">{r.status}</span>
                                    {r.level && <span className="text-muted-foreground">· N{r.level}</span>}
                                    {r.to && <span className="text-muted-foreground truncate">→ {r.to}</span>}
                                    {r.reason && <span className="text-muted-foreground italic">({r.reason})</span>}
                                    {r.error && <span className="text-red-600 truncate">{r.error}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TestModePanel({ config }: { config: DunningConfigType }) {
    const queryClient = useQueryClient();
    const [email, setEmail] = useState(config.test_mode_email || '');

    useEffect(() => setEmail(config.test_mode_email || ''), [config.test_mode_email]);

    const saveMutation = useMutation({
        mutationFn: (patch: Partial<DunningConfigType>) => dunningApi.updateConfig(patch),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dunning', 'config'] }),
    });

    return (
        <Card className={config.test_mode ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/10' : ''}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            {config.test_mode && <AlertTriangle className="text-amber-500" size={18} />}
                            Modo prueba dirigido
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Cuando está activo, TODOS los recordatorios (Stripe real incluido) se envían a la dirección de prueba en lugar de a los clientes.
                            El email incluye un banner amarillo indicando el destinatario original.
                        </p>
                    </div>
                    <button
                        onClick={() => saveMutation.mutate({ test_mode: !config.test_mode, test_mode_email: email || null })}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${config.test_mode ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
                        role="switch"
                        aria-checked={config.test_mode}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${config.test_mode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Email destino de prueba</label>
                <div className="flex gap-2">
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="administracion@immoral.es" />
                    <Button onClick={() => saveMutation.mutate({ test_mode_email: email })} disabled={saveMutation.isPending} variant="outline">
                        {saveMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    </Button>
                </div>
                {config.test_mode && (
                    <div className="mt-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                        <span>
                            <strong>Sistema en modo prueba.</strong> Ni el cron ni las ejecuciones manuales enviarán a clientes reales — todo va a <strong>{config.test_mode_email || '(sin email definido)'}</strong>. Desactívalo antes de operar.
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function OverridesPanel() {
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: ['dunning', 'overrides'],
        queryFn: () => dunningApi.listOverrides(),
    });
    const [contactId, setContactId] = useState('');
    const [contactName, setContactName] = useState('');
    const [overrideEmail, setOverrideEmail] = useState('');
    const [note, setNote] = useState('');

    const addMutation = useMutation({
        mutationFn: () => dunningApi.upsertOverride(contactId, { override_email: overrideEmail, contact_name: contactName, note }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dunning', 'overrides'] });
            setContactId(''); setContactName(''); setOverrideEmail(''); setNote('');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (cid: string) => dunningApi.deleteOverride(cid),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dunning', 'overrides'] }),
    });

    const overrides = data?.overrides || [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Overrides por cliente</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Redirigir los recordatorios de un contacto concreto a otro email. Útil si el email en Holded es incorrecto o si quieres testear un caso específico sin activar el modo prueba global.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div className="md:col-span-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Contact ID (Holded)</label>
                        <Input value={contactId} onChange={e => setContactId(e.target.value)} placeholder="6123abc…" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nombre (opcional)</label>
                        <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Cliente XYZ SL" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Email destino</label>
                        <Input type="email" value={overrideEmail} onChange={e => setOverrideEmail(e.target.value)} placeholder="nuevo@email.com" />
                    </div>
                    <Button
                        onClick={() => addMutation.mutate()}
                        disabled={!contactId || !overrideEmail || addMutation.isPending}
                    >
                        {addMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Plus size={14} className="mr-2" />}
                        Añadir
                    </Button>
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nota (opcional)</label>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Motivo del override" />
                </div>

                {overrides.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin overrides configurados. Los emails van directamente al email registrado en Holded.</p>
                ) : (
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="text-[11px] uppercase text-muted-foreground border-b bg-muted/30">
                                <tr>
                                    <th className="text-left py-2 px-2">Contact ID</th>
                                    <th className="text-left py-2 px-2">Cliente</th>
                                    <th className="text-left py-2 px-2">Email destino</th>
                                    <th className="text-left py-2 px-2">Nota</th>
                                    <th className="text-right py-2 px-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {overrides.map(o => (
                                    <tr key={o.contact_id}>
                                        <td className="py-1.5 px-2 font-mono text-muted-foreground truncate max-w-[120px]">{o.contact_id}</td>
                                        <td className="py-1.5 px-2">{o.contact_name || '—'}</td>
                                        <td className="py-1.5 px-2 font-medium text-primary">{o.override_email}</td>
                                        <td className="py-1.5 px-2 text-muted-foreground italic">{o.note || '—'}</td>
                                        <td className="py-1.5 px-2 text-right">
                                            <button onClick={() => deleteMutation.mutate(o.contact_id)} className="p-1 rounded hover:bg-red-50 text-red-500">
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function RunTab({ config }: { config: DunningConfigType }) {
    const [preview, setPreview] = useState<{ plan: PlanItem[]; summary: PlanSummary; testMode: boolean; testModeEmail: string | null } | null>(null);
    const [showTestSend, setShowTestSend] = useState(false);
    const [runResults, setRunResults] = useState<{ results: RunResult[]; dryRun: boolean } | null>(null);

    const previewMutation = useMutation({
        mutationFn: () => dunningApi.previewRun(),
        onSuccess: (data) => setPreview({
            plan: data.plan,
            summary: data.summary,
            testMode: data.test_mode,
            testModeEmail: data.test_mode_email,
        }),
    });

    const runMutation = useMutation({
        mutationFn: (dryRun: boolean) => dunningApi.run({ dry_run: dryRun, force: !config.enabled }),
        onSuccess: (data) => setRunResults({ results: data.executed, dryRun: data.dry_run }),
    });

    const syncMutation = useMutation({ mutationFn: () => dunningApi.syncPaid() });

    return (
        <div className="space-y-4">
            <TestModePanel config={config} />

            <OverridesPanel />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ejecutar bajo demanda</CardTitle>
                    <p className="text-xs text-muted-foreground">Herramientas manuales para probar y disparar el flujo sin esperar al cron automático.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!config.enabled && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 flex items-start gap-2">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={14} />
                            <p className="text-xs text-amber-900 dark:text-amber-200">
                                El sistema está desactivado. Aún así puedes ejecutar envíos manuales desde aquí (se aplica <code>force=true</code>).
                            </p>
                        </div>
                    )}

                    <ActionRow icon={Eye} title="Ver qué se enviaría ahora"
                        description="No envía nada. Solo muestra la lista de facturas que tocarían y en qué nivel."
                        action={
                            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                                {previewMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Eye size={14} className="mr-2" />}
                                Ver preview
                            </Button>
                        }
                    />

                    <ActionRow icon={Send} title="Enviar recordatorio de prueba"
                        description="Envía una plantilla concreta a tu email con datos de ejemplo. No toca la BD."
                        action={
                            <Button variant="outline" onClick={() => setShowTestSend(true)}>
                                <Send size={14} className="mr-2" /> Enviar prueba
                            </Button>
                        }
                    />

                    <ActionRow icon={RefreshCw} title="Sincronizar cobros desde Holded"
                        description="Cruza casos abiertos contra Holded. Cierra los que ya estén pagados y calcula días hasta cobro."
                        action={
                            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                                {syncMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <RefreshCw size={14} className="mr-2" />}
                                {syncMutation.isSuccess ? `${syncMutation.data.closed} cerrados` : 'Sincronizar'}
                            </Button>
                        }
                    />

                    <ActionRow danger icon={Zap} title="Ejecutar envíos ahora"
                        description="Envía TODOS los recordatorios que tocan según el plan. Genera links Stripe y registra cada envío en el histórico."
                        action={
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => runMutation.mutate(true)} disabled={runMutation.isPending}>
                                    Dry-run
                                </Button>
                                <Button onClick={() => {
                                    const msg = config.test_mode
                                        ? `MODO PRUEBA activo — TODOS los emails se enviarán a ${config.test_mode_email || '(sin destino)'} en lugar de a los clientes. ¿Continuar?`
                                        : 'Se enviarán los recordatorios reales a los clientes. ¿Continuar?';
                                    if (confirm(msg)) {
                                        runMutation.mutate(false);
                                    }
                                }} disabled={runMutation.isPending}>
                                    {runMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Zap size={14} className="mr-2" />}
                                    Ejecutar ahora
                                </Button>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            {preview && <PreviewModal plan={preview.plan} summary={preview.summary} testMode={preview.testMode} testModeEmail={preview.testModeEmail} onClose={() => setPreview(null)} />}
            {showTestSend && <TestSendModal onClose={() => setShowTestSend(false)} />}
            {runResults && <RunResultsModal results={runResults.results} dryRun={runResults.dryRun} onClose={() => setRunResults(null)} />}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DunningConfig() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>('rules');

    const { data, isLoading } = useQuery({
        queryKey: ['dunning', 'config'],
        queryFn: () => dunningApi.getConfig(),
    });

    const saveMutation = useMutation({
        mutationFn: (patch: Partial<DunningConfigType>) => dunningApi.updateConfig(patch),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dunning', 'config'] });
        },
    });

    const config = data?.config;

    return (
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Settings className="text-primary" size={22} />
                    <h1 className="text-2xl font-bold text-foreground">Configuración de impagos</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                    Reglas de clasificación, programación, marca visual, bancos, plantillas de email y ejecución manual.
                </p>
            </div>

            <div className="flex items-center gap-1 border-b overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                            tab === key ? 'border-primary text-primary'
                                       : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}>
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {isLoading || !config ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="animate-spin mr-2" size={18} /> Cargando configuración…
                </div>
            ) : (
                <>
                    {tab === 'rules' && <RulesTab config={config} onSave={p => saveMutation.mutate(p)} saving={saveMutation.isPending} />}
                    {tab === 'schedule' && <ScheduleTab config={config} onSave={p => saveMutation.mutate(p)} saving={saveMutation.isPending} />}
                    {tab === 'brand' && <BrandTab config={config} onSave={p => saveMutation.mutate(p)} saving={saveMutation.isPending} />}
                    {tab === 'templates' && <TemplatesTab config={config} />}
                    {tab === 'run' && <RunTab config={config} />}
                </>
            )}
        </div>
    );
}
