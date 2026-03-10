import React, { useState, useRef, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api/admin';
import {
    MessageSquare, X, Send, Bot, User, Loader2,
    Bell, ArrowLeft, Search, Circle, Check, CheckCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface AIChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    loading?: boolean;
    time?: string;
}

interface UserMessage {
    id: string;
    sender_id: string;
    receiver_id: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

interface AppUser {
    id: string;
    email: string;
    full_name?: string;
    display_name?: string;
    role?: string;
}

interface AppNotification {
    id: string;
    type: string;
    title: string;
    body?: string;
    entity_type?: string;
    entity_id?: string;
    is_read: boolean;
    created_at: string;
}

interface ConvSummary {
    other_user_id: string;
    last_message: string;
    last_at: string;
    unread: number;
}

type Panel = 'home' | 'ai' | 'user_chat' | 'notifications';

interface ChatHubProps {
    userRole: string;
    deptCode?: string | null;
    year?: number;
    currentUser?: AppUser | null;
}

// ──────────────────────────────────────────────────────────────────
// AI History (localStorage)
// ──────────────────────────────────────────────────────────────────

const AI_HISTORY_KEY = 'imia_chat_history';

function loadAIHistory(): AIChatMessage[] {
    try { return JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveAIHistory(msgs: AIChatMessage[]) {
    try { localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(msgs.filter(m => !m.loading).slice(-40))); } catch { }
}

const WELCOME: AIChatMessage = {
    id: 'welcome', role: 'assistant', time: '',
    content: '¡Hola! Soy **DANIA**, tu asistente financiero. Puedo consultarte sobre ingresos, EBITDA, gastos, nómina, empleados y cambios salariales. ¿En qué te ayudo?'
};

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function formatRelTime(iso: string) {
    if (!iso) return '';
    try {
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`;
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    } catch { return ''; }
}
function getInitials(name?: string, email?: string) {
    if (name) return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
}
function userName(u: AppUser) { return u.display_name || u.full_name || u.email; }

function renderMarkdown(text: string) {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
        return <React.Fragment key={i}>{part.split('\n').map((line, j, arr) => (
            <React.Fragment key={j}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
        ))}</React.Fragment>;
    });
}

async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

// Función central para obtener los contadores de unread (msgs + notifs)
async function fetchUnreadCounts(): Promise<{ msgs: number; notifs: number }> {
    const token = await getToken();
    if (!token) return { msgs: 0, notifs: 0 };
    try {
        const [msgRes, notifRes] = await Promise.all([
            fetch('/api/admin/messages/unread-count', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/admin/notifications/unread-count', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const [msgJson, notifJson] = await Promise.all([msgRes.json(), notifRes.json()]);
        return { msgs: msgJson.count || 0, notifs: notifJson.count || 0 };
    } catch { return { msgs: 0, notifs: 0 }; }
}

// Función central para obtener las conversaciones
async function fetchConversations(): Promise<Record<string, ConvSummary>> {
    const token = await getToken();
    if (!token) return {};
    try {
        const res = await fetch('/api/admin/messages', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        const map: Record<string, ConvSummary> = {};
        (json.conversations || []).forEach((c: ConvSummary) => { map[c.other_user_id] = c; });
        return map;
    } catch { return {}; }
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function AIChatWidget({ userRole, deptCode, year, currentUser }: ChatHubProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [panel, setPanel] = useState<Panel>('home');
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

    // AI
    const [aiMessages, setAiMessages] = useState<AIChatMessage[]>(() => {
        const h = loadAIHistory(); return h.length > 0 ? h : [WELCOME];
    });
    const [aiInput, setAiInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Users & conversations
    const [users, setUsers] = useState<AppUser[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [conversations, setConversations] = useState<Record<string, ConvSummary>>({});

    // User chat
    const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [userMsgLoading, setUserMsgLoading] = useState(false);

    // Notifications
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

    // ── Contadores globales (floating button badge) ────────────────
    const [msgUnread, setMsgUnread] = useState(0);
    const [notifUnread, setNotifUnread] = useState(0);

    const aiEndRef = useRef<HTMLDivElement>(null);
    const userEndRef = useRef<HTMLDivElement>(null);
    const aiInputRef = useRef<HTMLInputElement>(null);
    const userInputRef = useRef<HTMLInputElement>(null);
    const currentYear = year || new Date().getFullYear();
    const totalBadge = msgUnread + notifUnread;

    // ── Dynamic collapse: button hides on scroll ────────────────────
    const [isCollapsed, setIsCollapsed] = useState(false);
    const collapseTimerRef = useRef<any>(null);
    const scrollTimerRef = useRef<any>(null);

    useEffect(() => {
        const handleScroll = () => {
            if (isOpen) return; // Don't collapse while chat is open
            setIsCollapsed(true);
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            // Show button again after 2s of no scrolling
            scrollTimerRef.current = setTimeout(() => setIsCollapsed(false), 2000);
        };
        window.addEventListener('scroll', handleScroll, true); // capture phase to catch scrollable containers
        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        };
    }, [isOpen]);

    // ── Scroll automático ───────────────────────────────────────────
    useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);
    useEffect(() => { userEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [userMessages]);
    useEffect(() => {
        if (panel === 'ai') setTimeout(() => aiInputRef.current?.focus(), 150);
        if (panel === 'user_chat') setTimeout(() => userInputRef.current?.focus(), 150);
    }, [panel]);

    // ═══════════════════════════════════════════════════════════════
    // CAPA 1: Polling global — badge del botón flotante
    // Cada 8s SIEMPRE, independiente de si el widget está abierto
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        const poll = async () => {
            const { msgs, notifs } = await fetchUnreadCounts();
            setMsgUnread(msgs);
            setNotifUnread(notifs);
        };
        poll(); // inmediato al montar
        const id = setInterval(poll, 8000);
        return () => clearInterval(id);
    }, []);

    // ═══════════════════════════════════════════════════════════════
    // CAPA 2: Polling del home panel — badges por conversación
    // Cada 8s cuando el panel home está visible
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!isOpen || panel !== 'home') return;
        const poll = async () => {
            const convs = await fetchConversations();
            setConversations(convs);
            // Sincronizar badge global con suma de unreads de todas las convs
            const total = Object.values(convs).reduce((s, c) => s + (c.unread || 0), 0);
            setMsgUnread(total);
        };
        poll();
        const id = setInterval(poll, 8000);
        return () => clearInterval(id);
    }, [isOpen, panel]);

    // ═══════════════════════════════════════════════════════════════
    // CAPA 3: Polling del user_chat — mensajes cada 4s
    // Al recibir mensajes nuevos, actualiza el badge global también
    // ═══════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!isOpen || panel !== 'user_chat' || !selectedUser) return;
        const token_holder = { token: null as string | null };

        const poll = async () => {
            if (!token_holder.token) {
                token_holder.token = await getToken();
            }
            const token = token_holder.token;
            if (!token) return;
            try {
                // 1. Traer mensajes de la conversación actual
                const res = await fetch(`/api/admin/messages/${selectedUser.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                const msgs: UserMessage[] = json.messages || [];
                setUserMessages(msgs);

                // 2. Marcar como leídos automáticamente
                const hasUnread = msgs.some(m => m.sender_id === selectedUser.id && !m.is_read);
                if (hasUnread) {
                    fetch('/api/admin/messages/mark-read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ other_user_id: selectedUser.id })
                    });
                }

                // 3. Refrescar el total global de unread (para badge del botón flotante)
                // Solo cuenta conversaciones que NO son la actual
                const convRes = await fetch('/api/admin/messages', { headers: { Authorization: `Bearer ${token}` } });
                const convJson = await convRes.json();
                const convMap: Record<string, ConvSummary> = {};
                (convJson.conversations || []).forEach((c: ConvSummary) => { convMap[c.other_user_id] = c; });
                setConversations(convMap);
                // Badge global = unreads de otras conversaciones (la actual ya se leyó)
                const othersUnread = Object.entries(convMap)
                    .filter(([id]) => id !== selectedUser.id)
                    .reduce((s, [, c]) => s + (c.unread || 0), 0);
                setMsgUnread(othersUnread);
            } catch { /* silencioso */ }
        };

        poll(); // inmediato al entrar al chat
        const id = setInterval(poll, 4000); // cada 4s
        return () => clearInterval(id);
    }, [isOpen, panel, selectedUser?.id]);

    // ── Cargar usuarios al abrir ────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        adminApi.getUsers?.().then(res => {
            setUsers((res.users || []).filter((u: any) => u.id !== currentUser?.id));
        }).catch(() => { });
    }, [isOpen]);

    // ── Cargar notificaciones al abrir ese panel ────────────────────
    useEffect(() => {
        if (panel !== 'notifications') return;
        const load = async () => {
            const token = await getToken();
            if (!token) return;
            try {
                const res = await fetch('/api/admin/notifications', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                setNotifications(json.notifications || []);
                // Marcar todas como leídas
                await fetch('/api/admin/notifications/mark-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({})
                });
                setNotifUnread(0);
            } catch { }
        };
        load();
    }, [panel]);

    // ── AI Chat ─────────────────────────────────────────────────────
    const sendAI = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || aiLoading) return;
        const t = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const userMsg: AIChatMessage = { id: Date.now().toString(), role: 'user', content: trimmed, time: t };
        const loadingMsg: AIChatMessage = { id: 'loading', role: 'assistant', content: '', loading: true };
        setAiMessages(prev => [...prev, userMsg, loadingMsg]);
        setAiInput('');
        setAiLoading(true);
        try {
            const res = await adminApi.sendChatMessage({ message: trimmed, userRole, deptCode, year: currentYear });
            const t2 = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            setAiMessages(prev => {
                const updated = prev.filter(m => m.id !== 'loading').concat({
                    id: (Date.now() + 1).toString(), role: 'assistant', content: res.reply, time: t2
                });
                saveAIHistory(updated);
                return updated;
            });
        } catch {
            setAiMessages(prev => {
                const updated = prev.filter(m => m.id !== 'loading').concat({
                    id: (Date.now() + 1).toString(), role: 'assistant',
                    content: '⚠️ No pude conectar con el asistente. Verifica que el servidor esté activo.', time: ''
                });
                saveAIHistory(updated);
                return updated;
            });
        } finally { setAiLoading(false); }
    }, [aiLoading, userRole, deptCode, currentYear]);

    const clearAIHistory = () => { localStorage.removeItem(AI_HISTORY_KEY); setAiMessages([WELCOME]); };

    // ── User Messaging ──────────────────────────────────────────────
    const sendUserMessage = useCallback(async () => {
        const trimmed = userInput.trim();
        if (!trimmed || !selectedUser || userMsgLoading) return;
        setUserMsgLoading(true);
        // Optimistic: mostrar el mensaje inmediatamente
        const optimistic: UserMessage = {
            id: `opt-${Date.now()}`,
            sender_id: currentUser?.id || '',
            receiver_id: selectedUser.id,
            message: trimmed,
            is_read: false,
            created_at: new Date().toISOString()
        };
        setUserMessages(prev => [...prev, optimistic]);
        setUserInput('');
        try {
            const token = await getToken();
            if (!token) return;
            await fetch('/api/admin/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedUser.id, message: trimmed })
            });
            // Refrescar para obtener ID real y estado correcto
            const res = await fetch(`/api/admin/messages/${selectedUser.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            setUserMessages(json.messages || []);
        } catch {
            // En caso de error, quitar el optimista
            setUserMessages(prev => prev.filter(m => m.id !== optimistic.id));
        } finally { setUserMsgLoading(false); }
    }, [userInput, selectedUser, userMsgLoading, currentUser?.id]);

    // AI suggestions
    const suggestions = userRole === 'dept_head'
        ? ['¿Cuáles son mis gastos este año?', '¿Cómo va el presupuesto?', '¿Cuántos empleados hay?']
        : ['¿Cuál es el EBITDA del año?', '¿Qué departamento factura más?', '¿Cuándo fue el último cambio de sueldo?'];

    const filteredUsers = users.filter(u =>
        userName(u).toLowerCase().includes(userSearch.toLowerCase())
    );

    // ── Render ──────────────────────────────────────────────────────
    return (
        <>
            {/* ── Botón flotante dinámico ── */}
            {!isOpen && (
                <div
                    className="fixed bottom-0 right-0 z-50"
                    onMouseEnter={() => {
                        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
                        setIsCollapsed(false);
                    }}
                    onMouseLeave={() => {
                        collapseTimerRef.current = window.setTimeout(() => setIsCollapsed(true), 2500);
                    }}
                >
                    {isCollapsed ? (
                        /* Collapsed: thin strip on right edge */
                        <div className="w-[6px] h-20 mb-4 rounded-l-md bg-gradient-to-b from-blue-500 to-indigo-600 shadow-lg cursor-pointer relative hover:w-3 transition-all duration-200">
                            {totalBadge > 0 && (
                                <span className="absolute -top-2 -left-4 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white text-[9px] font-bold flex items-center justify-center px-0.5 animate-pulse text-white shadow-sm">
                                    {totalBadge > 9 ? '9+' : totalBadge}
                                </span>
                            )}
                            <span className="absolute bottom-1 -left-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
                        </div>
                    ) : (
                        /* Expanded: full round button */
                        <button
                            onClick={() => { setIsOpen(true); setPanel('home'); }}
                            className="mb-6 mr-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-200 relative"
                            title="Comunicaciones"
                        >
                            <MessageSquare className="w-6 h-6" />
                            {totalBadge > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-red-500 rounded-full border-2 border-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
                                    {totalBadge > 9 ? '9+' : totalBadge}
                                </span>
                            )}
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                        </button>
                    )}
                </div>
            )}

            {/* ── Panel principal ── */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 w-[400px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" style={{ height: '560px' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {panel !== 'home' && (
                                <button onClick={() => { setPanel('home'); setSelectedUser(null); setUserMessages([]); }}
                                    className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                            )}
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                                {panel === 'ai' ? <Bot className="w-4 h-4" /> :
                                    panel === 'user_chat' && selectedUser ? getInitials(userName(selectedUser)) :
                                        panel === 'notifications' ? <Bell className="w-4 h-4" /> :
                                            <MessageSquare className="w-4 h-4" />}
                            </div>
                            <div>
                                <p className="font-semibold text-sm leading-none">
                                    {panel === 'ai' ? 'DANIA — Asistente IA' :
                                        panel === 'user_chat' && selectedUser ? userName(selectedUser) :
                                            panel === 'notifications' ? 'Notificaciones' : 'Comunicaciones'}
                                </p>
                                <p className="text-[10px] text-blue-200 mt-0.5">
                                    {panel === 'ai' ? 'GPT-4o + Gemini · Datos reales' :
                                        panel === 'user_chat' ? (selectedUser?.role || 'Usuario') :
                                            'IMMORAL GROWTH GROUP'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {panel === 'ai' && (
                                <button onClick={clearAIHistory}
                                    className="text-[10px] text-blue-200 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
                                    Limpiar
                                </button>
                            )}
                            <button onClick={() => { setIsOpen(false); setPanel('home'); setSelectedUser(null); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* ── HOME ── */}
                    {panel === 'home' && (
                        <div className="flex-1 overflow-y-auto bg-gray-50">
                            {/* AI */}
                            <div className="p-3 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Asistente IA</p>
                                <button onClick={() => setPanel('ai')}
                                    className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700">DANIA</p>
                                        <p className="text-xs text-gray-400">Finanzas, empleados, EBITDA…</p>
                                    </div>
                                    <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">Online</span>
                                </button>
                            </div>

                            {/* Mensajes directos */}
                            <div className="p-3 border-b border-gray-100">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mensajes</p>
                                    {msgUnread > 0 && (
                                        <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-bold">
                                            {msgUnread} {msgUnread === 1 ? 'nuevo' : 'nuevos'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 mb-2">
                                    <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                                        placeholder="Buscar usuario…"
                                        className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400" />
                                </div>
                                <div className="space-y-1 max-h-52 overflow-y-auto">
                                    {filteredUsers.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-3">Sin usuarios disponibles</p>
                                    )}
                                    {filteredUsers.map(u => {
                                        const conv = conversations[u.id];
                                        const unread = conv?.unread || 0;
                                        return (
                                            <button key={u.id}
                                                onClick={() => { setSelectedUser(u); setPanel('user_chat'); }}
                                                className="w-full flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold
                                                    ${unread > 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                                                    {getInitials(userName(u))}
                                                </div>
                                                <div className="flex-1 text-left overflow-hidden">
                                                    <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">
                                                        {userName(u)}
                                                    </p>
                                                    {conv?.last_message
                                                        ? <p className={`text-xs truncate ${unread > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                                                            {conv.last_message}
                                                        </p>
                                                        : <p className="text-xs text-gray-400">{u.role || u.email}</p>
                                                    }
                                                </div>
                                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                    {conv?.last_at && (
                                                        <p className="text-[10px] text-gray-400">{formatRelTime(conv.last_at)}</p>
                                                    )}
                                                    {unread > 0
                                                        ? <span className="w-5 h-5 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                                                            {unread > 9 ? '9+' : unread}
                                                        </span>
                                                        : <Circle className="w-2 h-2 fill-green-400 text-green-400" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Notificaciones */}
                            <div className="p-3">
                                <button onClick={() => setPanel('notifications')}
                                    className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-amber-200 hover:bg-amber-50/30 transition-all">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 relative">
                                        <Bell className="w-5 h-5 text-amber-600" />
                                        {notifUnread > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                                                {notifUnread > 9 ? '9+' : notifUnread}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-gray-800">Notificaciones</p>
                                        <p className="text-xs text-gray-400">
                                            {notifUnread > 0 ? `${notifUnread} sin leer` : 'Asignaciones en notas y actividad'}
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── AI CHAT ── */}
                    {panel === 'ai' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
                                {aiMessages.map(msg => (
                                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs mt-0.5
                                            ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                                            {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                        </div>
                                        <div className="flex flex-col gap-0.5" style={{ maxWidth: '80%' }}>
                                            <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                                                ${msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                    : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm'}`}>
                                                {msg.loading ? (
                                                    <div className="flex items-center gap-1.5 text-gray-400">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        <span className="text-xs">Consultando datos…</span>
                                                    </div>
                                                ) : <p className="whitespace-pre-wrap">{renderMarkdown(msg.content)}</p>}
                                            </div>
                                            {msg.time && (
                                                <p className={`text-[10px] text-gray-400 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                                    {msg.time}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {aiMessages.length <= 1 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {suggestions.map((s, i) => (
                                            <button key={i} onClick={() => sendAI(s)}
                                                className="text-xs bg-white border border-blue-200 text-blue-700 rounded-full px-3 py-1.5 hover:bg-blue-50 transition-colors">
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div ref={aiEndRef} />
                            </div>
                            <div className="px-3 py-3 bg-white border-t border-gray-100 flex-shrink-0">
                                <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-blue-400 transition-all">
                                    <input ref={aiInputRef} type="text" value={aiInput}
                                        onChange={e => setAiInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(aiInput); } }}
                                        placeholder="Pregunta sobre finanzas, empleados…"
                                        className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                                        disabled={aiLoading} />
                                    <button onClick={() => sendAI(aiInput)}
                                        disabled={aiLoading || !aiInput.trim()}
                                        className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 flex-shrink-0">
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400 text-center mt-1.5">
                                    DANIA · GPT-4o + Gemini · Solo datos reales de la BD
                                </p>
                            </div>
                        </>
                    )}

                    {/* ── USER CHAT ── */}
                    {panel === 'user_chat' && selectedUser && (
                        <>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                                {userMessages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
                                            <MessageSquare className="w-7 h-7 text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Inicia la conversación</p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Envía un mensaje a {userName(selectedUser).split(' ')[0]}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {userMessages.map(msg => {
                                    const isMine = msg.sender_id === currentUser?.id;
                                    return (
                                        <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                            <div className="flex flex-col gap-0.5" style={{ maxWidth: '75%' }}>
                                                <div className={`rounded-2xl px-3.5 py-2.5 text-sm
                                                    ${isMine
                                                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm'}`}>
                                                    {msg.message}
                                                </div>
                                                <div className={`flex items-center gap-1 px-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                    <p className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</p>
                                                    {isMine && (msg.is_read
                                                        ? <CheckCheck className="w-3 h-3 text-blue-400" />
                                                        : <Check className="w-3 h-3 text-gray-400" />)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={userEndRef} />
                            </div>
                            <div className="px-3 py-3 bg-white border-t border-gray-100 flex-shrink-0">
                                <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-blue-400 transition-all">
                                    <input ref={userInputRef} type="text" value={userInput}
                                        onChange={e => setUserInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(); } }}
                                        placeholder={`Mensaje para ${userName(selectedUser).split(' ')[0]}…`}
                                        className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                                        disabled={userMsgLoading} />
                                    <button onClick={sendUserMessage}
                                        disabled={userMsgLoading || !userInput.trim()}
                                        className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 flex-shrink-0">
                                        {userMsgLoading
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Send className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── NOTIFICATIONS ── */}
                    {panel === 'notifications' && (
                        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                                        <Bell className="w-7 h-7 text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-600">Sin notificaciones</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Cuando alguien te asigne en una nota,<br />aparecerá aquí
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {notifications.map(n => (
                                        <div key={n.id}
                                            className={`p-3 rounded-xl border ${n.is_read ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-100'}`}>
                                            <div className="flex items-start gap-2">
                                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <Bell className="w-4 h-4 text-amber-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm ${n.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                                                        {n.title}
                                                    </p>
                                                    {n.body && (
                                                        <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{n.body}</p>
                                                    )}
                                                    <p className="text-[10px] text-gray-400 mt-1">{formatRelTime(n.created_at)}</p>
                                                </div>
                                                {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
