import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    dunningApi, DunningBank, DunningConfig as DunningConfigType, DunningTemplate,
    PlanItem, PlanSummary, RunResult, DunningCronRun, DunningReminderRow,
} from '@/lib/api/dunning';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import {
    Save, Settings, Calendar, Mail, Loader2, Eye, Info, Check, Play, Send, RefreshCw,
    AlertTriangle, X, Zap, Palette, Trash2, Plus, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { DunningIntroPanel, TabGuide } from './DunningGuide';

// ══════════════════════════════════════════════════════════════════════════════
// Configuración de Impagos — Fase 3
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'rules' | 'schedule' | 'brand' | 'templates' | 'run' | 'history' | 'reincidents';

const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'rules', label: 'Reglas', icon: Settings },
    { key: 'schedule', label: 'Programación', icon: Calendar },
    { key: 'brand', label: 'Marca y bancos', icon: Palette },
    { key: 'templates', label: 'Plantillas', icon: Mail },
    { key: 'run', label: 'Ejecutar', icon: Zap },
    { key: 'history', label: 'Historial', icon: Clock },
    { key: 'reincidents', label: 'Reincidentes', icon: AlertTriangle },
];

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Editor de listas de emails ────────────────────────────────────────────────
// Se usa tanto para los CC globales del config como para los CC por override.
// UX: escribes un email + Enter (o coma / espacio) para añadirlo como chip,
// click en la X para quitarlo. Rechaza inválidos y duplicados sin romper el
// input — solo hace shake para señalar que no se añadió.
function EmailListEditor({
    value, onChange, placeholder = 'nombre@dominio.com', disabled = false,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);

    const emails = Array.isArray(value) ? value : [];

    const commit = (raw: string) => {
        const email = raw.trim().replace(/[,;]+$/, '');
        if (!email) return true;
        if (!EMAIL_RE.test(email)) {
            setError('No es un email válido');
            return false;
        }
        if (emails.some(e => e.toLowerCase() === email.toLowerCase())) {
            setError('Ya está en la lista');
            return false;
        }
        onChange([...emails, email]);
        setError(null);
        return true;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            e.preventDefault();
            if (commit(draft)) setDraft('');
        } else if (e.key === 'Backspace' && draft === '' && emails.length > 0) {
            // Retroceso sobre input vacío quita el último chip — patrón habitual.
            onChange(emails.slice(0, -1));
        }
    };

    const handleBlur = () => {
        if (draft.trim() && commit(draft)) setDraft('');
    };

    const remove = (idx: number) => onChange(emails.filter((_, i) => i !== idx));

    return (
        <div>
            <div className={`flex flex-wrap gap-1.5 items-center min-h-[40px] w-full px-2 py-1.5 rounded border bg-background ${error ? 'border-red-400' : ''}`}>
                {emails.map((email, idx) => (
                    <span key={`${email}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {email}
                        {!disabled && (
                            <button type="button" onClick={() => remove(idx)}
                                className="hover:bg-primary/20 rounded-full p-0.5"
                                aria-label={`Quitar ${email}`}>
                                <X size={11} />
                            </button>
                        )}
                    </span>
                ))}
                <input
                    type="email"
                    value={draft}
                    onChange={e => { setDraft(e.target.value); if (error) setError(null); }}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    placeholder={emails.length === 0 ? placeholder : ''}
                    disabled={disabled}
                    className="flex-1 min-w-[160px] text-sm bg-transparent outline-none px-1 py-0.5"
                />
            </div>
            {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
        </div>
    );
}

// ── Tab: Reglas ────────────────────────────────────────────────────────────────

function RulesTab({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const [form, setForm] = useState(config);
    useEffect(() => setForm(config), [config]);

    return (
        <div className="space-y-4">
        <TabGuide
            tab="rules"
            storageKey="dunning:guide:rules"
            title="¿Qué son las reglas de clasificación?"
            desc={
                <>
                    Aquí decides <strong>cuándo una factura entra en cada nivel de aviso</strong> según los días que lleva vencida.
                    El sistema mira cada factura vencida de Holded y, según los rangos que definas aquí, la mete en nivel 1, 2 o 3.
                    A cada nivel le corresponde un email distinto (más suave o más firme).
                </>
            }
            tips={[
                <>Recomendado: <strong>Nivel 1</strong> del día 5 al 9, <strong>Nivel 2</strong> del 10 al 14, <strong>Nivel 3</strong> a partir del 15.</>,
                <>La <strong>repetición del nivel 3</strong> hace que se reenvíe el aviso cada X días mientras la factura siga sin pagar.</>,
                <>El <strong>importe mínimo</strong> filtra facturas pequeñas para no molestar por céntimos.</>,
                <>El <strong>CC</strong> (copia visible) va a los emails que decidas poner en copia junto al cliente — típicamente comercial o gestor del cliente. Se pueden añadir aún más por cliente en Ejecutar → Overrides.</>,
                <>El <strong>BCC</strong> (copia oculta) pone a administración en copia oculta para que veas todos los envíos sin que el cliente lo sepa.</>,
            ]}
        />
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
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Copia visible (CC) — se aplica a todos los recordatorios</label>
                    <EmailListEditor
                        value={form.cc_emails || []}
                        onChange={next => setForm({ ...form, cc_emails: next })}
                        placeholder="Añade emails y pulsa Enter…"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Estas direcciones irán en CC de cada recordatorio (las verá el cliente). Ideal para poner al gestor
                        del cliente, al comercial que lleva la cuenta o a administración. En modo prueba no se aplican.
                    </p>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Copia oculta (BCC) opcional</label>
                    <Input type="email" placeholder="administracion@immoral.es"
                        value={form.bcc_email || ''}
                        onChange={e => setForm({ ...form, bcc_email: e.target.value })} />
                    <p className="text-[11px] text-muted-foreground mt-1">Cada recordatorio incluirá esta dirección en BCC (no la ve el cliente) para tener visibilidad interna.</p>
                </div>

                <div className="flex justify-end pt-2 border-t">
                    <Button onClick={() => onSave(form)} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                        Guardar reglas
                    </Button>
                </div>
            </CardContent>
        </Card>
        <MultiAlertCard config={config} onSave={onSave} saving={saving} />
        </div>
    );
}

// ── Sección: alerta de clientes con múltiples vencidas ────────────────────────
// Config visible dentro de la pestaña "Reglas". Se guarda mediante el mismo
// updateConfig que las reglas, así el usuario no tiene que dar dos "Guardar".

function MultiAlertCard({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const queryClient = useQueryClient();
    const [enabled, setEnabled] = useState(config.multi_alert_enabled);
    const [threshold, setThreshold] = useState(config.multi_alert_threshold);
    const [to, setTo] = useState(config.multi_alert_to || '');
    const [cc, setCc] = useState<string[]>(config.multi_alert_cc_emails || []);
    const [sendDays, setSendDays] = useState<number[]>(config.multi_alert_send_days || []);

    useEffect(() => {
        setEnabled(config.multi_alert_enabled);
        setThreshold(config.multi_alert_threshold);
        setTo(config.multi_alert_to || '');
        setCc(config.multi_alert_cc_emails || []);
        setSendDays(config.multi_alert_send_days || []);
    }, [config.id, config.updated_at]);

    const toggleDay = (day: number) => {
        const s = new Set(sendDays);
        if (s.has(day)) s.delete(day); else s.add(day);
        setSendDays(Array.from(s).sort());
    };

    // Detecta cambios sin guardar comparando formulario vs config persistida.
    const patch: Partial<DunningConfigType> = {
        multi_alert_enabled: enabled,
        multi_alert_threshold: threshold,
        multi_alert_to: to.trim() || null,
        multi_alert_cc_emails: cc,
        multi_alert_send_days: sendDays,
    };
    const hasUnsavedChanges =
        (config.multi_alert_enabled !== enabled) ||
        (config.multi_alert_threshold !== threshold) ||
        ((config.multi_alert_to || '') !== to.trim()) ||
        (JSON.stringify(config.multi_alert_cc_emails || []) !== JSON.stringify(cc)) ||
        (JSON.stringify(config.multi_alert_send_days || []) !== JSON.stringify(sendDays));

    // Preview: cuántos clientes cumplirían el umbral ahora mismo.
    const { data: preview, refetch: refetchPreview, isFetching: previewLoading } = useQuery({
        queryKey: ['dunning', 'multi-alerts-config-preview'],
        queryFn: () => dunningApi.listMultiOverdueAlerts(),
    });

    // "Enviar alerta ahora": si hay cambios sin guardar, guarda primero para
    // que el backend lea el estado correcto. Después dispara el envío.
    const sendMutation = useMutation({
        mutationFn: async () => {
            if (hasUnsavedChanges) {
                await dunningApi.updateConfig(patch);
                await queryClient.invalidateQueries({ queryKey: ['dunning', 'config'] });
            }
            return dunningApi.sendMultiOverdueAlert();
        },
        onSuccess: () => refetchPreview(),
    });

    // Cualquier edición del formulario limpia el resultado del envío anterior
    // para que no se muestre un mensaje obsoleto ("no-recipients" antiguo).
    useEffect(() => {
        if (sendMutation.isSuccess || sendMutation.isError) sendMutation.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, threshold, to, JSON.stringify(cc), JSON.stringify(sendDays)]);

    const alerts = preview?.alerts || [];
    const canSend = enabled && (!!to.trim() || cc.length > 0);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="text-red-500" size={16} />
                            Alerta: clientes con múltiples facturas vencidas
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Cuando un mismo cliente acumule al menos <strong>{threshold}</strong> facturas vencidas, aparece
                            un modal bloqueante en toda la app para superadmins (una vez al día) y se envía un email a los
                            destinatarios de abajo en los días que elijas. El historial se guarda a diario para métricas mensuales.
                        </p>
                    </div>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        role="switch"
                        aria-checked={enabled}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Umbral (nº de facturas vencidas por cliente)
                        </label>
                        <Input type="number" min={2} value={threshold}
                            onChange={e => setThreshold(Math.max(2, Number(e.target.value) || 2))} />
                        <p className="text-[11px] text-muted-foreground mt-1">Mínimo 2. Por defecto salta con 2 o más.</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Destinatario principal (TO)
                        </label>
                        <Input type="email" value={to}
                            onChange={e => setTo(e.target.value)}
                            placeholder="administracion@immoral.es" />
                        <p className="text-[11px] text-muted-foreground mt-1">Recibe el email como destinatario principal.</p>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        En copia (CC)
                    </label>
                    <EmailListEditor value={cc} onChange={setCc} placeholder="Añade correos y pulsa Enter…" />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Todos los que estén aquí recibirán la alerta en copia visible. Puedes dejar TO vacío y usar solo CC (el primero de la lista pasa a TO).
                    </p>
                </div>

                <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        Días en que se manda el email
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((label, idx) => {
                            const active = sendDays.includes(idx);
                            return (
                                <button key={idx} onClick={() => toggleDay(idx)}
                                    type="button"
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                        active ? 'bg-primary text-primary-foreground border-primary'
                                              : 'bg-background text-foreground border-border hover:bg-muted'
                                    }`}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                        Elige uno o varios días de la semana. El banner en la app sigue apareciendo todos los días — esto controla solo el email.
                        {sendDays.length === 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold"> Sin días marcados no se enviará ningún email.</span>}
                    </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                            <strong className="text-foreground">Estado actual: </strong>
                            {previewLoading ? 'Calculando…' : alerts.length === 0
                                ? `Ningún cliente supera el umbral de ${preview?.threshold ?? threshold}.`
                                : `${alerts.length} cliente${alerts.length === 1 ? '' : 's'} con ${preview?.threshold ?? threshold}+ facturas vencidas.`}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => refetchPreview()} disabled={previewLoading}>
                            {previewLoading ? <Loader2 className="animate-spin mr-1.5" size={12} /> : <RefreshCw size={12} className="mr-1.5" />}
                            Recalcular
                        </Button>
                    </div>
                    {alerts.length > 0 && (
                        <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-1">
                            {alerts.slice(0, 5).map(a => (
                                <li key={a.contact_id || a.contact_name}>
                                    · <strong className="text-foreground">{a.contact_name || '(sin nombre)'}</strong>: {a.invoice_count} facturas, máx {a.max_days_overdue} días vencido
                                </li>
                            ))}
                            {alerts.length > 5 && <li>… y {alerts.length - 5} más</li>}
                        </ul>
                    )}
                    {config.multi_alert_last_sent_at && (
                        <p className="text-[11px] text-muted-foreground pt-1 border-t">
                            Último email enviado: <strong>{new Date(config.multi_alert_last_sent_at).toLocaleString('es-ES')}</strong>
                        </p>
                    )}
                </div>

                {sendMutation.isSuccess && (
                    sendMutation.data?.sent ? (
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                            <Check className="shrink-0 mt-0.5" size={14} />
                            Alerta enviada a <strong>{sendMutation.data.to}</strong>
                            {(sendMutation.data.cc || []).length ? ` (+${(sendMutation.data.cc || []).length} en CC)` : ''}.
                        </div>
                    ) : (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                            <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                            <div>
                                {sendMutation.data?.reason === 'no-recipients' && (
                                    <>No se envió porque <strong>no hay destinatarios guardados</strong> en la base de datos. Rellena TO o al menos un CC y pulsa <em>Guardar alerta</em> antes de reintentar.</>
                                )}
                                {sendMutation.data?.reason === 'no-alerts' && (
                                    <>Ningún cliente supera el umbral en este momento.</>
                                )}
                                {sendMutation.data?.reason === 'smtp-not-configured' && (
                                    <>SMTP no está configurado en el servidor. Contacta con administración.</>
                                )}
                                {!['no-recipients', 'no-alerts', 'smtp-not-configured'].includes(sendMutation.data?.reason || '') && (
                                    <>No se envió: {sendMutation.data?.reason || 'sin motivo'}.</>
                                )}
                            </div>
                        </div>
                    )
                )}
                {sendMutation.isError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 text-xs text-red-900 dark:text-red-200 flex items-start gap-2">
                        <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                        {String(sendMutation.error)}
                    </div>
                )}

                {hasUnsavedChanges && (
                    <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-2.5 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                        <Info size={14} className="shrink-0 mt-0.5" />
                        <span>
                            Tienes cambios sin guardar. Pulsa <em>Guardar alerta</em> para persistirlos.
                            Si le das a <em>Enviar alerta ahora</em>, se guardarán automáticamente antes de enviar.
                        </span>
                    </div>
                )}

                <div className="flex justify-between items-center gap-2 pt-2 border-t">
                    <Button variant="outline"
                        onClick={() => sendMutation.mutate()}
                        disabled={!canSend || sendMutation.isPending || alerts.length === 0}
                        title={
                            !canSend ? 'Rellena TO o al menos un CC antes de enviar' :
                            alerts.length === 0 ? 'Ningún cliente supera el umbral ahora mismo' :
                            hasUnsavedChanges ? 'Guardará los cambios del formulario y enviará el email' :
                            'Envía el email a los destinatarios guardados'
                        }>
                        {sendMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Send size={14} className="mr-2" />}
                        {hasUnsavedChanges ? 'Guardar y enviar' : 'Enviar alerta ahora'}
                    </Button>
                    <Button onClick={() => onSave(patch)} disabled={saving || !hasUnsavedChanges}>
                        {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                        Guardar alerta
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Tab: Programación ─────────────────────────────────────────────────────────

function ScheduleTab({ config, onSave, saving }: { config: DunningConfigType; onSave: (patch: Partial<DunningConfigType>) => void; saving: boolean }) {
    const [form, setForm] = useState(config);
    const [justSaved, setJustSaved] = useState(false);
    useEffect(() => setForm(config), [config]);

    const toggleDay = (day: number) => {
        const set = new Set(form.send_days || []);
        if (set.has(day)) set.delete(day); else set.add(day);
        setForm({ ...form, send_days: Array.from(set).sort() });
    };

    const handleSave = () => {
        onSave(form);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3000);
    };

    // Resumen del estado ACTUALMENTE GUARDADO (leído de config, no de form).
    const savedDaysLabel = (config.send_days || []).length === 0
        ? 'ningún día'
        : (config.send_days || []).map(d => DAY_LABELS[d]).join(', ');
    const savedHourLabel = `${String(config.send_hour).padStart(2, '0')}:${String(config.send_minute).padStart(2, '0')}`;

    const hasUnsaved = JSON.stringify({
        e: form.enabled, d: form.send_days, h: form.send_hour, m: form.send_minute, tz: form.timezone,
    }) !== JSON.stringify({
        e: config.enabled, d: config.send_days, h: config.send_hour, m: config.send_minute, tz: config.timezone,
    });

    return (
        <div className="space-y-4">
        <TabGuide
            tab="schedule"
            storageKey="dunning:guide:schedule"
            title="¿Cuándo se envían los recordatorios?"
            desc={
                <>
                    El sistema tiene un <strong>reloj automático</strong> que se despierta cada hora. Cuando llega uno de los días
                    y la hora que marques aquí, y el <strong>Sistema activo</strong> está encendido, envía los emails que toquen.
                    Si no está activo, no se envía nada aunque haya facturas vencidas.
                </>
            }
            tips={[
                <>Ejemplo típico: <strong>Lunes a las 09:00</strong>. Así cada semana se revisan las vencidas.</>,
                <>Puedes marcar <strong>varios días</strong> (por ejemplo lunes y jueves) si quieres avisar más de una vez por semana.</>,
                <>El resumen verde/gris de arriba te dice si el sistema está enviando o no en este momento.</>,
                <>El sync-paid diario cruza automáticamente con Holded para <strong>cerrar los casos que ya se hayan cobrado</strong>.</>,
            ]}
        />
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Cuándo se envían los recordatorios</CardTitle>
                <p className="text-xs text-muted-foreground">Elige uno o varios días de la semana y la hora del envío.</p>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Resumen del estado guardado — siempre visible */}
                {config.enabled ? (
                    (config.send_days || []).length > 0 ? (
                        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-700 p-4 flex items-start gap-3">
                            <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                <Check className="text-white" size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Sistema ACTIVO</p>
                                <p className="text-xs text-emerald-800 dark:text-emerald-300/90 mt-0.5">
                                    Se envían recordatorios los <strong>{savedDaysLabel}</strong> a las <strong>{savedHourLabel}</strong> ({config.timezone}).
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 flex items-start gap-3">
                            <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Sistema activo pero sin días configurados</p>
                                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">Selecciona al menos un día abajo y guarda.</p>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="rounded-lg border-2 border-muted-foreground/30 bg-muted/30 p-4 flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted-foreground/30 flex items-center justify-center shrink-0">
                            <X className="text-muted-foreground" size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground">Sistema DESACTIVADO</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                No se envía nada automáticamente. Actívalo abajo y pulsa <em>Guardar programación</em>.
                            </p>
                        </div>
                    </div>
                )}

                {hasUnsaved && (
                    <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-2 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
                        <Info size={14} className="shrink-0" />
                        Tienes cambios sin guardar. Pulsa <em>Guardar programación</em> abajo para aplicarlos.
                    </div>
                )}

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

                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 flex items-start gap-2">
                    <Check className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={16} />
                    <div className="text-xs text-emerald-900 dark:text-emerald-200">
                        <p className="font-semibold mb-0.5">Cron activo</p>
                        <p>
                            Vercel Cron chequea cada hora si toca enviar. Si el <em>Sistema activo</em> está ON y hoy es uno de los días configurados a la hora indicada, se dispara el envío automáticamente.
                            La sincronización de cobros con Holded corre a las 6:00 UTC cada día.
                        </p>
                        {config.last_cron_run_at && (
                            <p className="mt-1.5 text-[11px]">
                                Última ejecución: <strong>{new Date(config.last_cron_run_at).toLocaleString('es-ES')}</strong>
                                {config.last_cron_status && ` · ${config.last_cron_status}`}
                            </p>
                        )}
                        {config.last_sync_paid_at && (
                            <p className="text-[11px]">
                                Último sync-paid: <strong>{new Date(config.last_sync_paid_at).toLocaleString('es-ES')}</strong>
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end items-center gap-3 pt-2 border-t">
                    {justSaved && !saving && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1 animate-in fade-in">
                            <Check size={14} /> Guardado
                        </span>
                    )}
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : <Save size={14} className="mr-2" />}
                        Guardar programación
                    </Button>
                </div>
            </CardContent>
        </Card>
        </div>
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
            <TabGuide
                tab="brand"
                storageKey="dunning:guide:brand"
                title="Personaliza cómo se ven los emails"
                desc={
                    <>
                        Todo lo que configures aquí afecta a <strong>los emails que reciben los clientes</strong>: colores del hero,
                        logo, firma, textos de los botones y la lista de bancos que aparece debajo del botón de tarjeta.
                        Usa <em>Previsualizar</em> en la pestaña <em>Plantillas</em> para ver el resultado con datos de ejemplo.
                    </>
                }
                tips={[
                    <>El <strong>logo</strong> se sirve desde una URL pública. Si no se ve bien, desactiva el toggle y el email queda solo con título y subtítulo.</>,
                    <>Los <strong>colores</strong> definen el degradado del hero (bloque superior grande del email).</>,
                    <>La <strong>firma</strong> acepta HTML básico (&lt;br&gt;, &lt;strong&gt;, &lt;a&gt;) para poder poner enlaces y saltos.</>,
                    <>Cada <strong>banco</strong> es un botón que aparece en el email; el cliente puede clicar para ir a su banca online.</>,
                ]}
            />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Marca del email</CardTitle>
                    <p className="text-xs text-muted-foreground">Colores, logotipo textual y firma que aparecen en todos los recordatorios.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Mostrar logo en el email</p>
                            <p className="text-xs text-muted-foreground">Si lo desactivas, el hero solo muestra el título y subtítulo (sin imagen ni texto de logo).</p>
                        </div>
                        <button
                            onClick={() => setForm({ ...form, show_logo: !form.show_logo })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.show_logo ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                            role="switch"
                            aria-checked={form.show_logo}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.show_logo ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">URL del logo (imagen)</label>
                        <Input value={form.brand_logo_url} onChange={e => setForm({ ...form, brand_logo_url: e.target.value })} placeholder="https://imfinance.immoral.es/logo.png" />
                        {form.brand_logo_url && (
                            <div className="mt-2 p-3 rounded-lg bg-slate-800 inline-block">
                                <img
                                    src={form.brand_logo_url}
                                    alt="Logo preview"
                                    style={{ maxHeight: 34 }}
                                    onError={(e) => {
                                        // Fallback: si la URL configurada da 404 (ej. dominio de prod
                                        // que aún no sirve el logo), usamos /logo.png del deploy actual.
                                        const img = e.currentTarget;
                                        if (!img.dataset.fallback) {
                                            img.dataset.fallback = '1';
                                            img.src = '/logo.png';
                                        }
                                    }}
                                />
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
            <TabGuide
                tab="templates"
                storageKey="dunning:guide:templates"
                title="Textos de los emails por nivel"
                desc={
                    <>
                        Aquí escribes <strong>qué dirá cada email</strong>. Hay una plantilla por nivel (1, 2 y 3), así puedes ir
                        subiendo el tono a medida que la factura lleva más días vencida. Usa <em>Previsualizar</em> para ver el
                        email con datos de ejemplo antes de guardarlo.
                    </>
                }
                tips={[
                    <>Usa las <strong>variables</strong> (por ejemplo <code>{'{{contact_name}}'}</code>) para que el email se personalice con los datos reales de cada cliente.</>,
                    <>El <strong>título del hero</strong> es el mensaje grande de arriba (por ejemplo "Recordatorio de pago").</>,
                    <>El <strong>texto principal</strong> aparece antes de las tarjetas con los datos de la factura.</>,
                    <>El <strong>texto de cierre</strong> va después de los botones de banco: buen sitio para poner instrucciones o teléfono de contacto.</>,
                ]}
            />
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

function humanizeReason(reason: string): string {
    if (!reason) return '';
    if (reason.startsWith('waiting-repeat-')) {
        const [, num, den] = reason.match(/waiting-repeat-(\d+)\/(\d+)/) || [];
        return `Nivel 3 enviado hace ${num} días — se repetirá cuando lleguen a ${den}`;
    }
    if (reason === 'level-1-already-sent') return 'Nivel 1 ya enviado (no se repite)';
    if (reason === 'level-2-already-sent') return 'Nivel 2 ya enviado (no se repite)';
    if (reason === 'level-3-already-sent') return 'Nivel 3 ya enviado';
    if (reason === 'not-overdue-enough') return 'Aún no lleva suficientes días vencida';
    if (reason === 'already-paid') return 'Factura ya cobrada';
    if (reason === 'cancelled') return 'Caso cancelado';
    if (reason === 'no-email') return 'Sin email destino';
    if (reason === 'no-template') return 'No hay plantilla activa para este nivel';
    if (reason === 'first-time') return 'Primer envío';
    if (reason.startsWith('repeat-after-')) return `Repetición (${reason.replace('repeat-after-', '')})`;
    return reason;
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
                                            <td className="py-1.5 px-2 truncate max-w-[260px]">
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
                                                {(p.dest_cc || []).length > 0 && (
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        <span className="font-semibold">CC:</span> {(p.dest_cc || []).join(', ')}
                                                    </div>
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
                                            <td className="py-1 px-2 text-muted-foreground text-[11px] italic">{humanizeReason(p.reason)}</td>
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
                        <table className="w-full text-xs">
                            <thead className="text-[11px] uppercase text-muted-foreground border-b">
                                <tr>
                                    <th className="text-left py-1.5 px-2 w-8"></th>
                                    <th className="text-left py-1.5 px-2">Cliente</th>
                                    <th className="text-left py-1.5 px-2">Factura</th>
                                    <th className="text-center py-1.5 px-2">Nivel</th>
                                    <th className="text-left py-1.5 px-2">Destino</th>
                                    <th className="text-left py-1.5 px-2">Detalle</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {results.map((r, i) => (
                                    <tr key={i}>
                                        <td className="py-1.5 px-2">
                                            {r.status === 'sent' && <Check size={14} className="text-emerald-500" />}
                                            {r.status === 'would-send' && <Play size={14} className="text-blue-500" />}
                                            {r.status === 'failed' && <X size={14} className="text-red-500" />}
                                            {r.status === 'skipped' && <Info size={14} className="text-muted-foreground" />}
                                        </td>
                                        <td className="py-1.5 px-2 font-medium">{r.contact_name || <span className="text-muted-foreground font-mono text-[10px]">{r.invoice_id.slice(0, 10)}</span>}</td>
                                        <td className="py-1.5 px-2 font-mono text-[11px]">{r.invoice_number || '—'}</td>
                                        <td className="py-1.5 px-2 text-center">{r.level ? <span className="inline-flex px-1.5 rounded bg-primary/10 text-primary font-semibold">N{r.level}</span> : '—'}</td>
                                        <td className="py-1.5 px-2">
                                            {r.to ? (
                                                <>
                                                    <span className={r.redirect_reason ? 'text-amber-600 font-medium' : ''}>{r.to}</span>
                                                    {r.redirect_reason && (
                                                        <span className="ml-1 text-[10px] uppercase text-amber-500">
                                                            [{r.redirect_reason === 'test_mode' ? 'PRUEBA' : 'OVERRIDE'}]
                                                        </span>
                                                    )}
                                                    {(r.cc || []).length > 0 && (
                                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                                            <span className="font-semibold">CC:</span> {(r.cc || []).join(', ')}
                                                        </div>
                                                    )}
                                                </>
                                            ) : '—'}
                                        </td>
                                        <td className="py-1.5 px-2">
                                            {r.reason && <span className="text-muted-foreground italic">{humanizeReason(r.reason)}</span>}
                                            {r.error && <span className="text-red-600">{r.error}</span>}
                                            {r.status === 'sent' && !r.error && <span className="text-emerald-600">Enviado</span>}
                                            {r.status === 'would-send' && <span className="text-blue-600">Iría a este destino</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
    const [overrideCc, setOverrideCc] = useState<string[]>([]);
    const [note, setNote] = useState('');

    const addMutation = useMutation({
        mutationFn: () => dunningApi.upsertOverride(contactId, {
            override_email: overrideEmail,
            contact_name: contactName,
            note,
            override_cc_emails: overrideCc,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dunning', 'overrides'] });
            setContactId(''); setContactName(''); setOverrideEmail(''); setOverrideCc([]); setNote('');
        },
    });

    // Actualizar el CC de un override ya guardado sin abrir el formulario de alta.
    // Se conservan los demás campos re-enviándolos en el upsert.
    const updateCcMutation = useMutation({
        mutationFn: ({ o, cc }: { o: typeof overrides[number]; cc: string[] }) =>
            dunningApi.upsertOverride(o.contact_id, {
                override_email: o.override_email,
                contact_name: o.contact_name || undefined,
                note: o.note || undefined,
                override_cc_emails: cc,
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dunning', 'overrides'] }),
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
                    Redirigir los recordatorios de un contacto concreto a otro email, o añadir CC específicos para ese cliente
                    (además de los CC globales del config). Útil cuando el gestor concreto tiene que estar en copia.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
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
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">CC extra para este cliente (opcional)</label>
                        <EmailListEditor
                            value={overrideCc}
                            onChange={setOverrideCc}
                            placeholder="Añade emails y pulsa Enter…"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">Se suman a los CC globales del config, no los reemplazan.</p>
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nota (opcional)</label>
                            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Motivo del override" />
                        </div>
                        <Button
                            onClick={() => addMutation.mutate()}
                            disabled={!contactId || !overrideEmail || addMutation.isPending}
                        >
                            {addMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <Plus size={14} className="mr-2" />}
                            Guardar override
                        </Button>
                    </div>
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
                                    <th className="text-left py-2 px-2 min-w-[260px]">CC extra</th>
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
                                        <td className="py-1.5 px-2">
                                            <EmailListEditor
                                                value={o.override_cc_emails || []}
                                                onChange={cc => updateCcMutation.mutate({ o, cc })}
                                                placeholder="Añadir CC…"
                                                disabled={updateCcMutation.isPending}
                                            />
                                        </td>
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
    const resetMutation = useMutation({ mutationFn: () => dunningApi.resetTestData() });

    return (
        <div className="space-y-4">
            <TabGuide
                tab="run"
                storageKey="dunning:guide:run"
                title="Probar y disparar el sistema a mano"
                desc={
                    <>
                        Esta pestaña sirve para <strong>probar todo antes de dejarlo en automático</strong> y para lanzar envíos
                        puntuales fuera del horario configurado. Ideal para hacer QA sin arriesgar mandar nada al cliente.
                    </>
                }
                tips={[
                    <><strong>Modo prueba</strong>: redirige TODOS los emails a tu dirección de prueba, así puedes revisar cómo llegarían sin enviarlos a los clientes.</>,
                    <><strong>Overrides</strong>: cambia el email de destino solo para clientes concretos (útil si el email en Holded está mal).</>,
                    <><strong>Ver preview</strong>: te enseña qué facturas se enviarían y a qué nivel, sin enviar nada.</>,
                    <><strong>Dry-run</strong>: simula el envío completo pero sin mandar los emails. <strong>Ejecutar ahora</strong> sí los manda de verdad.</>,
                    <><strong>Sincronizar cobros</strong>: cierra automáticamente los casos que ya se hayan pagado en Holded.</>,
                ]}
            />
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

                    {config.test_mode && (
                        <ActionRow icon={RefreshCw} title="Resetear datos de prueba"
                            description="Borra TODO el histórico de recordatorios y casos, para poder volver a ejecutar los mismos envíos como si fueran nuevos. Solo funciona en modo prueba."
                            action={
                                <Button variant="outline" onClick={() => {
                                    if (confirm('Se borrarán TODOS los recordatorios y casos registrados. Esto es solo para pruebas — se te permitirá volver a enviar los mismos. ¿Continuar?')) {
                                        resetMutation.mutate();
                                    }
                                }} disabled={resetMutation.isPending}>
                                    {resetMutation.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : <RefreshCw size={14} className="mr-2" />}
                                    {resetMutation.isSuccess ? `Borrados: ${resetMutation.data.reminders_deleted} rec + ${resetMutation.data.cases_deleted} casos` : 'Resetear'}
                                </Button>
                            }
                        />
                    )}

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

// ── Tab: Historial (v7) ────────────────────────────────────────────────────────
// Dos secciones:
//   1. Ejecuciones del cron — cada llamada a /dunning/cron/run y /cron/sync-paid
//      (Vercel + manual), con estado y motivo si se saltó.
//   2. Historial de envíos — cada recordatorio enviado (o intento fallido) con
//      apertura del correo (open tracking).

function statusChipClass(status: string): string {
    if (status === 'ok' || status === 'sent') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'skipped') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (status === 'failed' || status === 'error') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return String(iso); }
}

function CronRunsSection() {
    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['dunning', 'cron-runs'],
        queryFn: () => dunningApi.listCronRuns({ limit: 100 }),
        refetchOnWindowFocus: false,
    });
    const runs = data?.runs || [];

    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Clock size={16} /> Ejecuciones del cron
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Cada vez que Vercel Cron o un disparo manual pega contra <code className="text-[11px] bg-muted px-1 rounded">/cron/run</code> o <code className="text-[11px] bg-muted px-1 rounded">/cron/sync-paid</code>. Aunque no toque enviar, queda registro con el motivo del skip.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                    <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} /> Actualizar
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="animate-spin mr-2" size={16} /> Cargando…
                    </div>
                ) : runs.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                        Todavía no hay ejecuciones registradas. Vercel Cron se dispara cada hora en punto (UTC).
                    </div>
                ) : (
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">Cuándo</th>
                                    <th className="text-left px-3 py-2 font-semibold">Origen</th>
                                    <th className="text-left px-3 py-2 font-semibold">Endpoint</th>
                                    <th className="text-left px-3 py-2 font-semibold">Estado</th>
                                    <th className="text-left px-3 py-2 font-semibold">Motivo / resultado</th>
                                    <th className="text-right px-3 py-2 font-semibold">Duración</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {runs.map((r: DunningCronRun) => {
                                    const isExpanded = expandedId === r.id;
                                    const sentCount = Number((r.summary as any)?.sent || 0);
                                    const failedCount = Number((r.summary as any)?.failed || 0);
                                    const resultText = r.status === 'ok'
                                        ? `${sentCount} enviados, ${failedCount} fallidos`
                                        : (r.reason || '—');
                                    return (
                                        <Fragment key={r.id}>
                                            <tr className="hover:bg-muted/30">
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.ran_at)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-xs">
                                                    {r.source === 'vercel-cron' ? 'Vercel Cron' : 'Manual'}
                                                    {r.is_test && <span className="ml-1 text-amber-600">·prueba</span>}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.endpoint}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${statusChipClass(r.status)}`}>
                                                        {r.status === 'ok' ? <CheckCircle2 size={12} /> : r.status === 'error' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-xs">{resultText}</td>
                                                <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button className="text-xs text-primary hover:underline" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                                                        {isExpanded ? 'Ocultar' : 'Detalle'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-muted/20">
                                                    <td colSpan={7} className="px-3 py-3">
                                                        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-auto bg-background border rounded p-3">
                                                            {JSON.stringify(r.summary, null, 2)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function RemindersSection() {
    const [includeTest, setIncludeTest] = useState(true);
    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['dunning', 'reminders', { includeTest }],
        queryFn: () => dunningApi.listReminders({ limit: 200, include_test: includeTest }),
        refetchOnWindowFocus: false,
    });
    const reminders = data?.reminders || [];

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Mail size={16} /> Historial de envíos
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Todos los recordatorios que han salido (o intentado salir). La columna <strong>Abierto</strong> se rellena si el destinatario cargó las imágenes del correo (Gmail y Outlook web funcionan; Apple Mail lo pre-carga siempre, así que ahí puede dar falso positivo).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={includeTest} onChange={e => setIncludeTest(e.target.checked)} />
                        Incluir envíos de prueba
                    </label>
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                        <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} /> Actualizar
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="animate-spin mr-2" size={16} /> Cargando…
                    </div>
                ) : reminders.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                        Todavía no hay envíos registrados.
                    </div>
                ) : (
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">Cuándo</th>
                                    <th className="text-left px-3 py-2 font-semibold">Factura</th>
                                    <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                                    <th className="text-center px-3 py-2 font-semibold">Nivel</th>
                                    <th className="text-left px-3 py-2 font-semibold">Destino</th>
                                    <th className="text-left px-3 py-2 font-semibold">Estado</th>
                                    <th className="text-left px-3 py-2 font-semibold">Abierto</th>
                                    <th className="text-left px-3 py-2 font-semibold">Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {reminders.map((r: DunningReminderRow) => (
                                    <tr key={r.id} className="hover:bg-muted/30">
                                        <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDateTime(r.sent_at)}</td>
                                        <td className="px-3 py-2 text-xs font-mono">{r.invoice_number || r.invoice_id.slice(0, 8)}</td>
                                        <td className="px-3 py-2 text-xs">{r.contact_name || '—'}</td>
                                        <td className="px-3 py-2 text-center text-xs font-semibold">{r.level}</td>
                                        <td className="px-3 py-2 text-xs">
                                            {r.sent_to}
                                            {r.is_test && <span className="ml-1 text-[10px] text-amber-600 font-semibold">·PRUEBA</span>}
                                            {(r.cc_emails || []).length > 0 && (
                                                <div className="text-[10px] text-muted-foreground mt-0.5" title={(r.cc_emails || []).join(', ')}>
                                                    <span className="font-semibold">CC:</span> {(r.cc_emails || []).length === 1
                                                        ? r.cc_emails![0]
                                                        : `${r.cc_emails![0]} +${r.cc_emails!.length - 1}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${statusChipClass(r.status)}`}>
                                                {r.status === 'sent' ? <CheckCircle2 size={12} /> : r.status === 'failed' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-xs">
                                            {r.first_opened_at ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-700" title={`Última apertura: ${formatDateTime(r.last_opened_at)} · ${r.open_count} aperturas`}>
                                                    <Eye size={12} /> {formatDateTime(r.first_opened_at)}
                                                    {(r.open_count || 0) > 1 && <span className="text-[10px] text-muted-foreground">×{r.open_count}</span>}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">No</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-red-600 max-w-[300px] truncate" title={r.error_message || ''}>
                                            {r.error_message || ''}
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

function ReincidentsTab() {
    const [months, setMonths] = useState(12);
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['dunning', 'multi-history', months],
        queryFn: () => dunningApi.getMultiOverdueHistory({ months }),
        refetchOnWindowFocus: false,
    });

    const clients = data?.clients || [];
    const currency = (n: number) => new Intl.NumberFormat('es-ES', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(Number(n || 0));
    const monthLabel = (ym: string) => {
        const [y, m] = ym.split('-').map(Number);
        if (!y || !m) return ym;
        return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle size={16} /> Clientes reincidentes en impagos
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Cliente por cliente: en cuántos meses ha superado el umbral de facturas vencidas.
                            Útil al cierre del mes para saber a quién no darle más crédito o revisar antes de emitir factura nueva.
                            El registro se guarda cada día que el cron detecta la situación.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={months} onChange={e => setMonths(Number(e.target.value))}
                            className="text-xs px-2 py-1.5 rounded border bg-background">
                            <option value={3}>Últimos 3 meses</option>
                            <option value={6}>Últimos 6 meses</option>
                            <option value={12}>Últimos 12 meses</option>
                            <option value={24}>Últimos 24 meses</option>
                        </select>
                        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="animate-spin mr-2" size={16} /> Cargando…
                        </div>
                    ) : clients.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            Sin registros todavía. El histórico se rellena cada día que el cron detecta clientes por encima del umbral.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                                        <th className="text-center px-3 py-2 font-semibold" title="Nº de meses distintos en los que ha superado el umbral">Meses afectados</th>
                                        <th className="text-center px-3 py-2 font-semibold" title="Días totales en los que ha estado por encima del umbral">Días acumulados</th>
                                        <th className="text-center px-3 py-2 font-semibold">Pico facturas</th>
                                        <th className="text-right px-3 py-2 font-semibold">Pico deuda</th>
                                        <th className="text-left px-3 py-2 font-semibold">Línea de tiempo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {clients.map(c => (
                                        <tr key={c.contact_id || c.contact_name || Math.random()} className="hover:bg-muted/30">
                                            <td className="px-3 py-2 font-semibold text-foreground">
                                                {c.contact_name || <span className="text-muted-foreground italic">(sin nombre)</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${c.months_flagged >= 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' : c.months_flagged >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                                    {c.months_flagged}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center text-xs">{c.total_days_flagged}</td>
                                            <td className="px-3 py-2 text-center text-xs font-semibold">{c.peak_invoice_count}</td>
                                            <td className="px-3 py-2 text-right font-semibold">{currency(c.peak_amount)}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex flex-wrap gap-1">
                                                    {c.months.slice(0, 12).map(m => (
                                                        <span key={m.month}
                                                            title={`${m.days_flagged} día(s) · pico ${m.max_invoice_count} facturas · ${currency(m.peak_amount)}`}
                                                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.max_invoice_count >= 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                                                            {monthLabel(m.month)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function HistoryTab() {
    return (
        <div className="space-y-4">
            <TabGuide
                tab="history"
                storageKey="dunning:guide:history"
                title="¿Qué se ve aquí?"
                desc={
                    <>
                        Dos historiales para entender qué está haciendo el sistema:
                        <strong> Ejecuciones del cron</strong> registra cada vez que Vercel (o tú manualmente) pega contra el endpoint del cron, incluso cuando se salta el envío por no ser el día/hora configurados.
                        El <strong>Historial de envíos</strong> tiene la lista completa de correos que han salido, con si fallaron y si el destinatario los abrió.
                    </>
                }
                tips={[
                    <>El motivo del skip te dice por qué no se envió: <code>system-disabled</code>, <code>not-scheduled</code>, <code>ran-recently</code>.</>,
                    <>La columna <strong>Abierto</strong> se rellena con un pixel invisible. Gmail y Outlook web son fiables; Apple Mail lo pre-carga siempre y da falsos positivos.</>,
                    <>Detalle en las ejecuciones: click en "Detalle" para ver el JSON con las facturas planeadas y el resultado por cada una.</>,
                ]}
            />
            <CronRunsSection />
            <RemindersSection />
        </div>
    );
}


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

            <DunningIntroPanel />

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
                    {tab === 'history' && <HistoryTab />}
                    {tab === 'reincidents' && <ReincidentsTab />}
                </>
            )}
        </div>
    );
}
