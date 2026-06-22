import { useState } from 'react';
import { X } from 'lucide-react';

type Props = { onClose: () => void };

function ModalShell({
    onClose,
    accent,
    badge,
    emoji,
    title,
    subtitle,
    children,
}: {
    onClose: () => void;
    accent: string; // CSS gradient
    badge: string;
    emoji: string;
    title: string;
    subtitle: string;
    children: React.ReactNode;
}) {
    const [leaving, setLeaving] = useState(false);
    const dismiss = () => {
        setLeaving(true);
        setTimeout(onClose, 200);
    };
    return (
        <>
            <div
                className={`fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
                onClick={dismiss}
            />
            <div
                className={`fixed z-[202] left-1/2 top-1/2 w-full max-w-md px-4 transition-all duration-200 ${leaving ? 'opacity-0 -translate-x-1/2 -translate-y-[46%]' : 'opacity-100 -translate-x-1/2 -translate-y-1/2'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                    <div
                        className="relative px-6 pt-8 pb-7 flex flex-col items-center text-center"
                        style={{ background: accent }}
                    >
                        <button
                            onClick={dismiss}
                            className="absolute top-4 right-4 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                            <X size={14} className="text-white" />
                        </button>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-3">
                            {badge}
                        </span>
                        <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl mb-3 shadow-lg ring-1 ring-white/20">
                            {emoji}
                        </div>
                        <p className="text-base font-bold text-white leading-snug">{title}</p>
                        <p className="text-xs text-white/75 mt-1.5 leading-relaxed">{subtitle}</p>
                    </div>
                    <div className="bg-white px-6 py-5 space-y-3.5">
                        {children}
                        <button
                            onClick={dismiss}
                            className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                            style={{ background: accent }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

function Row({
    bg,
    icon,
    children,
}: {
    bg: string;
    icon: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className={`mt-0.5 h-6 w-6 rounded-full ${bg} flex items-center justify-center flex-shrink-0 text-sm`}>
                {icon}
            </span>
            <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Real: detalle al clicar montos de ingresos
// ─────────────────────────────────────────────────────────────────────────────
export const RealDetailInfoModal = ({ onClose }: Props) => (
    <ModalShell
        onClose={onClose}
        accent="linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)"
        badge="Pestaña Real"
        emoji="👆"
        title="Clic en un ingreso para ver el detalle"
        subtitle="Ahora cualquier celda de Ingresos con monto es clicable."
    >
        <Row bg="bg-indigo-100" icon="📋">
            <span className="font-semibold text-gray-900">Verás los clientes facturados</span> que componen ese ingreso, con su importe individual y su % del total.
        </Row>
        <Row bg="bg-purple-100" icon="🔗">
            <span className="font-semibold text-gray-900">Los datos vienen de Billing Matrix</span> y se mapean al servicio del P&L. Si el total de Billing no cuadra con el P&L se muestra un aviso amarillo con la diferencia.
        </Row>
        <Row bg="bg-pink-100" icon="🛡️">
            <span className="font-semibold text-gray-900">Es solo lectura</span>. Para editar montos sigue trabajando en Billing Matrix como siempre.
        </Row>
    </ModalShell>
);

// ─────────────────────────────────────────────────────────────────────────────
// Facturación tab — espejo del Billing Matrix por hub
// ─────────────────────────────────────────────────────────────────────────────
export const FacturacionInfoModal = ({ onClose }: Props) => (
    <ModalShell
        onClose={onClose}
        accent="linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)"
        badge="Pestaña Facturación"
        emoji="🧾"
        title="Detalle de facturación de este hub"
        subtitle="Quién y cuánto se facturó a este departamento."
    >
        <Row bg="bg-indigo-100" icon="🪞">
            <span className="font-semibold text-gray-900">Es un espejo de Billing Matrix</span> filtrado para este hub: muestra solo los clientes con montos en los servicios del depto y con los nombres del P&L (Paid General, Branding, Setup inicial, etc.).
        </Row>
        <Row bg="bg-violet-100" icon="📅">
            <span className="font-semibold text-gray-900">Vista mensual o anual</span>. Usa el toggle <span className="font-mono px-1.5 py-0.5 rounded bg-gray-100 text-[10px]">Mes / Anual</span>: en Anual se agregan los 12 meses por cliente y servicio, ideal para revisar todo el año de un vistazo.
        </Row>
        <Row bg="bg-cyan-100" icon="⬇️">
            <span className="font-semibold text-gray-900">Exporta a CSV o PDF</span> con los dos botones azules. El archivo conserva el período (mes o año) y el hub en el nombre.
        </Row>
        <Row bg="bg-pink-100" icon="🛡️">
            <span className="font-semibold text-gray-900">Solo lectura</span>. Para corregir cifras ve a Billing Matrix; los cambios se reflejan aquí al instante.
        </Row>
    </ModalShell>
);
