import { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TOURS, Tour, getSeenTourIds, markTourSeen } from '@/lib/tours';

// ── Hook: resolves which tour to show ────────────────────────────────────────

function usePendingTour(): Tour | null {
    const { profile, hasPermission } = useAuth();
    if (!profile) return null;

    const seen = getSeenTourIds();

    for (const tour of TOURS) {
        if (seen.has(tour.id)) continue;
        if (tour.superadminOnly && profile.role !== 'superadmin') continue;
        if (tour.moduleKey && !hasPermission(tour.moduleKey)) continue;
        return tour;
    }
    return null;
}

// ── Dot indicator ─────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
    return (
        <div className="flex items-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
                <span
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                        i === current
                            ? 'w-5 h-2 bg-white'
                            : i < current
                            ? 'w-2 h-2 bg-white/40'
                            : 'w-2 h-2 bg-white/20'
                    }`}
                />
            ))}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingTour() {
    const tour = usePendingTour();
    const [step, setStep] = useState(0);
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);

    // Delay mount to let the app render first
    useEffect(() => {
        if (!tour) return;
        const t = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(t);
    }, [tour?.id]);

    const dismiss = useCallback(() => {
        if (!tour) return;
        setLeaving(true);
        setTimeout(() => {
            markTourSeen(tour.id);
            setVisible(false);
            setLeaving(false);
            setStep(0);
        }, 300);
    }, [tour]);

    const next = useCallback(() => {
        if (!tour) return;
        if (step < tour.steps.length - 1) {
            setStep(s => s + 1);
        } else {
            dismiss();
        }
    }, [tour, step, dismiss]);

    if (!tour || !visible) return null;

    const currentStep = tour.steps[step];
    const isLast = step === tour.steps.length - 1;

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 z-[200] transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
                onClick={dismiss}
            />

            {/* Glow behind card */}
            <div
                className={`fixed z-[201] pointer-events-none transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 480, height: 480,
                    background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
                    filter: 'blur(20px)',
                }}
            />

            {/* Card */}
            <div
                className={`fixed z-[202] left-1/2 top-1/2 w-full max-w-sm px-4 transition-all duration-300 ${
                    leaving
                        ? 'opacity-0 -translate-x-1/2 -translate-y-[46%]'
                        : 'opacity-100 -translate-x-1/2 -translate-y-1/2'
                }`}
                onClick={e => e.stopPropagation()}
            >
                <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">

                    {/* Gradient header */}
                    <div
                        className="relative px-6 pt-8 pb-10 flex flex-col items-center text-center"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #0ea5e9 100%)' }}
                    >
                        {/* Close button */}
                        <button
                            onClick={dismiss}
                            className="absolute top-4 right-4 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                            <X size={14} className="text-white" />
                        </button>

                        {/* Badge */}
                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-4">
                            Nuevo en Immoral Finance
                        </span>

                        {/* Emoji icon */}
                        <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-4xl mb-4 shadow-lg ring-1 ring-white/20">
                            {currentStep.emoji}
                        </div>

                        {/* Step counter */}
                        <span className="text-[11px] text-white/50 font-medium mb-3">
                            {step + 1} de {tour.steps.length}
                        </span>

                        {/* Dots */}
                        <StepDots total={tour.steps.length} current={step} />
                    </div>

                    {/* Content */}
                    <div className="bg-card px-6 py-6">
                        <h2 className="text-lg font-bold text-foreground mb-2 leading-tight">
                            {currentStep.title}
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                            {currentStep.description}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <button
                                onClick={dismiss}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                            >
                                Omitir
                            </button>

                            <button
                                onClick={next}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                            >
                                {isLast ? (
                                    <>Entendido <Check size={14} /></>
                                ) : (
                                    <>Siguiente <ArrowRight size={14} /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
