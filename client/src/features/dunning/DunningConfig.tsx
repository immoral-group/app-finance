import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    dunningApi, DunningBlock, DunningBlockType, DunningConfig as DunningConfigType, DunningTemplate,
    PlanItem, PlanSummary, RunResult,
} from '@/lib/api/dunning';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import {
    Save, Settings, Calendar, Mail, Loader2, ArrowUp, ArrowDown, Trash2, Copy,
    Eye, GripVertical, Info, Check, Play, Send, RefreshCw, AlertTriangle, X, Zap,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// Configuración de Impagos
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'rules' | 'schedule' | 'templates' | 'run';

const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'rules', label: 'Reglas', icon: Settings },
    { key: 'schedule', label: 'Programación', icon: Calendar },
    { key: 'templates', label: 'Plantillas', icon: Mail },
    { key: 'run', label: 'Ejecutar', icon: Zap },
];

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const BLOCK_TYPES: { type: DunningBlockType; label: string; icon: string }[] = [
    { type: 'header', label: 'Encabezado', icon: 'H' },
    { type: 'text', label: 'Texto', icon: 'T' },
    { type: 'invoice_table', label: 'Tabla de factura', icon: '▦' },
    { type: 'cta', label: 'Botón CTA', icon: '⎘' },
    { type: 'signature', label: 'Firma', icon: '✎' },
    { type: 'spacer', label: 'Espaciador', icon: '↕' },
];

