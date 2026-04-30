# Registro de Cambios

## Información General
- **Rama:** feat/updatebillingandapp
- **Fecha de inicio:** 14 de abril de 2026
- **Propósito general:** Mejoras de UX, nuevas features y sistema de auditoría de cambios.

---

## Cambios Realizados

---

### 2026-04-14 — Configuración inicial del entorno

- Creado archivo `.env` en la raíz del proyecto con las credenciales de Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  - Credenciales SMTP para notificaciones
- Creado este archivo `REGISTRO.md` para llevar tracking de todos los cambios realizados en esta rama.

---

### 2026-04-14 — Fix: Pérdida de estado visual al cambiar de pestaña del navegador

**Problema:**
Cada vez que el usuario cambiaba de pestaña del navegador y volvía, la app:
1. Hacía refetch de todos los datos (`refetchOnWindowFocus: true` por defecto en React Query)
2. Reseteaba la tab activa al valor por defecto
3. Perdía filtros, año seleccionado y período de tiempo
4. Perdía la posición del scroll

**Causa raíz encontrada:**
`AuthContext.tsx` tenía `{!loading && children}`. Supabase dispara `onAuthStateChange` con `TOKEN_REFRESHED` cada vez que el usuario vuelve a la pestaña, lo que ponía `loading = true` y desmontaba TODA la app.

**Solución implementada:**

#### `client/src/App.tsx`
- `QueryClient` configurado con `refetchOnWindowFocus: false` globalmente y `staleTime: 5 * 60 * 1000`
- `window.history.scrollRestoration = 'manual'` para preservar el scroll
- Flags `future` de React Router v7 añadidas para compatibilidad

#### `client/src/hooks/useUrlState.ts` _(archivo nuevo)_
- Hook personalizado que sincroniza estado local con query params de la URL
- Usa `useSearchParams` de react-router-dom con `replace: true`
- Permite que tabs, filtros y año sobrevivan un refresh de token

#### Componentes migrados a `useUrlState`:
| Componente | Parámetros en URL |
|---|---|
| `PLMatrix.tsx` | `?tab=Real&year=2026` |
| `DepartmentPL.tsx` | `?tab=Dashboard&year=2026` |
| `Dashboard.tsx` | `?tab=general&depts=main&period=annual&month=3&quarter=1` |
| `CommissionsIndex.tsx` | `?tab=dashboard` |

#### `client/src/context/AuthContext.tsx`
- Añadido `useRef` (`initialLoadDone`) para diferenciar carga inicial de token refreshes
- En carga inicial: muestra loader y bloquea children
- En `TOKEN_REFRESHED`: NO bloquea children — la app sigue montada con su estado intacto

#### `PLMatrix.tsx` y `DepartmentPL.tsx`
- Eliminados todos los `refetchOnWindowFocus: true` y `staleTime: 0` explícitos (sobreescribían el global)
- `useEffect` de `cellValues` usa `useRef` para evitar resets innecesarios cuando llega el mismo año/tipo

**Resultado:**
- ✅ Vista activa (tab) preservada
- ✅ Filtros y año preservados
- ✅ Posición del scroll preservada
- ✅ Formularios abiertos no se pierden al cambiar de pestaña
- ✅ Datos se actualizan en background cada 5 min sin resetear la UI

---

### 2026-04-17 — Feature: Tipo "Proveedor" + Moneda COP en módulo Payments

**Motivo:** Faltaba el tipo `Proveedor` en el formulario de Beneficiarios y la moneda Pesos Colombianos (COP) para pagos a trabajadores en Colombia.

#### Archivos modificados:

**`client/src/lib/api/payments.ts`**
- `Beneficiary.type`: añadido `'proveedor'` al union type
- `Payment.currency`: añadido `'COP'` al union type
- `CreateBeneficiaryDTO.type`: añadido `'proveedor'`

**`client/src/features/payments/Payments.tsx`**
- `BENEFICIARY_TYPES`: añadido `{ value: 'proveedor', label: 'Proveedor' }`
- Form "Nuevo Beneficiario" → select Tipo: ahora incluye opción "Proveedor"
- Form "Nuevo Pago" → select Moneda: añadida opción "COP ($)"
- `emptyPaymentForm.currency`: tipo actualizado a `'EUR' | 'USD' | 'COP'`
- `useMemo` de totales: añadidas variables `pagadoCOP` y `pendienteCOP`
- Summary bar: muestra totales en COP cuando hay pagos en esa moneda
- Tabla: nueva columna "Total COP" (color naranja), `colSpan` actualizado de 14 a 15

