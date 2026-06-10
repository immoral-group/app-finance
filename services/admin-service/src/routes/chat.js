import express from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __chatDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__chatDir, '../../.env') });

const router = express.Router();
const PORT = process.env.PORT || 3010;

// Derive BASE URL dynamically from the incoming request
function getBaseUrl(req) {
    if (req && req.headers && req.headers.host) {
        const host = req.headers.host;
        if (!host.includes('localhost')) {
            // Always use the production domain for API calls on Vercel
            // Preview deployment URLs return 401 for internal API calls
            const prodHost = process.env.PRODUCTION_URL || 'finance.immoral.es';
            return `https://${prodHost}/api/admin`;
        }
    }
    return `http://localhost:${PORT}`;
}

let openai = null;
let gemini = null;

// ════════════════════════════════════════════════════════════
// INTERPRETER PROMPT
// ════════════════════════════════════════════════════════════
const INTERPRETER_PROMPT = `Eres el clasificador de DANIA, copiloto financiero de Immoral Marketing Group.

Analiza la pregunta del usuario y devuelve SOLO un JSON válido (sin markdown).

═══ FUENTES DE DATOS ═══

"dashboard" → KPIs anuales y acumulados: facturación total, gastos totales, margen neto. Datos por departamento con sumatorio de gastos (personal, software, comisiones, etc.). USA ESTO para cualquier pregunta sobre gastos de un departamento, ingresos, márgenes, desgloses generales.
"expenses" → Gastos DETALLADOS por nombre individual. Usa esto para ver gastos individuales de un mes o trimestre específico (ej: "gastos de enero", "en qué se gastó en Q1").
"pl_real" → P&L datos REALES: ingresos y gastos mes a mes, EBITDA, márgenes operativos. También contiene los sueldos/costes de cada persona como líneas individuales.
"pl_budget" → P&L PRESUPUESTO: lo planificado para el año, mes a mes.
"pl_compare" → COMPARATIVA Real vs Presupuesto.
"billing" → Facturación por CLIENTE y SERVICIOS detallados (SEO, branding, dev, etc.).
"clients" → Datos maestros de CLIENTES: nombre, configuración de fee, verticales.
"payments" → PAGOS realizados o pendientes: detalle, beneficiario, moneda.
"payroll" → SUELDOS INDIVIDUALES: cuánto cobra/cuesta una persona específica. Se busca en P&L como línea de gasto de personal.
"users" → USUARIOS del software (no empleados de la empresa).
"clarify" → Pregunta REALMENTE ambigua donde no puedes determinar ni la fuente ni el contexto.

═══ DEPARTAMENTOS ═══
Immedia, Imcontent, Immoralia, Immoral (grupo general / la empresa), Imloyal, Imseo, Imsales, Imfilms

═══ FORMATO JSON ═══
{
  "source": "dashboard|expenses|pl_real|pl_budget|pl_compare|billing|clients|payments|payroll|users|clarify",
  "filters": {
    "year": <número>,
    "months": [<array de números 1-12, vacío si es todo el año>],
    "department": "<nombre o null>",
    "category": "<personal|software|comisiones|marketing|formacion|adspent|gastosOp o null>",
    "client": "<nombre o null>",
    "person": "<nombre de persona o null>"
  },
  "question_type": "total|breakdown|detail|comparison|list",
  "clarify_message": "<solo si source=clarify>"
}

═══ REGLAS CRÍTICAS ═══
1. Si NO se menciona año → year = {{CURRENT_YEAR}}.
2. Trimestres: Q1 = [1,2,3], Q2 = [4,5,6], Q3 = [7,8,9], Q4 = [10,11,12]. Un mes: febrero = [2]. Anual = [].
3. "personal", "trabajadores", "empleados", "nómina", "sueldos" → category = "personal".
4. "Cuánto cobra X?", "sueldo de X", "cuánto gana X" → source = "payroll", person = "X".
5. Pregunta de gastos de un departamento ("gastos de immedia", "gastos imcontent", "que gastos hay en X") → source = "dashboard", department = X, question_type = "breakdown". NUNCA pidas clarificación para esto.
6. Pregunta general ("gastos totales", "facturación total") → source = "dashboard".
7. Pregunta de gastos de un mes específico → source = "expenses".
8. Comparativas Real vs Presupuesto → source = "pl_compare".
9. Servicios facturados a un cliente → source = "billing".
10. SOLO usa source="clarify" si la pregunta es TAN vaga que no puedes asignar NINGUNA fuente. Preguntas como "gastos de X" o "facturación de Y" SIEMPRE tienen una fuente clara.
11. Saludo → source = "dashboard", question_type = "total".`;

