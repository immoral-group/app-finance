import { useState, ReactNode } from 'react';
import {
    Lightbulb, ChevronDown, X, FileWarning, Mail, Send,
    Calendar, Palette, Zap, Settings, ShieldAlert, ArrowRight, Clock,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// Pantallitas guía para el módulo de Impagos
// ══════════════════════════════════════════════════════════════════════════════
//
// Componentes reutilizables para explicar al usuario qué es el módulo y cómo
// funciona cada parte. Se pueden ocultar y el estado se guarda en localStorage
// para no molestar al usuario tras haberlo leído.
// ══════════════════════════════════════════════════════════════════════════════

function useDismissable(storageKey: string) {
    const [dismissed, setDismissed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
    });
    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(storageKey, '1'); } catch {}
    };
    const restore = () => {
        setDismissed(false);
        try { localStorage.removeItem(storageKey); } catch {}
    };
    return { dismissed, dismiss, restore };
}

// ── Panel principal colapsable ───────────────────────────────────────────────

export function DunningIntroPanel() {
    const { dismissed, dismiss, restore } = useDismissable('dunning:intro-dismissed');
    const [open, setOpen] = useState<boolean>(!dismissed);

    if (dismissed && !open) {
        return (
            <button
                onClick={() => { restore(); setOpen(true); }}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
                <Lightbulb size={13} />
                ¿Cómo funciona el módulo de impagos?
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
                <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Lightbulb size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                        ¿Qué es el módulo de impagos?
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Guía rápida para entender qué hace, cuándo actúa y cómo probarlo sin riesgo.
                    </p>
                </div>
                <ChevronDown
                    size={16}
                    className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-primary/10 pt-4">
                    <p className="text-sm text-foreground/90 leading-relaxed">
                        Este módulo <strong>reclama automáticamente las facturas vencidas</strong> a los clientes por email,
                        siguiendo 3 niveles de aviso según los días que llevan sin pagar. Cada email incluye un botón
                        de pago con Stripe y enlaces a la banca online configurada. Todo el histórico queda registrado
                        para poder ver quién ha pagado, cuánto tarda cada cliente y qué recordatorios se enviaron.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <StepCard
                            n={1}
                            icon={FileWarning}
                            title="Detecta"
                            desc="Cada hora lee las facturas vencidas de Holded y las clasifica en nivel 1, 2 o 3 según los días de retraso."
                        />
                        <StepCard
                            n={2}
                            icon={Mail}
                            title="Recuerda"
                            desc="En los días y hora que tú marques, envía el email del nivel que toque a cada cliente con su link de pago Stripe."
                        />
                        <StepCard
                            n={3}
                            icon={Send}
                            title="Sigue"
                            desc="Registra cada envío, detecta cuándo se cobra la factura y calcula estadísticas de recuperación."
                        />
                    </div>

                    <div className="rounded-lg bg-amber-100/60 dark:bg-amber-950/20 border border-amber-300/60 dark:border-amber-900 p-3">
                        <div className="flex items-start gap-2">
                            <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-900 dark:text-amber-200">
                                <p className="font-bold mb-0.5">Antes de activar en real, prueba primero.</p>
                                <p>
                                    En <em>Configuración → Ejecutar</em> puedes activar el <strong>Modo prueba</strong>: todos los recordatorios se envían a tu email en lugar de a los clientes.
                                    Cuando esté todo revisado, desactiva el modo prueba y activa el sistema en <em>Configuración → Programación</em>.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <p className="text-[11px] text-muted-foreground">
                            Puedes volver a mostrar esta guía en cualquier momento desde el enlace bajo el título.
                        </p>
                        <button
                            onClick={() => { dismiss(); setOpen(false); }}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <X size={12} /> No mostrar más
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function StepCard({ n, icon: Icon, title, desc }: { n: number; icon: any; title: string; desc: string }) {
    return (
        <div className="rounded-lg bg-background border border-border/60 p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {n}
                </span>
                <Icon size={14} className="text-primary" />
                <p className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
        </div>
    );
}

// ── Panel de niveles (leyenda de qué es cada nivel) ──────────────────────────

export function LevelsLegend({
    level1From, level1To, level2From, level2To, level3From,
}: {
    level1From: number; level1To: number;
    level2From: number; level2To: number;
    level3From: number;
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={14} className="text-primary" />
                <p className="text-sm font-semibold text-foreground">Los 3 niveles de aviso</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <LevelChip
                    color="amber"
                    level={1}
                    range={`${level1From}–${level1To} días`}
                    tone="Recordatorio amable"
                    desc="La factura acaba de vencer. Se avisa por si se ha pasado por alto."
                />
                <LevelChip
                    color="orange"
                    level={2}
                    range={`${level2From}–${level2To} días`}
                    tone="Recordatorio firme"
                    desc="Ya lleva más días. El tono sube un punto y se insiste en el pago."
                />
                <LevelChip
                    color="red"
                    level={3}
                    range={`+${level3From} días`}
                    tone="Aviso final"
                    desc="La factura está muy vencida. Se reenvía periódicamente hasta que se cobre."
                />
            </div>
        </div>
    );
}

function LevelChip({
    color, level, range, tone, desc,
}: {
    color: 'amber' | 'orange' | 'red';
    level: number; range: string; tone: string; desc: string;
}) {
    const cls = {
        amber: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200',
        orange: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900 text-orange-900 dark:text-orange-200',
        red: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200',
    }[color];
    return (
        <div className={`rounded-lg border p-3 ${cls}`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Nivel {level}</span>
                <span className="text-[11px] font-mono opacity-80">{range}</span>
            </div>
            <p className="text-xs font-semibold mb-0.5">{tone}</p>
            <p className="text-[11px] opacity-90 leading-relaxed">{desc}</p>
        </div>
    );
}

// ── Panel guía por tab en Configuración ──────────────────────────────────────

export function TabGuide({
    tab, title, desc, tips, storageKey,
}: {
    tab: 'rules' | 'schedule' | 'brand' | 'templates' | 'run' | 'history';
    title: string;
    desc: ReactNode;
    tips: ReactNode[];
    storageKey: string;
}) {
    const { dismissed, dismiss, restore } = useDismissable(storageKey);

    const meta = {
        rules: { icon: Settings, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300' },
        schedule: { icon: Calendar, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300' },
        brand: { icon: Palette, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300' },
        templates: { icon: Mail, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30 dark:text-orange-300' },
        run: { icon: Zap, color: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-300' },
        history: { icon: Clock, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300' },
    }[tab];

    if (dismissed) {
        return (
            <button
                onClick={restore}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mb-2"
            >
                <Lightbulb size={12} /> Mostrar guía de esta pestaña
            </button>
        );
    }

    const Icon = meta.icon;
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-start gap-3 p-4">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground mb-1">{title}</p>
                    <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                    {tips.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                            {tips.map((t, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                                    <ArrowRight size={12} className="text-primary shrink-0 mt-0.5" />
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button
                    onClick={dismiss}
                    aria-label="Ocultar guía"
                    className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
