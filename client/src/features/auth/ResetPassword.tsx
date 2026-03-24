import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import logoPath from '@/assets/logo.png';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [focused, setFocused] = useState<string | null>(null);

    // Supabase handles the token exchange automatically via the URL hash
    useEffect(() => {
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                // User arrived via recovery link — they can now set new password
            }
        });
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);

        const { error } = await supabase.auth.updateUser({ password });

        setLoading(false);

        if (error) {
            setError('Error al actualizar la contraseña. El enlace puede haber expirado.');
        } else {
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        }
    };

    return (
        <div className="min-h-screen bg-[#060a14] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background */}
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

            {/* Card */}
            <div className="relative z-10 w-full max-w-sm">
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/20 via-transparent to-blue-500/10 blur-sm" />

                <div className="relative bg-[#0c1525]/90 backdrop-blur-xl rounded-2xl border border-[#1a2d4a]/60 p-8 shadow-2xl">

                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="flex justify-center mb-5">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                                <img src={logoPath} alt="Logo" className="w-full h-full object-contain" />
                            </div>
                        </div>

                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                            {success ? 'Contraseña Actualizada' : 'Nueva Contraseña'}
                        </h1>
                        <p className="text-xs text-slate-500 mt-2 tracking-wide">
                            {success ? 'Redirigiendo al login...' : 'Ingresa tu nueva contraseña'}
                        </p>
                    </div>

                    {success ? (
                        <div className="text-center space-y-4">
                            <div className="w-14 h-14 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-7 h-7 text-green-400" />
                            </div>
                            <p className="text-sm text-slate-400">
                                Tu contraseña ha sido actualizada exitosamente. Serás redirigido al login en unos segundos.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="new-password">
                                    Nueva Contraseña
                                </label>
                                <div className={`relative rounded-lg transition-all duration-200 ${focused === 'password' ? 'ring-1 ring-cyan-500/60' : ''}`}>
                                    <input
                                        id="new-password"
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        onFocus={() => setFocused('password')}
                                        onBlur={() => setFocused(null)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        disabled={loading}
                                        className="w-full h-10 px-3.5 bg-[#0a1628] border border-[#1a2d4a] rounded-lg text-sm text-white placeholder:text-slate-600 outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider" htmlFor="confirm-password">
                                    Confirmar Contraseña
                                </label>
                                <div className={`relative rounded-lg transition-all duration-200 ${focused === 'confirm' ? 'ring-1 ring-cyan-500/60' : ''}`}>
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        onFocus={() => setFocused('confirm')}
                                        onBlur={() => setFocused(null)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
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
                                disabled={loading || !password || !confirmPassword}
                                className="relative w-full h-10 rounded-lg font-semibold text-sm overflow-hidden transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group mt-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 transition-opacity duration-200 group-hover:opacity-90" />
                                <span className="relative z-10 flex items-center justify-center gap-2 text-[#060a14] font-bold">
                                    {loading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Actualizando…</>
                                    ) : (
                                        <><KeyRound className="w-4 h-4" /> Restablecer Contraseña</>
                                    )}
                                </span>
                            </button>
                        </form>
                    )}

                    <p className="text-center text-[10px] text-slate-400 mt-6 tracking-wider uppercase">
                        IMMORAL GROWTH GROUP · {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