**`database/payments_module.sql`**
- CHECK constraint de `beneficiaries.type` actualizado para incluir `'proveedor'`
- Añadido bloque de migración comentado para tablas ya existentes en Supabase

#### ⚠️ SQL ejecutado en Supabase:
```sql
ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_type_check;
ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_type_check
    CHECK (type IN ('equipo', 'influencer', 'comisiones', 'transfer', 'piso_yure', 'proveedor'));
```
> La columna `currency` en `payments` es `VARCHAR(3)` sin CHECK constraint — acepta COP sin cambios de BD.

**Archivo SQL guardado en:** `database/migrations/add_proveedor_cop_payments.sql`

---

### 2026-04-17 — Config: API Key de Holded en `.env`

**Motivo:** El servicio de integraciones (`integrations.js`) usa `process.env.HOLDED_API_KEY` pero el parámetro no existía en el `.env` raíz.

**Cambio en `.env`:**
```
# Holded Integration
HOLDED_API_KEY=ae0b566c9974ec3b4851f59cca1f3fac
```

**Archivo que lo consume:** `services/admin-service/src/routes/integrations.js` (líneas 11 y 44) — ya leía exactamente `process.env.HOLDED_API_KEY`, funciona sin más cambios tras reiniciar el servicio.

---

### 2026-04-17 — Feature: Sistema de Historial de Cambios (Change Log por módulo)

**Objetivo:** Control de versiones por módulo similar a Google Sheets — quién cambió qué, cuándo y desde qué módulo. Completamente no-invasivo.

#### Principios de diseño
- **Fire-and-forget:** todos los logs usan `.catch(() => {})` — si el log falla, la operación principal no se ve afectada en absoluto
- **Tabla nueva `change_log`:** separada de `audit_log` y de cualquier tabla existente
- **JWT decode sin llamada extra:** el email del usuario se extrae del Bearer token en el backend sin una query adicional a Supabase
- **Lazy loading en frontend:** el panel solo carga datos cuando el usuario lo abre

#### SQL ejecutado en Supabase
Archivo: `database/change_log.sql`
```sql
CREATE TABLE IF NOT EXISTS change_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_name     VARCHAR(50)  NOT NULL,
    table_name      VARCHAR(100) NOT NULL,
    record_id       TEXT,
    record_label    TEXT,
    operation       VARCHAR(20)  NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    field_name      TEXT,
    old_value       TEXT,
    new_value       TEXT,
    changed_by_id   UUID,
    changed_by_email TEXT,
    changed_at      TIMESTAMPTZ  DEFAULT NOW()
);
-- + índices + RLS (SELECT autenticados, INSERT siempre permitido)
```

#### Archivos nuevos creados

| Archivo | Descripción |
|---|---|
| `database/change_log.sql` | Migración SQL ejecutada en Supabase |
| `services/admin-service/src/utils/changeLogger.js` | `extractUser(req)` + `logChange(supabase, opts)` |
| `services/admin-service/src/routes/changelog.js` | `GET /changelog?module=X&limit=50&offset=0` |
| `services/commissions-service/src/utils/changeLogger.js` | Copia para el commissions-service (servicio separado) |
| `client/src/lib/api/changelog.ts` | API client tipado (`changelogApi.getChanges()`) |
| `client/src/components/ui/ChangeLogPanel.tsx` | Panel colapsable con timeline, badges de color y paginación |

#### Archivos modificados (solo adiciones, nada eliminado)

**Backend — admin-service:**
| Archivo | Cambio |
|---|---|
| `src/index.js` | +2 líneas: `import changelogRoutes` + `app.use('/changelog', ...)` |
| `src/routes/media.js` | Import + log en `POST /planned` y `POST /platform` |
| `src/routes/payments.js` | Import + log en CRUD completo de pagos y beneficiarios (6 puntos) |
| `src/routes/billing.js` | Import + log en `POST /matrix/save` |
| `src/routes/pl.js` | Import + log en `POST /matrix/save` |

**Backend — commissions-service:**
| Archivo | Cambio |
|---|---|
| `src/routes/partners.js` | Import + log en crear/editar/borrar/pagar comisión (4 puntos) |

