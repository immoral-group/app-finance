// ─────────────────────────────────────────────────────────
// Changelog / What's New entries
// Each entry can be tied to a module key from ALL_MODULES.
// If moduleKey is undefined → visible to ALL users.
// If superadminOnly → only superadmins see it.
// ─────────────────────────────────────────────────────────

export interface ChangelogEntry {
    id: string;
    date: string; // ISO date (YYYY-MM-DD)
    title: string;
    description: string;
    type: 'new_module' | 'improvement' | 'fix' | 'in_progress';
    moduleKey?: string;       // ties to ALL_MODULES key — if set, requires permission
    superadminOnly?: boolean;
    icon?: string;            // lucide icon name
    highlight?: boolean;      // si true, muestra punto azul en sidebar hasta dismiss
}

/**
 * Add new entries at the TOP of the array (newest first).
 * The component will filter based on user permissions automatically.
 */
export const CHANGELOG: ChangelogEntry[] = [
    {
        id: 'v1.46-envionovedades-url-modulo',
        date: '2026-07-16',
        title: 'Enviar novedades: el link del correo abre el módulo concreto',
        description: 'El botón CTA y los enlaces del pie del correo de novedades ya no llevan al home de la app: ahora abren directamente el espacio donde vive esa funcionalidad (p. ej. Impagos → /payments/dunning, Rentabilidad → /profitability, P&L Matrix → /pl-matrix, etc.). El destino se calcula a partir del moduleKey de cada novedad usando el mismo mapeo que el sidebar. Si la novedad es transversal y no tiene moduleKey, sigue yendo a la raíz.',
        type: 'fix',
        moduleKey: 'release_notifications',
        superadminOnly: true,
        icon: 'Mail',
        highlight: true,
    },
    {
        id: 'v1.45-escenarios-montos-y-compartir',
        date: '2026-07-16',
        title: 'Escenarios: definir montos por fila y compartir por correo',
        description: 'Los escenarios de Forecast y Presupuesto ahora aceptan un objetivo o monto exacto en € para cualquier fila y rango de meses (además del ajuste por %). El drill-down "Definir monto por fila" está organizado como el resto del modal: Ingresos por hub → servicio, Gastos por categoría → hub → item. Las celdas con monto asignado se resaltan en ámbar mostrando el valor base tachado como referencia. Nuevo botón para compartir un escenario por correo (a usuarios de la app o direcciones externas): el destinatario recibe un mensaje con el resumen del cambio y un link que abre la app con el escenario ya aplicado. Al entrar aparece un banner destacado "Escenario compartido contigo" con la comparativa anual base → escenario (Ingresos, Gastos, EBITDA y Rentabilidad %) y un botón claro para volver al Forecast/Presupuesto base.',
        type: 'improvement',
        moduleKey: 'pl_matrix',
        icon: 'Sparkles',
        highlight: true,
    },
    {
        id: 'v1.44-impagos-guia',
        date: '2026-07-16',
        title: 'Impagos: pantallitas de ayuda integradas',
        description: 'Añadidas guías cortas dentro del módulo de Impagos y Configuración de impagos para que cualquier usuario que entre por primera vez entienda qué es, cómo funciona y qué hace cada pestaña. En la pantalla principal aparece un panel plegable "¿Qué es el módulo de impagos?" con el flujo en 3 pasos (Detecta → Recuerda → Sigue) y una leyenda de los 3 niveles de aviso con los rangos de días reales. En Configuración, cada pestaña (Reglas, Programación, Marca y bancos, Plantillas, Ejecutar) trae su propio panel explicativo con consejos prácticos. Las guías se pueden ocultar y el estado se recuerda por usuario (localStorage).',
        type: 'improvement',
        moduleKey: 'dunning',
        superadminOnly: true,
        icon: 'Lightbulb',
        highlight: true,
    },
    {
        id: 'v1.43-impagos',
        date: '2026-07-14',
        title: 'Impagos: gestión automática de recordatorios de pago',
        description: 'Nuevo módulo dentro de Payments para gestionar el envío de recordatorios de facturas vencidas de forma automática y trazable. Sustituye el flujo antiguo de n8n que enviaba correos sin dejar rastro. Dashboard con KPIs (vencidas ahora, recordatorios enviados, cobrados, media de días hasta cobro), reparto por nivel y tabla en vivo desde Holded. Configuración por tabs: reglas (rangos de días 5-9 / 10-14 / +15), programación con día(s) y hora, marca visual (logo, colores, firma), lista editable de bancos para pago por transferencia, plantillas por nivel con hero + copies personalizables, y sección Ejecutar con preview, envío de prueba a tu email, sincronización de cobros desde Holded y ejecución manual. Genera links de Stripe reales por cada factura para pagar con tarjeta. Cron de Vercel dispara el envío automáticamente los días/hora configurados. Modo prueba dirigido para hacer QA sin arriesgar (todo va a un email destino) y overrides por cliente. KPIs excluyen los envíos hechos en modo prueba.',
        type: 'new_module',
        moduleKey: 'dunning',
        superadminOnly: true,
        icon: 'Mail',
        highlight: true,
    },
    {
        id: 'v1.42-enviar-novedades-email',
        date: '2026-07-08',
        title: 'Enviar novedades por email desde la app',
        description: 'Nueva pantalla para superadmins: elige cualquier novedad del historial, decide a quién enviársela (usuarios de la app filtrados por rol/depto o direcciones externas escritas a mano) y previsualiza el correo antes de enviar. Cada destinatario recibe un correo dedicado con el diseño de Immoral Finance. Ideal para avisar a todo el equipo o a clientes específicos cuando lanzamos algo nuevo.',
        type: 'new_module',
        moduleKey: 'release_notifications',
        superadminOnly: true,
        icon: 'Mail',
        highlight: true,
    },
    {
        id: 'v1.41-escenarios-filas',
        date: '2026-07-08',
        title: 'Escenarios: añadir y quitar filas (bajas, altas y paga doble)',
        description: 'Los escenarios ya no se limitan a subir o bajar porcentajes. Ahora puedes simular una baja de un trabajador a partir de un mes concreto, añadir una fila nueva (nuevo fichaje, nuevo software, adspend puntual...) con su coste €/mes y rango de meses, y estimar la paga doble o el extra de diciembre para altas en Personal. Disponible en Presupuesto y en Forecast — bibliotecas independientes, 100% retrocompatible con los escenarios guardados.',
        type: 'new_module',
        moduleKey: 'pl_matrix',
        icon: 'Sparkles',
        highlight: true,
    },
    {
        id: 'v1.40-rentabilidad-tiempo-real',
        date: '2026-06-16',
        title: 'Rentabilidad: actualización en tiempo real',
        description: 'Los cambios en P&L (sueldos) y en horas manuales se reflejan al instante en Rentabilidad por Cuenta sin necesidad de recargar la página. El cálculo de €/hora cuenta automáticamente sólo los meses con sueldo > 0 registrados (sin rellenar huecos): al añadir un mes nuevo en P&L, la fórmula se actualiza sola.',
        type: 'improvement',
        moduleKey: 'profitability',
        icon: 'Zap',
        highlight: true,
    },
    {
        id: 'v1.39-rentabilidad-buscador-evolucion',
        date: '2026-06-16',
        title: 'Rentabilidad: buscador, ordenación y evolución anual',
        description: 'Buscador de cuentas, ordenación configurable (alfabético, rentabilidad, horas, fee) y opción de ocultar cuentas con un dropdown "Ocultos (N)" para reactivarlas cuando quieras. En modo Anual, click en el icono de tendencia abre un panel con la evolución mensual de cada cuenta: 3 mini-gráficas independientes (Horas, Coste, Beneficio) con línea de tendencia, hover detallado y click en cualquier mes para ver el equipo.',
        type: 'improvement',
        moduleKey: 'profitability',
        icon: 'Search',
        highlight: true,
    },
    {
        id: 'v1.38-rentabilidad-horas-manuales',
        date: '2026-06-16',
        title: 'Rentabilidad: horas manuales por persona',
        description: 'Para usuarios que ya no están en ClickUp (desactivados) o freelancers no enlazados, ahora puedes cargar manualmente sus horas en cada cuenta y mes. Configura la persona una sola vez en "Configurar > Personas manuales" (el coste/hora se calcula desde su sueldo en P&L automáticamente si su nombre coincide con una categoría de gasto). Luego, en el modal mensual de cada cuenta, "+ Añadir horas manuales" para meter las horas. Aparecen en el desglose del equipo igual que los detectados desde ClickUp.',
        type: 'improvement',
        moduleKey: 'profitability',
        icon: 'Users',
        highlight: true,
    },
    {
        id: 'v1.37-mobile-rendering',
        date: '2026-06-11',
        title: 'Renderizado Móvil Mejorado',
        description: 'Revisión completa de la interfaz para iOS y Android. Los montos ya no se desbordan fuera de las tarjetas, los grids se apilan correctamente en pantallas pequeñas, el menú y el buscador del header se adaptan al espacio disponible, y todos los formularios y filtros funcionan bien en móvil.',
        type: 'fix',
        icon: 'Smartphone',
        highlight: false,
    },
    {
        id: 'v1.36-payment-links-history',
        date: '2026-06-11',
        title: 'Historial de Links de Pago',
        description: 'Consulta todos los links generados con filtros por estado (Activo, Pagado, Expirado, Cancelado). Desde el historial puedes copiar el link, reenviar por email o cancelarlo antes de que expire.',
        type: 'new_module',
        moduleKey: 'payment_links',
        icon: 'Link',
        highlight: true,
    },
    {
        id: 'v1.35-generate-payment-link',
        date: '2026-06-11',
        title: 'Nuevo Módulo: Links de Pago con Stripe',
        description: 'Genera links de pago seguros directamente desde la plataforma. Crea un link desde una factura existente de Holded (con datos y email autocompletados) o de forma manual con concepto e importe. El cliente recibe un checkout de Stripe seguro en español. Los links tienen una duración de 24 horas y el cobro se reconcilia automáticamente en Holded.',
        type: 'new_module',
        moduleKey: 'payment_links',
        icon: 'CreditCard',
        highlight: true,
    },
    {
        id: 'v1.34-rentabilidad-por-cuenta',
        date: '2026-06-10',
        title: 'Nuevo Módulo: Rentabilidad por Cuenta',
        description: 'Cruza la facturación mensual de cada cliente con las horas reales registradas en ClickUp y calcula automáticamente Fee/hora, Coste/hora del equipo, Coste Immoral, Beneficio y % Rentabilidad con semáforo (verde ≥60%, ámbar 40–59%, rojo <40%). Haz click en las horas para ver el desglose del equipo. Configurable desde el botón "Configurar".',
        type: 'new_module',
        moduleKey: 'profitability',
        icon: 'TrendingUp',
        highlight: true,
    },
    {
        id: 'v1.34-clickup-integration',
        date: '2026-06-10',
        title: 'Integración con ClickUp',
        description: 'Conectamos directamente con ClickUp para traer las horas reales de cada cuenta. El coste/hora de cada empleado se calcula automáticamente desde Gastos Reales (salario ÷ 160h × meses activos). Cache de 8 minutos para acelerar la carga y botón de sincronización manual.',
        type: 'new_module',
        moduleKey: 'developers',
        icon: 'Clock',
        highlight: true,
    },
    {
        id: 'v1.33-client-billing-report',
        date: '2026-05-21',
        title: 'Nuevo Módulo: Facturación por Cliente',
        description: 'Vista anual con todos los clientes en filas y los 12 meses en columnas. Haz clic en cualquier cifra para ver el desglose por departamento y servicio. Descarga en Excel o PDF con un clic.',
        type: 'new_module',
        moduleKey: 'client_billing',
        icon: 'PieChart',
    },
    {
        id: 'v1.32-imsales-billing-module',
        date: '2026-04-26',
        title: 'Módulo Nativo: Billing Imsales',
        description: 'Lanzamos un espacio de facturación dedicado y 100% nativo para el equipo de Imsales. Optimizado para la gestión masiva de inversiones, cálculo de totales en tiempo real y una interfaz limpia accesible desde el menú principal.',
        type: 'new_module',
        icon: 'ShoppingCart',
    },
    {
        id: 'v1.31-imsales-end-to-end',
        date: '2026-04-26',
        title: 'Imsales End-to-End en P&L',
        description: 'El flujo de datos de Imsales ahora está completamente integrado con la contabilidad central. Cada inversión registrada impacta instantáneamente de manera automática en el P&L General y en los reportes financieros.',
        type: 'improvement',
        icon: 'Network',
    },
    {
        id: 'v1.30-imsales-dashboard-analytics',
        date: '2026-04-26',
        title: 'Dashboard: Analítica de Imsales',
        description: 'El Dashboard corporativo ahora incluye el seguimiento en tiempo real del nuevo departamento Imsales. Analiza el rendimiento, margen EBITDA y la contribución de ingresos con un solo clic.',
        type: 'improvement',
        icon: 'LineChart',
    },
    {
        id: 'v1.29-imsales-service-routing',
        date: '2026-04-26',
        title: 'Gestión Inteligente de Servicios IMS',
        description: 'Soporte nativo para los servicios especializados "Setup Inicial IMS" y "Captación". El sistema clasifica y rutea matemáticamente la inversión de cada cliente hacia su estructura de ingresos correspondiente.',
        type: 'improvement',
        icon: 'GitMerge',
    },
    {
        id: 'v1.28-imsales-departmental-control',
        date: '2026-04-26',
        title: 'Control Financiero por Departamentos',
        description: 'Se ha expandido el sistema de permisos y el panel de control departamental (Department P&L) para darle soporte nativo a Imsales, garantizando privacidad de datos y métricas individualizadas.',
        type: 'improvement',
        icon: 'ShieldCheck',
    },
    {
        id: 'v1.27-imsales-ux-capture',
        date: '2026-04-26',
        title: 'Experiencia de Captura de Datos Mejorada',
        description: 'El nuevo entorno de Imsales introduce tablas de alta velocidad con controles numéricos inteligentes, soporte para decimales avanzados y cálculo automático de KPIs por línea de servicio en un entorno visual inmersivo.',
        type: 'improvement',
        icon: 'Zap',
    },
    {
        id: 'v1.26-pl-matrix-imfilms-personal',
        date: '2026-04-19',
        title: 'P&L Matrix: Personal Imfilms',
        description: 'Nueva fila de Gastos de Personal para Imfilms — Olga Garasym. El gasto registrado se refleja automáticamente en la tarjeta de Imfilms del Dashboard, que ahora incluye la categoría Personal.',
        type: 'improvement',
        moduleKey: 'pl',
        icon: 'Building2',
    },
    {
        id: 'v1.25-media-month-review-warning',
        date: '2026-04-19',
        title: 'Media Investment: Aviso de Revisión de Mes',
        description: 'Al entrar al módulo de Control de Inversión de Medios aparece un aviso recordando que la facturación se hace a mes vencido. El botón de confirmación se habilita tras 5 segundos para asegurar que se ha leído.',
        type: 'improvement',
        moduleKey: 'media',
        icon: 'AlertCircle',
    },
    {
        id: 'v1.24-hide-client-history-fix',
        date: '2026-04-19',
        title: 'Fix: Historial de Clientes Ocultos',
        description: 'Corregido un error por el que reactivar un cliente en un mes posterior borraba su estado oculto en meses anteriores. Ahora el aviso de clientes ocultos persiste correctamente en todos los períodos donde aplica, tanto en Billing Matrix como en Media Investment.',
        type: 'fix',
        moduleKey: 'billing',
        icon: 'EyeOff',
    },
    {
        id: 'v1.23-dashboard-holded-detail-modal',
        date: '2026-03-26',
        title: 'Dashboard: Detalle de Facturas',
        description: 'Al hacer click en las tarjetas de Facturas Pendientes o Vencidas del Dashboard, se abre un panel de detalle con la lista completa de facturas incluyendo Nº, Cliente, Vencimiento y Total.',
        type: 'new_module',
        moduleKey: 'dashboard',
        icon: 'LayoutDashboard',
    },
    {
        id: 'v1.22-dashboard-holded-cards',
        date: '2026-03-26',
        title: 'Dashboard: Indicadores Holded Immoral',
        description: 'Nuevas tarjetas en tiempo real debajo de los departamentos: Facturas Pendientes (aún no vencidas), Facturas Vencidas, Estimado por Recibir y Saldo en Caja desde Holded.',
        type: 'new_module',
        moduleKey: 'dashboard',
        icon: 'LayoutDashboard',
    },
    {
        id: 'v1.21-holded-overdue-detection',
        date: '2026-03-26',
        title: 'Holded: Detección de Facturas Vencidas',
        description: 'Las facturas con fecha de vencimiento pasada se marcan automáticamente como "Vencidas" con indicador visual ⚠ en rojo. Las facturas anuladas se excluyen del conteo y aparecen diferenciadas en gris.',
        type: 'improvement',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.20-holded-invoice-filters',
        date: '2026-03-26',
        title: 'Holded: Filtros de Facturas',
        description: 'Filtra facturas por estado (Pendientes, Pagadas, Parcial, Vencidas), por mes y por año. Incluye fila de totales con Subtotal, Total y Pendiente de cobro.',
        type: 'improvement',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.19-holded-integration-panel',
        date: '2026-03-26',
        title: 'Panel de Integración con Holded',
        description: 'Conexión directa con Holded para visualizar facturas, contactos y tesorería en tiempo real. Incluye indicador de saldo total y tarjetas de resumen por cuenta bancaria.',
        type: 'new_module',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.18-developers-multi-integration',
        date: '2026-03-26',
        title: 'Integraciones: Arquitectura Multi-App',
        description: 'Nuevo diseño de tarjetas tipo app store en el panel de Integraciones. Preparado para añadir futuras conexiones como Stripe, n8n y más, de forma escalable.',
        type: 'new_module',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.17-developers-api-docs',
        date: '2026-03-26',
        title: 'Developers: Documentación de Endpoints',
        description: 'Documentación interactiva estilo profesional con todos los endpoints disponibles del sistema: P&L, Facturación, Gastos por Departamento y Coste por Hora. Incluye ejemplos de respuesta y parámetros.',
        type: 'new_module',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.16-developers-api-keys',
        date: '2026-03-26',
        title: 'Developers: Gestión de API Keys',
        description: 'Crea, revoca y gestiona claves de acceso para integrar la plataforma con aplicaciones externas. Cada API Key incluye nombre, permisos y fecha de expiración.',
        type: 'new_module',
        moduleKey: 'developers',
        icon: 'Code2',
    },
    {
        id: 'v1.15-password-recovery',
        date: '2026-03-24',
        title: 'Recuperación de Contraseña',
        description: 'Estamos implementando la función de "¿Olvidaste tu contraseña?" en la pantalla de login. Pronto podrás restablecer tu contraseña directamente desde tu email.',
        type: 'in_progress',
        icon: 'LogIn',
    },
    {
        id: 'v1.14-commission-admin-panel',
        date: '2026-03-24',
        title: 'Panel de Gestión de Solicitudes',
        description: 'Los administradores ahora ven un panel destacado en el Dashboard de Comisiones con las solicitudes de pago pendientes. Pueden aprobar, rechazar o eliminar solicitudes directamente, con historial completo y descarga de facturas.',
        type: 'new_module',
        moduleKey: 'commissions',
        superadminOnly: true,
        icon: 'Handshake',
    },
    {
        id: 'v1.13-commission-payment-request',
        date: '2026-03-24',
        title: 'Solicitud de Pago de Comisiones',
        description: 'Los partners ahora pueden solicitar el pago de sus comisiones pendientes adjuntando su factura. Se puede solicitar un mes específico o todas las comisiones del año. El admin recibe notificación por email y en la app.',
        type: 'new_module',
        moduleKey: 'commissions',
        icon: 'Handshake',
    },
    {
        id: 'v1.12-commission-month-filter',
        date: '2026-03-24',
        title: 'Filtro por Mes en Comisiones',
        description: 'El detalle de cada partner ahora incluye un filtro rápido por mes. Ya no es necesario ver todas las operaciones del año, puedes seleccionar el mes exacto que necesitas revisar.',
        type: 'improvement',
        moduleKey: 'commissions',
        icon: 'Handshake',
    },
    {
        id: 'v1.11-payments-decimals-methods',
        date: '2026-03-17',
        title: 'Pagos: Decimales y Nuevos Métodos',
        description: 'Se habilita el uso de decimales en montos y totales (Base Imponible, Incentivos, etc.). Además, se agregaron PayPal y Payoneer en Métodos de Pago Preferidos para los beneficiarios.',
        type: 'improvement',
        moduleKey: 'payments',
        icon: 'CreditCard',
    },
    {
        id: 'v1.10-pl-year-isolation',
        date: '2026-03-17',
        title: 'Aislamiento de Años en P&L',
        description: 'Las filas personalizadas (Custom Rows) ahora son únicas por año fiscal. Si agregas una fila en 2025, no aparecerá en 2026, manteniendo tu estructura financiera completamente separada y precisa por cada año.',
        type: 'improvement',
        moduleKey: 'pl',
        icon: 'Building2',
    },
    {
        id: 'v1.9-payments',
        date: '2026-03-13',
        title: 'Módulo de Pagos',
        description: 'Nuevo módulo para registrar pagos a proveedores y socios, con soporte multidivisa y conciliación automática.',
        type: 'new_module',
        moduleKey: 'payments',
        icon: 'CreditCard',
    },
    {
        id: 'v1.8-activity-log',
        date: '2026-03-13',
        title: 'Monitor de Actividad',
        description: 'Registro auditable de todas las operaciones de la plataforma en tiempo real. Ahora puedes ver quién hizo qué y cuándo.',
        type: 'new_module',
        superadminOnly: true,
        icon: 'Activity',
    },
    {
        id: 'v1.7-ai-copilot',
        date: '2026-03-13',
        title: 'Copiloto Financiero IA (DANIA)',
        description: 'Hemos integrado a DANIA, tu asistente financiero. Puedes preguntarle sobre facturación, nóminas, gastos por departamento y hacer consultas avanzadas del P&L directamente desde el chat flotante.',
        type: 'new_module',
        icon: 'Bot',
    },
    {
        id: 'v1.6-mobile-view',
        date: '2026-03-13',
        title: 'Interfaz Móvil Optimizada',
        description: 'La aplicación ahora es 100% responsiva. El menú lateral se oculta inteligentemente en teléfonos móviles y se puede abrir con el nuevo botón en la esquina superior izquierda.',
        type: 'improvement',
        icon: 'Smartphone',
    },
    {
        id: 'v1.5-partner-restrictions',
        date: '2026-03-10',
        title: 'Espacios de Partner Restringidos',
        description: 'Los usuarios de tipo Partner ahora solo ven su propio espacio de comisiones. Los jefes de departamento ya no ven opciones de configuración.',
        type: 'improvement',
        superadminOnly: true,
        icon: 'Shield',
    },
    {
        id: 'v1.4-user-management',
        date: '2026-03-10',
        title: 'Gestión Avanzada de Usuarios',
        description: 'Nuevo rol "Partner" con asociación automática. Ahora puedes ver y modificar contraseñas, emails y eliminar usuarios completamente.',
        type: 'improvement',
        moduleKey: 'user_management',
        superadminOnly: true,
        icon: 'UserCog',
    },
    {
        id: 'v1.3-commissions',
        date: '2026-03-09',
        title: 'Módulo de Comisiones',
        description: 'Nuevo módulo completo para gestionar partners, clientes y comisiones. Incluye dashboard con KPIs, vista anual, trimestral y mensual, y detalle por partner.',
        type: 'new_module',
        moduleKey: 'commissions',
        icon: 'Handshake',
    },
    {
        id: 'v1.2-dashboard-verticals',
        date: '2026-03-08',
        title: 'Dashboard: Verticales Personalizables',
        description: 'Las tarjetas de Imfilms e Imfashion ahora son las únicas visibles por defecto. Las demás se pueden habilitar desde la opción de personalización.',
        type: 'improvement',
        moduleKey: 'dashboard',
        icon: 'LayoutDashboard',
    },
    {
        id: 'v1.1-dept-pl-filters',
        date: '2026-03-04',
        title: 'Filtros Mejorados en Departamentos',
        description: 'Los indicadores del P&L por departamento ahora se actualizan dinámicamente al seleccionar un mes o periodo específico.',
        type: 'improvement',
        moduleKey: 'departamentos',
        icon: 'Building2',
    },
    {
        id: 'v1.0-dark-mode',
        date: '2026-02-19',
        title: 'Modo Oscuro Premium',
        description: 'Nuevo diseño dark mode con acentos neon cyan. Todas las tablas, modales y formularios adaptados para una experiencia visual nocturna premium.',
        type: 'improvement',
        icon: 'Moon',
    },
    {
        id: 'v0.9-login-redesign',
        date: '2026-02-19',
        title: 'Login Rediseñado',
        description: 'Nueva página de login con fondo de video, animaciones fluidas y diseño glassmorphism de última generación.',
        type: 'improvement',
        icon: 'LogIn',
    },
];