// ════════════════════════════════════════════════════════════
// ANALYZER PROMPT
// ════════════════════════════════════════════════════════════
const ANALYZER_PROMPT = `Eres DANIA, el copiloto financiero inteligente de Immoral Marketing Group.

REGLAS:
1. Usa SOLO los datos del RESULTADO. NUNCA inventes cifras.
2. Si no hay datos, di: "No hay datos registrados para esa consulta en ese período."
3. FORMATO NÚMEROS: separador de miles con punto, sin decimales. Ej: 1.234 €.
4. Muestra exactamente lo que se pidió. Estructura bien la lista con bullet points.
5. GROUP (Immoral): Si en el resultado ves "gastos_grupo_immoral", presenta SOLO una línea: "Además, este departamento asume un X% de los gastos generales de Immoral (Group), equivalente a Y €. (Total Group: Z €)". NO muestres el desglose detallado del Group, solo el porcentaje y monto asignado a este departamento.
6. Al final, agrega un breve párrafo (*) con análisis ejecutivo: sugerencias, alertas de desajustes, tendencias.
7. Responde de manera profesional y amigable en español.
8. NO pidas clarificación cuando ya tienes datos. Muestra los datos.`;

// ════════════════════════════════════════════════════════════
// POST /chat
// ════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
    const { message, userRole, deptCode, year: reqYear, history } = req.body;
    const year = reqYear || new Date().getFullYear();

    if (!message) return res.status(400).json({ error: 'Se requiere un mensaje.' });
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Sin proveedor de IA. Añade OPENAI_API_KEY o GEMINI_API_KEY al .env.' });
    }

    try {
        // ── Greeting shortcut ──
        if (/^(hola|hey|buenas|buenos|hi|hello|qué tal)/i.test(message.trim())) {
            return res.json({
                reply: '¡Hola! 👋 Soy DANIA, tu asistente financiero. Pregúntame sobre:\n\n📊 **KPIs** — Facturación, gastos, márgenes por departamento\n💰 **Gastos** — Personal, software, comisiones, marketing, etc.\n📋 **P&L** — Presupuesto vs Real, EBITDA\n💳 **Pagos** — Estado, beneficiarios, monedas\n👥 **Clientes** — Fees, facturación por cliente\n🧑‍💼 **Empleados** — Sueldos, nóminas\n\n¿En qué puedo ayudarte?',
                intent: 'general', entity: 'general'
            });
        }

        // ── Step 1: Interpret ──
        const intent = await interpretQuery(message, history, year);
        if (!intent) {
            return res.json({
                reply: '⚠️ No pude procesar tu pregunta. Intenta de nuevo en unos segundos.',
                intent: 'error', entity: 'error'
            });
        }

        // ── Clarification ──
        if (intent.source === 'clarify') {
            return res.json({
                reply: intent.clarify_message || '¿Puedes especificar más? ¿De qué año, mes o departamento hablas?',
                intent: 'clarify', entity: 'clarify'
            });
        }

        // Force current year if missing/invalid
        if (!intent.filters) intent.filters = {};
        if (!intent.filters.year || intent.filters.year < 2020 || intent.filters.year > 2030) {
            intent.filters.year = year;
        }

        // ── Step 2: Fetch Data ──
        const BASE = getBaseUrl(req);
        console.log('[DANIA DEBUG] BASE URL:', BASE, '| Host:', req.headers?.host, '| Proto:', req.headers?.['x-forwarded-proto']);
        const appData = await fetchAppData(intent, req);
        console.log('[DANIA DEBUG] appData keys:', Object.keys(appData || {}));

        // ── Step 3: Analyze ──
        const reply = await analyzeResult(message, intent, appData);
        res.json({ reply: reply || '⚠️ No pude generar una respuesta. Intenta reformular tu pregunta.', intent: intent.source, entity: intent.source });

    } catch (err) {
        console.error('DANIA Error:', err);
        res.json({ reply: '⚠️ Error procesando tu consulta. Intenta reformular tu pregunta.', intent: 'error', entity: 'error' });
    }
});