**Frontend:**
| Archivo | Cambio |
|---|---|
| `features/media-investment/MediaTracker.tsx` | Import + `<ChangeLogPanel module="media" />` al final |
| `features/payments/Payments.tsx` | Import + `<ChangeLogPanel module="payments" />` al final |
| `features/billing/BillingMatrix.tsx` | Import + `<ChangeLogPanel module="billing" />` al final |
| `features/pl/PLMatrix.tsx` | Import + `<ChangeLogPanel module="pl" />` al final |
| `features/commissions/CommissionsIndex.tsx` | Import + `<ChangeLogPanel module="commissions" />` al final |

#### Módulos con Historial de Cambios activo

| Módulo | Panel UI | Backend captura |
|---|---|---|
| ✅ Media Investment | `MediaTracker.tsx` | Inversión planificada + real por plataforma |
| ✅ Payments | `Payments.tsx` | CRUD pagos + CRUD beneficiarios |
| ✅ Billing Matrix | `BillingMatrix.tsx` | Cada celda guardada en la matriz |
| ✅ P&L Matrix | `PLMatrix.tsx` | Cada celda guardada (Real y Budget) |
| ✅ Commissions | `CommissionsIndex.tsx` | Crear / editar / borrar / pagar comisión |

#### Cómo extender a otros módulos en el futuro
1. En el backend: añadir `import { logChange, extractUser } from '../utils/changeLogger.js'` y una llamada `.catch(() => {})` después de cada mutación exitosa
2. En el frontend: añadir `<ChangeLogPanel module="nombre_modulo" />` al final del componente principal

---

### 2026-04-17 — Fix: Bugs en el Historial de Cambios (Billing Matrix y P&L)

**Problema reportado por el usuario:**
1. Nuevos registros aparecían con etiqueta **"Editado"** en vez de "Creado"
2. Entradas **duplicadas sin detalles** al guardar comentarios en una celda que ya tenía valor
3. Celdas eliminadas (valor borrado) seguían apareciendo como **"Editado"** en vez de "Eliminado"

**Causa raíz:**
- `billing.js` y `pl.js` tenían `operation: 'update'` hardcodeado sin detectar create/update/delete
- El log en `billing.js` estaba fuera de la rama `service_amount`, por lo que se disparaba también para guardados de metadata/comentario (sin cambio de valor real), generando entradas duplicadas sin detalles
- No se capturaba el `oldValue` (valor anterior), por lo que las entradas no mostraban el cambio

**Fix en `services/admin-service/src/routes/billing.js`:**
- Select de `billing_details` cambiado a incluir `amount` (para comparar valor anterior)
- Log movido **dentro** de la rama `service_amount` (ya no se dispara para header metadata)
- Lógica de detección de operación:
  - `isEmptyValue && !hasComment && existingDetail` → `'delete'`
  - `!existingDetail && !isEmptyValue` → `'create'`
  - `existingDetail && !isEmptyValue && valorCambiado` → `'update'`
  - Mismo valor (solo cambió comentario) → **no se loguea**
- `recordLabel` ahora usa `service.name` en vez del UUID de cliente
- `oldValue` correctamente capturado desde `existingDetail.amount`

**Fix en `services/admin-service/src/routes/pl.js`:**
- Select de `budget_lines` ampliado para incluir las 12 columnas de mes (`m01`–`m12`)
- Select de `actual_expenses` ampliado para incluir `amount`
- Select de `actual_revenue` ampliado para incluir `amount`
- Variables de log (`_plLogOp`, `_plOldVal`, `_plRecordId`, `_plLogTable`) declaradas antes del `if (type === 'budget')`
- Cada rama (budget / real expenses) asigna la operación correcta (`'create'` o `'update'`) usando las variables `existingLine` / `existingExp` ya disponibles
- Log para **ingresos reales** (`actual_revenue`) agregado antes del early return — antes nunca se logueaba
- Log final envuelto en `if (_plLogOp)` — no se dispara para rutas que no corresponden

**Resultado:**
- ✅ Nuevos registros muestran "Creado"
- ✅ Actualizaciones muestran "Editado" con valor anterior y nuevo
- ✅ Celdas borradas muestran "Eliminado"
- ✅ Guardados de solo-comentario ya no generan entradas duplicadas
- ✅ Ingresos reales en P&L ahora también quedan registrados

---

### 2026-04-17 — UX: Auto-refresh del Historial de Cambios

**Problema:** El panel de historial no se actualizaba solo — había que hacer click en el botón Actualizar para ver los cambios recién guardados.

**Causa:** `staleTime: 60_000` impedía refetch hasta pasado 1 minuto, y no había polling activo.