// ── Helpers ──────────────────────────────────────────────

const STORAGE_KEY = 'fi_changelog_seen';

export function getSeenIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

export function markAllSeen(ids: string[]) {
    try {
        const current = getSeenIds();
        ids.forEach(id => current.add(id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    } catch { /* noop */ }
}

// ── Module Highlight (Guided Dots on Sidebar) ────────────

const HIGHLIGHT_STORAGE_KEY = 'fi_module_highlights_dismissed';

export function getDismissedHighlights(): Set<string> {
    try {
        const raw = localStorage.getItem(HIGHLIGHT_STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

export function dismissModuleHighlight(entryId: string) {
    try {
        const current = getDismissedHighlights();
        current.add(entryId);
        localStorage.setItem(HIGHLIGHT_STORAGE_KEY, JSON.stringify([...current]));
    } catch { /* noop */ }
}

/**
 * Returns a map of moduleKey → newest non-dismissed changelog entry.
 * Used by the Sidebar to show pulsing dots and tooltip popovers.
 */
export function getModuleHighlights(): Map<string, ChangelogEntry> {
    const dismissed = getDismissedHighlights();
    const map = new Map<string, ChangelogEntry>();

    // CHANGELOG is newest-first, so first match per module wins
    for (const entry of CHANGELOG) {
        if (!entry.moduleKey) continue;
        if (!entry.highlight) continue; // solo entradas marcadas con highlight
        if (dismissed.has(entry.id)) continue;
        if (map.has(entry.moduleKey)) continue;
        map.set(entry.moduleKey, entry);
    }

    return map;
}