function newBlock(type: DunningBlockType): DunningBlock {
    const id = `b${Math.random().toString(36).slice(2, 8)}`;
    switch (type) {
        case 'header': return { id, type, props: { text: 'Título del recordatorio' } };
        case 'text': return { id, type, props: { text: 'Escribe aquí el cuerpo del recordatorio.' } };
        case 'cta': return { id, type, props: { label: 'Ver factura', url: '{{invoice_url}}' } };
        case 'invoice_table': return { id, type, props: {} };
        case 'signature': return { id, type, props: { text: 'Un saludo,\nEquipo Immoral' } };
        case 'spacer': return { id, type, props: { height: 16 } };
    }
}

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
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Nivel 1 · desde / hasta
                        </label>
                        <div className="flex items-center gap-2">
                            <Input type="number" min={1} value={form.level_1_days_min}
                                onChange={e => setForm({ ...form, level_1_days_min: Number(e.target.value) })} />
                            <span className="text-muted-foreground">—</span>
                            <Input type="number" min={1} value={form.level_1_days_max}
                                onChange={e => setForm({ ...form, level_1_days_max: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Nivel 2 · desde / hasta
                        </label>
                        <div className="flex items-center gap-2">
                            <Input type="number" min={1} value={form.level_2_days_min}
                                onChange={e => setForm({ ...form, level_2_days_min: Number(e.target.value) })} />
                            <span className="text-muted-foreground">—</span>
                            <Input type="number" min={1} value={form.level_2_days_max}
                                onChange={e => setForm({ ...form, level_2_days_max: Number(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Nivel 3 · desde
                        </label>
                        <Input type="number" min={1} value={form.level_3_days_min}
                            onChange={e => setForm({ ...form, level_3_days_min: Number(e.target.value) })} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Repetición nivel 3 (cada X días)
                        </label>
                        <Input type="number" min={1} value={form.level_3_repeat_every_days}
                            onChange={e => setForm({ ...form, level_3_repeat_every_days: Number(e.target.value) })} />
                        <p className="text-[11px] text-muted-foreground mt-1">Frecuencia con la que se reenvía el nivel 3 mientras la factura siga impaga.</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Importe mínimo (€)
                        </label>
                        <Input type="number" min={0} step="0.01" value={form.min_amount}
                            onChange={e => setForm({ ...form, min_amount: Number(e.target.value) })} />
                        <p className="text-[11px] text-muted-foreground mt-1">Se ignoran facturas por debajo de este importe.</p>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Copia oculta (BCC) opcional
                    </label>
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
                <p className="text-xs text-muted-foreground">
                    Elige uno o varios días de la semana y la hora del envío.
                </p>
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
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        Días de envío
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((label, idx) => {
                            const active = (form.send_days || []).includes(idx);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => toggleDay(idx)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                        active
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background text-foreground border-border hover:bg-muted'
                                    }`}
                                >
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
                        El scheduler real (cron) que ejecuta estos envíos se conectará en Fase 2. Por ahora esta configuración se guarda y queda lista.
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

// ── Tab: Plantillas ───────────────────────────────────────────────────────────

function BlockEditor({
    block, onChange, onMoveUp, onMoveDown, onDuplicate, onDelete, isFirst, isLast,
}: {
    block: DunningBlock;
    onChange: (b: DunningBlock) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const meta = BLOCK_TYPES.find(t => t.type === block.type);

    const setProp = (k: string, v: unknown) => onChange({ ...block, props: { ...block.props, [k]: v } });

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{meta?.label || block.type}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button disabled={isFirst} onClick={onMoveUp} className="p-1 rounded hover:bg-background text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed" title="Subir">
                        <ArrowUp size={12} />
                    </button>
                    <button disabled={isLast} onClick={onMoveDown} className="p-1 rounded hover:bg-background text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed" title="Bajar">
                        <ArrowDown size={12} />
                    </button>
                    <button onClick={onDuplicate} className="p-1 rounded hover:bg-background text-muted-foreground" title="Duplicar">
                        <Copy size={12} />
                    </button>
                    <button onClick={onDelete} className="p-1 rounded hover:bg-background text-red-500" title="Borrar">
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
            <div className="p-3 space-y-2">
                {(block.type === 'header' || block.type === 'text' || block.type === 'signature') && (
                    <textarea
                        value={String(block.props.text || '')}
                        onChange={e => setProp('text', e.target.value)}
                        rows={block.type === 'text' ? 4 : 2}
                        className="w-full text-xs px-2 py-1.5 rounded border bg-background resize-y"
                    />
                )}
                {block.type === 'cta' && (
                    <>
                        <Input value={String(block.props.label || '')} onChange={e => setProp('label', e.target.value)} placeholder="Texto del botón" />
                        <Input value={String(block.props.url || '')} onChange={e => setProp('url', e.target.value)} placeholder="URL o {{invoice_url}}" />
                    </>
                )}
                {block.type === 'spacer' && (
                    <Input type="number" min={4} max={80} value={Number(block.props.height || 16)}
                        onChange={e => setProp('height', Number(e.target.value))} />
                )}
                {block.type === 'invoice_table' && (
                    <p className="text-[11px] text-muted-foreground italic">
                        Se renderiza automáticamente con los datos de la factura: número, fechas, días vencido, importe.
                    </p>
                )}
            </div>
        </div>
    );
}

function TemplateEditor({ template, onSaved }: { template: DunningTemplate; onSaved: () => void }) {
    const [name, setName] = useState(template.name);
    const [subject, setSubject] = useState(template.subject);
    const [blocks, setBlocks] = useState<DunningBlock[]>(template.blocks || []);
    const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        setName(template.name);
        setSubject(template.subject);
        setBlocks(template.blocks || []);
    }, [template.id]);

    const saveMutation = useMutation({
        mutationFn: () => dunningApi.updateTemplate(template.id, { name, subject, blocks }),
        onSuccess: () => { onSaved(); },
    });

    const previewMutation = useMutation({
        mutationFn: () => dunningApi.preview({ blocks, subject }),
        onSuccess: (r) => { setPreview({ html: r.html, subject: r.subject }); setShowPreview(true); },
    });

    const moveBlock = (idx: number, dir: -1 | 1) => {
        const next = [...blocks];
        const target = idx + dir;
        if (target < 0 || target >= next.length) return;
        [next[idx], next[target]] = [next[target], next[idx]];
        setBlocks(next);
    };

    const addBlock = (type: DunningBlockType) => setBlocks([...blocks, newBlock(type)]);
    const updateBlock = (idx: number, b: DunningBlock) => {
        const next = [...blocks];
        next[idx] = b;
        setBlocks(next);
    };
    const duplicateBlock = (idx: number) => {
        const src = blocks[idx];
        const clone = { ...src, id: `b${Math.random().toString(36).slice(2, 8)}` };
        setBlocks([...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)]);
    };
    const deleteBlock = (idx: number) => setBlocks(blocks.filter((_, i) => i !== idx));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor */}
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nombre interno</label>
                    <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Asunto del email</label>
                    <Input value={subject} onChange={e => setSubject(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Variables: <code>{'{{invoice_number}}'}</code>, <code>{'{{contact_name}}'}</code>, <code>{'{{days_overdue}}'}</code>, <code>{'{{amount}}'}</code>.
                    </p>
                </div>

                <div className="rounded-lg border bg-muted/20 p-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider self-center mr-1">Añadir bloque:</span>
                    {BLOCK_TYPES.map(t => (
                        <button key={t.type} onClick={() => addBlock(t.type)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-background border hover:bg-muted font-medium">
                            <span className="font-mono">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    {blocks.length === 0 && (
                        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                            Añade bloques desde la barra de arriba para empezar.
                        </div>
                    )}
                    {blocks.map((block, idx) => (
                        <BlockEditor
                            key={block.id}
                            block={block}
                            isFirst={idx === 0}
                            isLast={idx === blocks.length - 1}
                            onChange={b => updateBlock(idx, b)}
                            onMoveUp={() => moveBlock(idx, -1)}
                            onMoveDown={() => moveBlock(idx, 1)}
                            onDuplicate={() => duplicateBlock(idx)}
                            onDelete={() => deleteBlock(idx)}
                        />
                    ))}
                </div>

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

            {/* Preview */}
            <div className="lg:sticky lg:top-4 lg:self-start">
                <div className="rounded-lg border bg-card overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>Vista previa</span>
                        <button onClick={() => previewMutation.mutate()} className="text-[11px] text-primary hover:underline">
                            Recargar
                        </button>
                    </div>
                    {showPreview && preview ? (
                        <div className="max-h-[600px] overflow-y-auto">
                            <div className="px-3 py-2 border-b text-xs bg-background">
                                <span className="text-muted-foreground">Asunto:</span>{' '}
                                <span className="font-semibold text-foreground">{preview.subject}</span>
                            </div>
                            <iframe
                                title="preview"
                                srcDoc={preview.html}
                                sandbox=""
                                style={{ width: '100%', height: 560, border: 'none', background: '#f3f4f6' }}
                            />
                        </div>
                    ) : (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            Pulsa <em>Previsualizar</em> para ver el email renderizado con datos de ejemplo.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TemplatesTab() {
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
                                isActive
                                    ? 'bg-primary text-primary-foreground border-primary'
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
                <TemplateEditor template={active} onSaved={() => refetch()} />
            ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No hay plantilla activa para el nivel {activeLevel}.
                </div>
            )}
        </div>
    );
}

// ── Tab: Ejecutar ─────────────────────────────────────────────────────────────

function ActionRow({
    title, description, action, icon: Icon, danger = false,
}: {
    title: string;
    description: string;
    action: React.ReactNode;
    icon: any;
    danger?: boolean;
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

function PreviewModal({ plan, summary, onClose }: { plan: PlanItem[]; summary: PlanSummary; onClose: () => void }) {
    const sends = plan.filter(p => p.action === 'send');
    const skips = plan.filter(p => p.action === 'skip');
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
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {sends.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                                A enviar ({sends.length})
                            </p>
                            <table className="w-full text-xs">
                                <thead className="text-[11px] uppercase text-muted-foreground border-b">
                                    <tr>
                                        <th className="text-left py-1.5 px-2">Factura</th>
                                        <th className="text-left py-1.5 px-2">Cliente</th>
                                        <th className="text-left py-1.5 px-2">Email</th>
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
                                            <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[180px]">{p.invoice.contact_email || <span className="text-red-500 italic">sin email</span>}</td>
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
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                Se omitirán ({skips.length})
                            </p>
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
                        <select
                            value={templateId}
                            onChange={e => setTemplateId(e.target.value)}
                            className="w-full text-sm px-3 py-2 rounded border bg-background"
                        >
                            <option value="">Selecciona una plantilla…</option>
                            {templates.filter(t => t.active).map(t => (
                                <option key={t.id} value={t.id}>Nivel {t.level} · {t.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Enviar a</label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
                        <p className="text-[11px] text-muted-foreground mt-1">Se rellenará con datos de ejemplo. El asunto llevará prefijo [PRUEBA].</p>
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
                        <Button
                            onClick={() => sendMutation.mutate()}
                            disabled={!templateId || !email || sendMutation.isPending}
                        >
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

function RunTab({ config }: { config: DunningConfigType }) {
    const [preview, setPreview] = useState<{ plan: PlanItem[]; summary: PlanSummary } | null>(null);
    const [showTestSend, setShowTestSend] = useState(false);
    const [runResults, setRunResults] = useState<{ results: RunResult[]; dryRun: boolean } | null>(null);

    const previewMutation = useMutation({
        mutationFn: () => dunningApi.previewRun(),
        onSuccess: (data) => setPreview({ plan: data.plan, summary: data.summary }),
    });

    const runMutation = useMutation({
        mutationFn: (dryRun: boolean) => dunningApi.run({ dry_run: dryRun, force: !config.enabled }),
        onSuccess: (data) => setRunResults({ results: data.executed, dryRun: data.dry_run }),
    });

    const syncMutation = useMutation({
        mutationFn: () => dunningApi.syncPaid(),
    });

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ejecutar bajo demanda</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Herramientas manuales para probar y disparar el flujo sin esperar al cron automático.
                    </p>
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

                    <ActionRow
                        icon={Eye}
                        title="Ver qué se enviaría ahora"
                        description="No envía nada. Solo muestra la lista de facturas que tocarían y en qué nivel."
                        action={
                            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                                {previewMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Eye size={14} className="mr-2" />}
                                Ver preview
                            </Button>
                        }
                    />

                    <ActionRow
                        icon={Send}
                        title="Enviar recordatorio de prueba"
                        description="Envía una plantilla concreta a tu email con datos de ejemplo. No toca la BD."
                        action={
                            <Button variant="outline" onClick={() => setShowTestSend(true)}>
                                <Send size={14} className="mr-2" />
                                Enviar prueba
                            </Button>
                        }
                    />

                    <ActionRow
                        icon={RefreshCw}
                        title="Sincronizar cobros desde Holded"
                        description="Cruza casos abiertos contra Holded. Cierra los que ya estén pagados y calcula días hasta cobro."
                        action={
                            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                                {syncMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <RefreshCw size={14} className="mr-2" />}
                                {syncMutation.isSuccess ? `${syncMutation.data.closed} cerrados` : 'Sincronizar'}
                            </Button>
                        }
                    />

                    <ActionRow
                        danger
                        icon={Zap}
                        title="Ejecutar envíos ahora"
                        description="Envía TODOS los recordatorios que tocan según el plan. Registra cada envío en el histórico."
                        action={
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => runMutation.mutate(true)} disabled={runMutation.isPending}>
                                    Dry-run
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (confirm('Se enviarán los recordatorios reales a los clientes. ¿Continuar?')) {
                                            runMutation.mutate(false);
                                        }
                                    }}
                                    disabled={runMutation.isPending}
                                >
                                    {runMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Zap size={14} className="mr-2" />}
                                    Ejecutar ahora
                                </Button>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            {preview && <PreviewModal plan={preview.plan} summary={preview.summary} onClose={() => setPreview(null)} />}
            {showTestSend && <TestSendModal onClose={() => setShowTestSend(false)} />}
            {runResults && <RunResultsModal results={runResults.results} dryRun={runResults.dryRun} onClose={() => setRunResults(null)} />}
        </>
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
                    Reglas de clasificación, calendario de envío y plantillas de email para cada nivel.
                </p>
            </div>

            <div className="flex items-center gap-1 border-b">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                            tab === key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Icon size={14} />
                        {label}
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
                    {tab === 'templates' && <TemplatesTab />}
                    {tab === 'run' && <RunTab config={config} />}
                </>
            )}
        </div>
    );
}