**Fix en `client/src/components/ui/ChangeLogPanel.tsx`:**
- `staleTime: 0` — al abrir el panel siempre trae datos frescos
- `refetchInterval: open ? 20_000 : false` — mientras el panel está abierto, se refresca automáticamente cada 20 segundos; cuando está cerrado, no hace ninguna petición
- Indicador "act. hace X" en el header del panel (visible en pantallas ≥ sm) para que el usuario sepa cuándo fue la última actualización

---

### 2026-04-17 — Feature: Ocultar filas de clientes en Media Investment

**Objetivo:** Poder ocultar visualmente filas de clientes que ya no están activos, sin eliminar sus datos históricos, sin afectar meses anteriores y sin romper la conexión con Billing Matrix.

#### ⚠️ SQL a ejecutar en Supabase (una sola vez):
```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hidden_from_yyyymm INT NULL;
```
> El campo almacena el mes absoluto a partir del cual el cliente queda oculto.

**Archivo SQL guardado en:** `database/migrations/add_hidden_from_clients.sql`
> Ej: `202604` = oculto desde Abril 2026 en adelante. Meses anteriores siguen mostrando el cliente con sus datos intactos.

#### Archivos modificados:

**`services/admin-service/src/routes/media.js`**
- GET /media/investment: select de `clients` ahora incluye `hidden_from_yyyymm`; se filtra con `visibleClients = clients.filter(c => !c.hidden_from_yyyymm || c.hidden_from_yyyymm > yyyymm)`
- Nuevo endpoint `POST /media/hide-client` — recibe `{client_id, fiscal_year, fiscal_month}`, calcula `yyyymm = year*100+month`, actualiza `clients.hidden_from_yyyymm`. Log fire-and-forget incluido.

**`client/src/lib/api/media.ts`**
- Añadido `mediaApi.hideClient({ client_id, fiscal_year, fiscal_month })`

**`client/src/features/media-investment/MediaTracker.tsx`**
- `MONTH_NAMES` extraído a constante de módulo (antes estaba duplicado dentro de `handleExportCSV`)
- `EyeOff` añadido a imports de lucide
- Estado `hideConfirm: { client_id, client_name } | null` para controlar el diálogo
- `hideClientMutation` — llama a `mediaApi.hideClient`, invalida query, muestra toast de éxito
- `<tr>` de cada fila tiene clase `group` para activar el hover del botón
- Celda de nombre del cliente: añadido botón `EyeOff` que aparece al hacer hover (opacidad 0 → 1)
- Diálogo de confirmación modal: muestra nombre del cliente y mes/año, botones Cancelar y "Ocultar en meses posteriores"

#### Comportamiento:
- Al hacer hover sobre una fila aparece el icono ojo-tachado (🚫👁) en el nombre del cliente
- Al hacer clic: aparece el diálogo de confirmación con el nombre del cliente y el mes/año actual
- Al confirmar: el cliente desaparece de ese mes y todos los posteriores; los meses anteriores siguen sin cambios
- Los datos (inversiones, plataformas) se conservan 100% en la base de datos
- ✅ Billing Matrix también implementado (ver entrada siguiente)

#### Cómo re-activar un cliente oculto:
- Desde la UI: aparece automáticamente un banner ámbar encima de la tabla cuando hay clientes ocultos en ese período. Al expandirlo, se muestra el nombre de cada cliente oculto, desde qué mes/año está oculto, y un botón "Mostrar" para reactivarlo.
- Desde Supabase (emergencia): `UPDATE clients SET hidden_from_yyyymm = NULL WHERE id = '...'`

---

### 2026-04-17 — Feature: Banner de clientes ocultos + Reactivación en Media Investment

**Objetivo:** El usuario debe saber cuándo hay filas ocultas en el período que está viendo y poder reactivarlas sin salir del módulo.

#### Nuevos endpoints en `services/admin-service/src/routes/media.js`:

**`GET /media/hidden-clients/:year/:month`**
- Consulta `clients` con `hidden_from_yyyymm IS NOT NULL AND hidden_from_yyyymm <= yyyymm`
- Devuelve `{ hidden: [{ id, name, hidden_from_yyyymm }] }`

**`POST /media/unhide-client`**
- Recibe `{ client_id }`
- Hace `UPDATE clients SET hidden_from_yyyymm = NULL WHERE id = client_id`
- Log fire-and-forget incluido