// ════════════════════════════════════════════════════════════
// INTERPRETER
// ════════════════════════════════════════════════════════════
async function interpretQuery(message, history, currentYear) {
    let ctx = '';
    if (history?.length > 0) {
        ctx = '\n\nCONVERSACIÓN PREVIA:\n' + history.slice(-3).map(m => `${m.role === 'user' ? 'Usuario' : 'DANIA'}: ${m.content}`).join('\n');
    }
    const prompt = INTERPRETER_PROMPT.replace('{{CURRENT_YEAR}}', String(currentYear))
        + ctx + `\n\nAño actual: ${currentYear}.\nMensaje: "${message}"`;

    const raw = await callLLM(prompt, 400, 0);
    if (!raw) return null;

    try {
        return JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
        return { source: 'dashboard', filters: { year: currentYear }, question_type: 'total' };
    }
}

// ════════════════════════════════════════════════════════════
// DATA FETCHER — routes to correct internal endpoint
// ════════════════════════════════════════════════════════════
async function fetchAppData(intent, req) {
    const { source, filters: f } = intent;
    const year = f?.year || new Date().getFullYear();
    const BASE = getBaseUrl(req);

    // Resolve months directly from new prompt structure
    const months = f?.months?.length > 0 ? f.months : null;

    try {
        switch (source) {
            case 'dashboard': return await fetchDashboard(year, f, BASE);
            case 'expenses':  return await fetchExpenses(year, months, f, BASE);
            case 'pl_real':   return await fetchPL(year, 'real', f, BASE);
            case 'pl_budget': return await fetchPL(year, 'budget', f, BASE);
            case 'pl_compare':return await fetchPL(year, 'compare', f, BASE);
            case 'billing':   return await fetchBilling(year, months, f, BASE);
            case 'clients':   return await fetchClients(f, BASE);
            case 'payments':  return await fetchPayments(year, months, f, BASE);
            case 'payroll':   return await fetchPayroll(year, months, f, BASE);
            case 'users':     return await fetchUsers(BASE);
            default:          return await fetchDashboard(year, f, BASE);
        }
    } catch (err) {
        console.error(`DANIA fetch error [${source}]:`, err.message);
        return { error: err.message };
    }
}

