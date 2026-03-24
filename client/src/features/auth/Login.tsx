import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowUpRight, ArrowLeft, Mail } from 'lucide-react';
import logoPath from '@/assets/logo.png';

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focused, setFocused] = useState<string | null>(null);
    const [mode, setMode] = useState<'login' | 'forgot'>('login');
    const [resetSent, setResetSent] = useState(false);

    // Partículas de fondo
    const [particles] = useState(() =>
        Array.from({ length: 18 }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 1.5 + 0.5,
            delay: Math.random() * 4,
            duration: Math.random() * 6 + 6,
        }))
    );

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setError('Credenciales inválidas. Verifica tu email y contraseña.');
            setLoading(false);
        } else {
            navigate('/');
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });

        setLoading(false);

        if (error) {
            setError('Error al enviar el correo de recuperación. Verifica tu email.');
        } else {
            setResetSent(true);
        }
    };

    // VIDEO_ENABLED: pon tu video en client/public/login-bg.mp4
    const VIDEO_ENABLED = true;

    return (
        <div className="min-h-screen bg-[#060a14] flex items-center justify-center p-4 relative overflow-hidden">

            {/* Video de fondo */}
            {VIDEO_ENABLED ? (
                <>
                    <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ opacity: 0.68 }}
                    >
                        <source src="/login-bg.mp4" type="video/mp4" />
                        <source src="/login-bg.webm" type="video/webm" />
                    </video>
                </>
            ) : (
                <>
                    <div className="absolute inset-0 opacity-[0.01]"
                        style={{
                            backgroundImage: `
                                linear-gradient(rgba(0, 212, 255, 0.8) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(0, 212, 255, 0.8) 1px, transparent 1px)
                            `,
                            backgroundSize: '60px 60px'
                        }}
                    />
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
                </>
            )}

            {/* Partículas flotantes */}
            {particles.map(p => (
                <div
                    key={p.id}
                    className="absolute rounded-full bg-cyan-400/20 animate-pulse"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: `${p.size * 3}px`,
                        height: `${p.size * 3}px`,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                    }}
                />
            ))}

            {/* Card principal */}
            <div className="relative z-10 w-full max-w-sm">
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/20 via-transparent to-blue-500/10 blur-sm" />

                <div className="relative bg-[#0c1525]/90 backdrop-blur-xl rounded-2xl border border-[#1a2d4a]/60 p-8 shadow-2xl">

                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="flex justify-center mb-5">
                            <div className="relative">
                                <div className="relative w-16 h-16 flex items-center justify-center">
                                    <img src={logoPath} alt="Logo" className="w-full h-full object-contain" />
                                </div>
                            </div>
                        </div>

                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                            Finance
                            <span className="text-cyan-400" style={{ textShadow: '0 0 20px rgba(0,212,255,0.6)' }}>
                                {' '}Immoral Growth
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-2 tracking-wide">
                            {mode === 'login' ? 'Accede a tu panel financiero' : 'Recupera tu contraseña'}
                        </p>
                    </div>

                    {/* LOGIN FORM */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="email">
                                    Email
                                </label>
                                <div className={`relative rounded-lg transition-all duration-200 ${focused === 'email' ? 'ring-1 ring-cyan-500/60' : ''}`}>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        onFocus={() => setFocused('email')}
                                        onBlur={() => setFocused(null)}
                                        placeholder="tu@email.com"
                                        required
                                        disabled={loading}
                                        className="w-full h-10 px-3.5 bg-[#0a1628] border border-[#1a2d4a] rounded-lg text-sm text-white placeholder:text-slate-600 outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="password">
                                    Contraseña
                                </label>
                                <div className={`relative rounded-lg transition-all duration-200 ${focused === 'password' ? 'ring-1 ring-cyan-500/60' : ''}`}>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        onFocus={() => setFocused('password')}
                                        onBlur={() => setFocused(null)}
                                        placeholder="••••••••"
                                        required
                                        disabled={loading}
                                        className="w-full h-10 px-3.5 bg-[#0a1628] border border-[#1a2d4a] rounded-lg text-sm text-white placeholder:text-slate-600 outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Forgot password link */}
                            <div className="text-right">
                                <button
                                    type="button"
                                    onClick={() => { setMode('forgot'); setError(null); setResetSent(false); }}
                                    className="text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>

                            {error && (
                                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !email || !password}
                                className="relative w-full h-10 rounded-lg font-semibold text-sm overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group mt-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 transition-opacity duration-200 group-hover:opacity-90" />
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                    style={{ boxShadow: 'inset 0 0 20px rgba(0,212,255,0.2)' }} />

                                <span className="relative z-10 flex items-center justify-center gap-2 text-[#060a14] font-bold">
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</>
                                    ) : (
                                        <>Acceder <ArrowUpRight className="w-4 h-4" /></>
                                    )}
                                </span>
                            </button>
                        </form>
                    )}

                    {/* FORGOT PASSWORD FORM */}
                    {mode === 'forgot' && !resetSent && (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <p className="text-xs text-slate-400 text-center mb-2">
                                Ingresa tu email registrado y recibirás un enlace para restablecer tu contraseña.
                            </p>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="reset-email">
                                    Email
                                </label>
                                <div className={`relative rounded-lg transition-all duration-200 ${focused === 'email' ? 'ring-1 ring-cyan-500/60' : ''}`}>
                                    <input
                                        id="reset-email"
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        onFocus={() => setFocused('email')}
                                        onBlur={() => setFocused(null)}
                                        placeholder="tu@email.com"
                                        required
                                        disabled={loading}
                                        className="w-full h-10 px-3.5 bg-[#0a1628] border border-[#1a2d4a] rounded-lg text-sm text-white placeholder:text-slate-600 outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !email}
                                className="relative w-full h-10 rounded-lg font-semibold text-sm overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group mt-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 transition-opacity duration-200 group-hover:opacity-90" />
                                <span className="relative z-10 flex items-center justify-center gap-2 text-[#060a14] font-bold">
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                    ) : (
                                        <><Mail className="w-4 h-4" /> Enviar enlace de recuperación</>
                                    )}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(null); }}
                                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors mt-2"
                            >
                                <ArrowLeft className="w-3 h-3" /> Volver al inicio de sesión
                            </button>
                        </form>
                    )}

                    {/* RESET SENT CONFIRMATION */}
                    {mode === 'forgot' && resetSent && (
                        <div className="text-center space-y-4">
                            <div className="w-14 h-14 mx-auto bg-cyan-500/10 rounded-full flex items-center justify-center">
                                <Mail className="w-7 h-7 text-cyan-400" />
                            </div>
                            <div>
                                <p className="text-sm text-white font-medium">¡Correo enviado!</p>
                                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                                    Hemos enviado un enlace de recuperación a <span className="text-cyan-400">{email}</span>.
                                    Revisa tu bandeja de entrada y haz clic en el enlace para restablecer tu contraseña.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(null); setResetSent(false); }}
                                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors mt-4"
                            >
                                <ArrowLeft className="w-3 h-3" /> Volver al inicio de sesión
                            </button>
                        </div>
                    )}

                    {/* Footer */}
                    <p className="text-center text-[10px] text-slate-400 mt-6 tracking-wider uppercase">
                        IMMORAL GROWTH GROUP · {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