#### Nuevos métodos en `client/src/lib/api/media.ts`:
- `mediaApi.getHiddenClients(year, month)`
- `mediaApi.unhideClient({ client_id })`

#### Cambios en `client/src/features/media-investment/MediaTracker.tsx`:
- Imports: `Eye, ChevronDown, ChevronUp` añadidos
- Estado `hiddenPanelOpen: boolean`
- Query `['media-hidden-clients', year, month]` — se ejecuta siempre, `staleTime: 30s`
- `unhideClientMutation` — llama `mediaApi.unhideClient`, invalida ambas queries, muestra toast
- `hideClientMutation` ahora también invalida `['media-hidden-clients']` al ocultar
- **Banner ámbar** encima de la tabla: aparece SOLO cuando hay clientes ocultos en el período actual
  - Texto: "X cliente(s) oculto(s) en este período — haz clic para ver cuáles"
  - Al expandir: lista con nombre del cliente, "Oculto desde [Mes] [Año]", botón "Mostrar"
  - Botón "Mostrar" llama a `unhideClientMutation` → el cliente vuelve a aparecer en la tabla

---

### 2026-04-17 — Feature: Ocultar/Mostrar filas en Billing Matrix

**Principio seguido:** cero cambios a la lógica existente. El filtrado de clientes ocultos ocurre DESPUÉS de todos los cálculos de fee, sync con `client_ad_investment`, y upserts de `monthly_billing` — ningún dato se deja de calcular por estar oculto.

#### Cambios en `services/admin-service/src/routes/billing.js`
- `GET /matrix`: select de `clients` ahora incluye `hidden_from_yyyymm`. Se calcula `yyyymm = year*100+month` y se filtra `visibleClients` **solo para el `matrix.map` final** (la respuesta al frontend). Toda la lógica anterior (fee sync, strategy upserts, missing inserts) permanece intacta sobre `clients` sin filtrar.
- `GET /billing/hidden-clients?year&month`: devuelve clientes asignados a ese año (vía `client_year_assignments`) que tienen `hidden_from_yyyymm <= yyyymm`
- `POST /billing/hide-client`: recibe `{client_id, fiscal_year, fiscal_month}`, actualiza `clients.hidden_from_yyyymm`
- `POST /billing/unhide-client`: recibe `{client_id}`, pone `hidden_from_yyyymm = NULL`

#### Cambios en `client/src/lib/api/admin.ts`
- Añadidos: `adminApi.getHiddenClients(year, month)`, `adminApi.hideClient(...)`, `adminApi.unhideClient(...)`

#### Cambios en `client/src/features/billing/MatrixGrid.tsx`
- Import: `EyeOff` añadido
- Constante `MONTH_NAMES` a nivel de módulo
- Estado `hideConfirm: { client_id, client_name } | null`
- `hideRowMutation`: llama `adminApi.hideClient`, elimina la fila de `localRows` optimísticamente, invalida queries
- Dropdown de cada fila: nueva opción **"Ocultar Fila"** (ámbar, con icono `EyeOff`) entre Duplicar y Eliminar (separadas por `DropdownMenuSeparator`)
- Diálogo de confirmación (z-index 200, sobre todos los modales existentes)

#### Cambios en `client/src/features/billing/BillingMatrix.tsx`
- Imports: `useMutation`, `EyeOff`, `Eye`, `ChevronDown`, `ChevronUp` añadidos
- Constante `MONTH_NAMES` a nivel de módulo
- Estado `hiddenPanelOpen: boolean`
- Query `['billing-hidden-clients', year, month]` con `staleTime: 30s`
- `unhideClientMutation`: llama `adminApi.unhideClient`, invalida ambas queries
- **Banner ámbar** idéntico al de Media Investment: aparece sobre la tabla solo cuando hay clientes ocultos en el período actual, con lista expandible y botón "Mostrar" por cliente

#### Garantías de integridad
- P&L Matrix no se ve afectado: lee de `monthly_billing` directamente, no de `clients`
- Los fees, totales y datos históricos de clientes ocultos siguen actualizándose en BD
- Hiding/unhiding desde Billing afecta también Media Investment (misma columna `clients.hidden_from_yyyymm`) — comportamiento correcto: si un cliente ya no trabaja, desaparece de ambos módulos

---

## Pendientes
- Verificar en producción que los fixes del historial de cambios (Creado/Editado/Eliminado) funcionan correctamente
- Considerar añadir opción de ocultar/mostrar clientes también en P&L Matrix si el usuario lo requiere