// ────────────────────────────────────────
// DASHBOARD — KPIs anuales + por departamento
// ────────────────────────────────────────
async function fetchDashboard(year, f, BASE) {
    const data = await (await fetch(`${BASE}/dashboard/kpis/${year}`)).json();
    const depts = data.departmentPerformance || [];

    // ── Un departamento específico ──
    if (f.department) {
        const dl = f.department.toLowerCase();
        const d = depts.find(x => x.name.toLowerCase().includes(dl) || x.code?.toLowerCase().includes(dl));
        if (!d) return { year, departamento: f.department, error: 'Departamento no encontrado' };

        // Si además pide una categoría de gasto
        if (f.category) {
            const ck = f.category.toLowerCase();
            const mappedKey = mapCategoryKey(ck);
            return { year, departamento: d.name, categoria: f.category, gasto: Math.round(d.breakdown?.[mappedKey] || 0), currency: 'EUR' };
        }

        // Get Group (Immoral) % allocation from the same dashboard data
        const groupDept = depts.find(x => x.code === 'IMMORAL' || x.name.toLowerCase() === 'immoral');
        let gastos_group_info = null;
        if (groupDept && d.code !== 'IMMORAL' && groupDept.expenses > 0) {
            // Calculate this department's share based on income proportion
            const totalActiveIncome = depts
                .filter(x => x.code !== 'IMMORAL' && x.income > 0)
                .reduce((s, x) => s + x.income, 0);
            const deptPct = totalActiveIncome > 0 ? (d.income / totalActiveIncome) * 100 : 0;
            const deptAllocatedAmount = Math.round(groupDept.expenses * (deptPct / 100));
            gastos_group_info = {
                porcentaje_asignado: Math.round(deptPct * 10) / 10 + '%',
                monto_asignado: deptAllocatedAmount,
                gastos_totales_group: Math.round(groupDept.expenses)
            };
        }

        const result = { 
            year, 
            departamento: d.name, 
            ingresos_directos: Math.round(d.income), 
            gastos_directos: Math.round(d.expenses), 
            margen: Math.round(d.margin), 
            margen_pct: d.marginPct?.toFixed(1) + '%', 
            desglose_gastos_directos: d.breakdown, 
            currency: 'EUR' 
        };
        if (gastos_group_info) result.gastos_grupo_immoral = gastos_group_info;
        return result;
    }

    // ── Categoría global (todos los deptos) ──
    if (f.category) {
        const ck = f.category.toLowerCase();
        const mappedKey = mapCategoryKey(ck);
        const result = {};
        let total = 0;
        depts.forEach(d => {
            const val = d.breakdown?.[mappedKey] || 0;
            if (val > 0) { result[d.name] = Math.round(val); total += val; }
        });
        return { year, categoria: f.category, total: Math.round(total), por_departamento: result, currency: 'EUR' };
    }

    // ── KPIs generales ──
    return {
        year,
        facturacion_total: Math.round(data.kpis.totalBilling),
        gastos_totales: Math.round(data.kpis.totalExpenses),
        margen_neto: Math.round(data.kpis.netMargin),
        margen_pct: data.kpis.marginPercentage?.toFixed(1) + '%',
        departamentos: depts.map(d => ({ nombre: d.name, ingresos: Math.round(d.income), gastos: Math.round(d.expenses), margen: Math.round(d.margin) })),
        currency: 'EUR'
    };
}

// Helper: map category synonyms to dashboard breakdown keys
function mapCategoryKey(cat) {
    const map = {
        'personal': 'personal', 'trabajadores': 'personal', 'empleados': 'personal', 'nomina': 'personal', 'sueldos': 'personal', 'salarios': 'personal',
        'software': 'software', 'herramientas': 'software', 'suscripciones': 'software',
        'comisiones': 'commissions', 'commissions': 'commissions', 'comision': 'commissions',
        'marketing': 'marketing',
        'formacion': 'formacion', 'formación': 'formacion', 'cursos': 'formacion', 'capacitacion': 'formacion',
        'adspent': 'adspent', 'ad_spend': 'adspent', 'inversion_publicitaria': 'adspent', 'gasto_publicitario': 'adspent',
        'gastos_operativos': 'other', 'operativos': 'other', 'otros': 'other', 'alquiler': 'other', 'suministros': 'other'
    };
    return map[cat] || cat;
}

// ────────────────────────────────────────
// EXPENSES — Gastos detallados por mes
// ────────────────────────────────────────
async function fetchExpenses(year, months, f, BASE) {
    const targetMonths = months || [1,2,3,4,5,6,7,8,9,10,11,12];
    let all = [];

    for (const m of targetMonths) {
        try {
            const d = await (await fetch(`${BASE}/expenses/${year}/${m}`)).json();
            if (d.expenses) all = all.concat(d.expenses);
        } catch { /* no data */ }
    }

    // FILTER FIRST
    if (f.department) {
        const dl = f.department.toLowerCase();
        all = all.filter(e => e.department?.name?.toLowerCase().includes(dl));
    }
    if (f.category) {
        const cl = f.category.toLowerCase();
        const mappedKey = mapCategoryKey(cl);
        // Filter by P&L group: map each expense's category to its P&L group
        all = all.filter(e => {
            const catName = e.category?.name?.toLowerCase() || '';
            const catGroup = getExpenseCategoryGroup(e);
            return catGroup === mappedKey || catName.includes(cl);
        });
    }

    // Aggregate from FILTERED data — grouped by P&L group
    const total = all.reduce((s, e) => s + Number(e.amount || 0), 0);
    const byGroup = {}; // P&L group → { total, items: { name → amount } }
    all.forEach(e => {
        const catName = e.category?.name || 'Sin categoría';
        const group = getExpenseCategoryGroup(e);
        if (!byGroup[group]) byGroup[group] = { total: 0, items: {} };
        byGroup[group].total += Number(e.amount || 0);
        byGroup[group].items[catName] = (byGroup[group].items[catName] || 0) + Number(e.amount || 0);
    });

    // Format: round and sort items within each group
    const groupLabels = { personal: 'Personal', software: 'Software', commissions: 'Comisiones', marketing: 'Marketing', formacion: 'Formación', adspent: 'Adspent', other: 'Gastos Operativos' };
    const desglose = {};
    Object.entries(byGroup).sort(([,a],[,b]) => b.total - a.total).forEach(([g, data]) => {
        const label = groupLabels[g] || g;
        desglose[label] = {
            total: Math.round(data.total),
            detalle: Object.fromEntries(Object.entries(data.items).sort(([,a],[,b]) => b - a).map(([k,v]) => [k, Math.round(v)]))
        };
    });

    return {
        year, meses: targetMonths,
        departamento: f.department || 'todos',
        total: Math.round(total),
        desglose_por_grupo: desglose,
        num_gastos: all.length,
        currency: 'EUR'
    };
}

// Map expense to P&L groups. First checks dynamic description, then uses hardcoded matches.
function getExpenseCategoryGroup(exp) {
    if (exp && exp.description) {
        // Only use description as section_key if it's a valid known section key
        const VALID_SECTION_KEYS = new Set(['personal', 'comisiones', 'marketing', 'formacion', 'software', 'gastosOp', 'adspent']);
        if (VALID_SECTION_KEYS.has(exp.description)) {
            if (exp.description === 'gastosOp') return 'other';
            if (exp.description === 'comisiones') return 'commissions';
            return exp.description;
        }
    }

    // Fallback: Exact match from dashboard.js
    const catName = (exp && exp.category && exp.category.name) ? exp.category.name : ((typeof exp === 'string') ? exp : '');
    const n = catName || '';
    
    // Personal
    if (['Alba', 'Andrés', 'Leidy', 'Yue', 'Flor', 'Bruno', 'Grego', 'Silvia', 'Angie', 'David', 'Manel', 'Daniel', 'Mery', 'Yure', 'Marco', 'Jorge Orts', 'Externos', 'Externos puntuales', 'Gastos de Personal'].includes(n)) return 'personal';
    // Marketing
    if (n === 'Marketing') return 'marketing';
    // Formación
    if (n === 'Formación' || n === 'Formacion') return 'formacion';
    // Software
    if (n === 'Software') return 'software';
    // Adspent
    if (['Adspent', 'Adspent Nutfruit', 'Influencers'].includes(n)) return 'adspent';
    // Commissions
    if (['The connector', 'Marc', 'Christian', 'Gemelos', 'Jorge', 'Olga', 'Comisiones', 'Otras comisiones'].includes(n)) return 'commissions';
    // Gastos operativos
    return 'other';
}