---

## Notas
- El archivo `.env` NO está commiteado en git (está en `.gitignore`). Las credenciales se comparten por canal seguro.
- La tabla `change_log` fue creada directamente en Supabase. Si se recrea la base de datos, ejecutar `database/change_log.sql`.
- El commissions-service tiene su propia copia de `changeLogger.js` porque es un proceso Node.js independiente (puerto 3012) con su propio árbol de imports.

---

### 2026-04-25 — Integración Departamento Imsales

**Objetivo:**
Integrar "Imsales" como departamento completo con funcionalidad de facturación propia, equivalente a los departamentos existentes (Immedia, Imcontent, Immoralia).

**Progreso de implementación:**
- ✅ SQL en Supabase (vertical Imsales, servicio Setup Inicial IMS)
- ✅ `MatrixGrid.tsx` (columnas Imsales + header emerald)
- ✅ `ImsalesBilling.tsx` (módulo Billing Imsales completo)
- ✅ `imsales.js` (backend - endpoints: services, billing, save, hide, unhide, hidden)
- ✅ `imsales.ts` (API client)
- ✅ `pl.js` (serviceMapping + P&L summary Imsales)
- ✅ `constants.ts` (IMSALES type, colores, NAV_ITEMS, ALL_MODULES)
- ✅ `DepartmentPL.tsx` (DEPT_MAP + REVENUE_STRUCTURE)
- ✅ `Dashboard.tsx` (DEPT_ROUTE_MAP)
- ✅ `UserManagement.tsx` (DEPT_OPTIONS)
- ✅ `App.tsx` (ruta /imsales-billing)
- ✅ `index.js` (backend - registrar ruta /imsales)
- ✅ `Sidebar.tsx` (icono ShoppingCart para Billing Imsales)
- ✅ Removido botón Export CSV de `ImsalesBilling.tsx`

---

### 2026-04-27 — Feature: Columna "Otras Comisiones" en Billing Matrix (Immoral) enlazada a P&L

**Problema:**
La fila `Inmoral → Otras comisiones` en P&L Matrix (sección INGRESOS) existía en la estructura pero siempre mostraba ceros porque no había ningún servicio de Billing Matrix mapeado a ella. Era imposible introducir datos.

**Causa raíz:**
El `serviceMapping` en `pl.js` no tenía ninguna entrada que apuntara a `'Otras comisiones'`. En Billing Matrix tampoco existía columna alguna para ese concepto en el bloque Immoral.

**Solución implementada:**

#### `database/migrations/add_immoral_commissions_service.sql` _(archivo nuevo)_
- INSERT de nuevo servicio `IMMORAL_COMMISSIONS` ("Otras Comisiones") en dept IMMORAL con `display_order = 30`
- INSERT en `service_year_assignments` para años 2025 y 2026 (`ON CONFLICT DO NOTHING` — idempotente)

#### `client/src/features/billing/MatrixGrid.tsx`
- Añadida variable `otrasComisionesSvc = getSvc('IMMORAL_COMMISSIONS')`
- Incluida al final de `immoralSvcsWithHoras` (después de Horas/Otros, antes de Imsales)
- El colSpan del header Immoral se actualiza solo (ya usaba `immoralSvcsWithHoras.length`)
- Si el servicio no está en BD, no aparece la columna (seguro / zero-break)

#### `services/admin-service/src/routes/pl.js`
- Añadida entrada `'IMMORAL_COMMISSIONS': 'Otras comisiones'` en `serviceMapping` (línea 550)
- Los `billing_details` con ese código de servicio ya se acumulan automáticamente en `revenueData['Otras comisiones']`

#### `client/src/features/pl/PLMatrix.tsx`
- Sin cambios — la fila `{ dept: 'Immoral', services: ['Otros servicios', 'Otras comisiones'] }` ya existía

#### ⚠️ SQL a ejecutar en Supabase (una sola vez):
```sql
-- Ejecutar el contenido de: database/migrations/add_immoral_commissions_service.sql
```

**Flujo resultante:**
1. Usuario escribe importe en columna "Otras Comisiones" de una fila Immoral en Billing Matrix
2. Se guarda en `billing_details` con `service_id` del servicio `IMMORAL_COMMISSIONS`
3. P&L Real lee `billing_details`, el mapping traduce el código a `'Otras comisiones'`
4. La fila `Inmoral → Otras comisiones` en P&L muestra el valor acumulado por mes