// ────────────────────────────────────────
// P&L MATRIX — Real / Presupuesto / Comparativa
// ────────────────────────────────────────
async function fetchPL(year, type, f, BASE) {
    const monthsArray = f.months && f.months.length > 0 ? f.months : [1,2,3,4,5,6,7,8,9,10,11,12];
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    if (type === 'compare') {
        const [real, budget] = await Promise.all([
            (await fetch(`${BASE}/pl/matrix/${year}?type=real`)).json(),
            (await fetch(`${BASE}/pl/matrix/${year}?type=budget`)).json()
        ]);
        
        const sumSection = (data, code) => {
            const sec = data.sections?.find(s => s.code === code);
            if (!sec) return 0;
            let rows = sec.rows?.filter(r => r.type === 'item') || [];
            if (f.department) {
                const dl = f.department.toLowerCase();
                rows = rows.filter(r => r.dept?.toLowerCase().includes(dl));
            }
            let total = 0;
            rows.forEach(r => {
                monthsArray.forEach(m => total += (r.values[m-1] || 0));
            });
            return total;
        };

        const revReal = sumSection(real, 'REVENUE');
        const revBud = sumSection(budget, 'REVENUE');
        const expReal = sumSection(real, 'EXPENSES');
        const expBud = sumSection(budget, 'EXPENSES');

        return {
            year,
            meses: monthsArray,
            departamento: f.department || 'todos',
            comparativa: {
                ingresos: { real: Math.round(revReal), presupuesto: Math.round(revBud), diferencia: Math.round(revReal - revBud) },
                gastos: { real: Math.round(expReal), presupuesto: Math.round(expBud), diferencia: Math.round(expReal - expBud) }
            },
            currency: 'EUR'
        };
    }

    const data = await (await fetch(`${BASE}/pl/matrix/${year}?type=${type}`)).json();
    const result = { year, meses: monthsArray, tipo: type === 'budget' ? 'Presupuesto' : 'Real' };
    
    for (const section of (data.sections || [])) {
        let rows = (section.rows || []).filter(r => r.type === 'item');

        if (f.department) {
            const dl = f.department.toLowerCase();
            rows = rows.filter(r => r.dept?.toLowerCase().includes(dl));
        }

        const sumRow = (row) => monthsArray.reduce((s, m) => s + (row.values[m-1] || 0), 0);

        if (section.code === 'REVENUE') {
            const items = rows.map(r => ({ nombre: r.name, depto: r.dept, total: Math.round(sumRow(r)) })).filter(r => r.total > 0);
            result.ingresos = { total: items.reduce((s,r) => s + r.total, 0), lineas: items };
        } else if (section.code === 'EXPENSES') {
            const items = rows.map(r => ({ nombre: r.name, depto: r.dept, total: Math.round(sumRow(r)) })).filter(r => r.total > 0);
            result.gastos = { total: items.reduce((s,r) => s + r.total, 0), lineas: items };
        } else if (section.code === 'EBITDA' && section.values) {
            result.ebitda = { 
                total: Math.round(monthsArray.reduce((s, m) => s + (section.values[m-1] || 0), 0)), 
                desglose_mensual: monthsArray.map(m => ({ mes: MESES[m-1], valor: Math.round(section.values[m-1] || 0) }))
            };
        }
    }

    result.currency = 'EUR';
    return result;
}

// ────────────────────────────────────────
// PAYROLL — Sueldos y Empleados (from P&L Matrix)
// ────────────────────────────────────────
async function fetchPayroll(year, months, f, BASE) {
    // Salary data lives in P&L Matrix as individual expense line items under 'personal'
    const monthsArray = months && months.length > 0 ? months : [1,2,3,4,5,6,7,8,9,10,11,12];
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    try {
        const data = await (await fetch(`${BASE}/pl/matrix/${year}?type=real`)).json();
        const expSection = data.sections?.find(s => s.code === 'EXPENSES');
        if (!expSection) return { error: 'No se encontraron datos de gastos en P&L.' };

        let rows = expSection.rows?.filter(r => r.type === 'item') || [];

        // Filter to 'personal' category rows only (salaries)
        rows = rows.filter(r => {
            const desc = (r.description || '').toLowerCase();
            const skey = (r.section_key || '').toLowerCase();
            return desc === 'personal' || skey === 'personal' || desc === 'sueldos' || getExpenseCategoryGroup(r) === 'personal';
        });

        // Filter by department if requested
        if (f.department) {
            const dl = f.department.toLowerCase();
            rows = rows.filter(r => r.dept?.toLowerCase().includes(dl));
        }

        // Filter by person name if requested
        const personFilter = f.person?.toLowerCase();
        if (personFilter) {
            rows = rows.filter(r => r.name?.toLowerCase().includes(personFilter));
        }

        if (rows.length === 0) {
            return { error: personFilter 
                ? `No se encontró a "${f.person}" en los gastos de personal del P&L ${year}.`
                : 'No se encontraron registros de personal para esos criterios.' 
            };
        }

        const sumRow = (row) => monthsArray.reduce((s, m) => s + (row.values?.[m-1] || 0), 0);
        const workers = rows.map(r => ({
            nombre: r.name,
            departamento: r.dept,
            coste_total_periodo: Math.round(sumRow(r)),
            desglose_mensual: monthsArray.map(m => ({ mes: MESES[m-1], valor: Math.round(r.values?.[m-1] || 0) })).filter(x => x.valor > 0)
        })).filter(w => w.coste_total_periodo > 0);

        return {
            year,
            meses: monthsArray,
            personas_encontradas: workers.length,
            total_personal: Math.round(workers.reduce((s, w) => s + w.coste_total_periodo, 0)),
            detalle: workers,
            currency: 'EUR',
            nota: 'Datos extraídos de los gastos de personal registrados en P&L Matrix Real.'
        };
    } catch (err) {
        return { error: 'Error al consultar datos de personal: ' + err.message };
    }
}

// ────────────────────────────────────────
// BILLING — Facturación por cliente
// ────────────────────────────────────────
async function fetchBilling(year, months, f, BASE) {
    const targetMonths = months || [1,2,3,4,5,6,7,8,9,10,11,12];
    const clientTotals = {};

    for (const m of targetMonths) {
        try {
            const data = await (await fetch(`${BASE}/billing/matrix?year=${year}&month=${m}`)).json();
            
            // Build service name dictionary from columns
            const serviceNames = {};
            if (data.columns) {
                data.columns.forEach(col => {
                    if (col.id) serviceNames[col.id] = col.name || col.code;
                });
            }

            if (data.rows) {
                data.rows.forEach(row => {
                    const name = row.client_name || 'Sin cliente';
                    if (!clientTotals[name]) clientTotals[name] = { name, vertical: row.vertical, total: 0, fee: 0, months: 0, servicios: new Set() };
                    // Sum all service columns values
                    const services = row.services || row.values || {};
                    let rowTotal = 0;
                    if (typeof services === 'object') {
                        Object.entries(services).forEach(([k, v]) => { 
                            if (typeof v === 'number' && v > 0) {
                                rowTotal += v; 
                                const sname = serviceNames[k] || k;
                                clientTotals[name].servicios.add(sname);
                            }
                        });
                    }
                    if (row.total !== undefined) rowTotal = Number(row.total);
                    if (row.grand_total !== undefined) rowTotal = Number(row.grand_total);
                    
                    if (rowTotal > 0) {
                        clientTotals[name].total += rowTotal;
                        clientTotals[name].months++;
                    }
                });
            }
        } catch { /* no data */ }
    }

    let clients = Object.values(clientTotals).sort((a,b) => b.total - a.total);

    // Filter by client name
    if (f.client) {
        const cl = f.client.toLowerCase();
        clients = clients.filter(c => c.name.toLowerCase().includes(cl));
    }

    return {
        year, meses: targetMonths,
        total_facturado: Math.round(clients.reduce((s,c) => s + c.total, 0)),
        clientes: clients.map(c => ({ 
            nombre: c.name, 
            vertical: c.vertical, 
            facturado: Math.round(c.total), 
            meses_activos: c.months,
            servicios_facturados: Array.from(c.servicios)
        })),
        currency: 'EUR'
    };
}

// ────────────────────────────────────────
// CLIENTS — Datos de clientes + fee config
// ────────────────────────────────────────
async function fetchClients(f, BASE) {
    const data = await (await fetch(`${BASE}/clients`)).json();
    let clients = data.clients || [];

    if (f.client) {
        const cl = f.client.toLowerCase();
        clients = clients.filter(c => c.name?.toLowerCase().includes(cl) || c.legal_name?.toLowerCase().includes(cl));
    }

    return {
        total_clientes: clients.length,
        clientes: clients.map(c => ({
            nombre: c.name,
            nombre_legal: c.legal_name,
            email: c.email,
            vertical: c.vertical?.name || c.vertical,
            activo: c.is_active !== false,
            fee: c.fee_config ? {
                tipo: c.fee_config.fee_type,
                porcentaje_fijo: c.fee_config.fixed_pct,
                tipo_calculo: c.fee_config.calculation_type,
                rangos_variables: c.fee_config.variable_ranges
            } : null
        }))
    };
}

// ────────────────────────────────────────
// PAYMENTS — Pagos por mes
// ────────────────────────────────────────
async function fetchPayments(year, months, f, BASE) {
    const targetMonths = months || [1,2,3,4,5,6,7,8,9,10,11,12];
    let all = [];

    for (const m of targetMonths) {
        try {
            const d = await (await fetch(`${BASE}/payments/list/${year}/${m}`)).json();
            if (d.payments) all = all.concat(d.payments);
        } catch { /* no data */ }
    }

    // Separate by currency
    const byCurrency = {};
    all.forEach(p => {
        const cur = p.currency || 'EUR';
        if (!byCurrency[cur]) byCurrency[cur] = { total: 0, pagados: 0, pendientes: 0, count: 0 };
        const amt = Number(p.total_amount || p.amount || 0);
        byCurrency[cur].total += amt;
        byCurrency[cur].count++;
        if (p.payment_status === 'pagado' || p.status === 'paid') byCurrency[cur].pagados += amt;
        else byCurrency[cur].pendientes += amt;
    });

    Object.keys(byCurrency).forEach(c => {
        byCurrency[c].total = Math.round(byCurrency[c].total);
        byCurrency[c].pagados = Math.round(byCurrency[c].pagados);
        byCurrency[c].pendientes = Math.round(byCurrency[c].pendientes);
    });

    // Top beneficiaries
    const byBen = {};
    all.forEach(p => {
        const n = p.beneficiary_name || 'Sin beneficiario';
        byBen[n] = (byBen[n] || 0) + Number(p.total_amount || p.amount || 0);
    });
    const topBen = Object.entries(byBen).sort(([,a],[,b]) => b - a).slice(0, 10).map(([n,t]) => ({ nombre: n, total: Math.round(t) }));

    return { year, meses: targetMonths, por_moneda: byCurrency, top_beneficiarios: topBen, total_pagos: all.length };
}

// ────────────────────────────────────────
// USERS
// ────────────────────────────────────────
async function fetchUsers(BASE) {
    const data = await (await fetch(`${BASE}/users`)).json();
    const users = data.users || [];
    return {
        total_usuarios: users.length,
        activos: users.filter(u => u.is_active !== false).length,
        usuarios: users.map(u => ({ nombre: u.display_name, email: u.email, rol: u.role, departamento: u.department_code, activo: u.is_active }))
    };
}

// ════════════════════════════════════════════════════════════
// ANALYZER
// ════════════════════════════════════════════════════════════
async function analyzeResult(question, intent, appData) {
    const dataStr = JSON.stringify(appData);
    const trimmed = dataStr.length > 8000 ? dataStr.substring(0, 8000) + '...(truncado)' : dataStr;

    const prompt = `${ANALYZER_PROMPT}

PREGUNTA: "${question}"
INTENCIÓN: ${JSON.stringify({ source: intent.source, filters: intent.filters, question_type: intent.question_type })}
RESULTADO (datos reales de la app):
${trimmed}

Responde de forma clara y concisa en español. SOLO usa los datos del RESULTADO.`;

    return await callLLM(prompt, 1000, 0.3);
}

// ════════════════════════════════════════════════════════════
// LLM — OpenAI primary, Gemini fallback
// ════════════════════════════════════════════════════════════
async function callLLM(prompt, maxTokens = 500, temperature = 0) {
    // ── OpenAI ──
    if (process.env.OPENAI_API_KEY) {
        for (let i = 1; i <= 3; i++) {
            try {
                if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const r = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens, temperature
                });
                const t = r.choices[0]?.message?.content?.trim();
                if (t) return t;
            } catch (e) {
                console.error(`DANIA OpenAI ${i}/3:`, e.message);
                if (i < 3 && e.message.includes('429')) { await new Promise(r => setTimeout(r, 2000 * i)); continue; }
                break;
            }
        }
    }

    // ── Gemini fallback ──
    if (process.env.GEMINI_API_KEY) {
        for (let i = 1; i <= 3; i++) {
            try {
                if (!gemini) gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
                const result = await model.generateContent(prompt);
                const t = result.response?.text()?.trim();
                if (t) return t;
            } catch (e) {
                console.error(`DANIA Gemini ${i}/3:`, e.message);
                if (i < 3 && (e.message.includes('429') || e.message.includes('retry') || e.message.includes('Resource'))) {
                    let delay = 3000 * i;
                    const m = e.message.match(/retry in (\d+\.?\d*)/i);
                    if (m) delay = Math.ceil(parseFloat(m[1]) * 1000) + 1000;
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                break;
            }
        }
    }

    return null;
}

export default router;
