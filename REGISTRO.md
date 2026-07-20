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

---

### 2026-04-27 — Feature: Columna "Budget Influencer y Paid" en Billing Matrix (Imcontent) enlazada a P&L "Budget Nutfruit"

**Problema (idéntico al anterior, mismo patrón):**
La fila `Imcontent → Budget Nutfruit` en P&L Matrix (sección INGRESOS) existía en la estructura pero siempre mostraba ceros porque no había ningún servicio de Billing Matrix mapeado a ella.

**Solución implementada (mismo patrón que `IMMORAL_COMMISSIONS`):**

#### `database/migrations/add_budget_influencer_paid_service.sql` _(archivo nuevo)_
- INSERT de nuevo servicio `BUDGET_INFLUENCER_PAID` ("Budget Influencer y Paid") en dept IMCONT con `display_order = 55` (entre INFLUENCER_UGC=50 y CONTENT_SETUP=60)
- INSERT en `service_year_assignments` para años 2025 y 2026 (idempotente)

#### `client/src/features/billing/MatrixGrid.tsx`
- Añadido `getSvc('BUDGET_INFLUENCER_PAID')` al array `imcontentSvcs`, justo después de `INFLUENCER_UGC`
- El colSpan del header Imcontent se actualiza solo (ya usaba `imcontentSvcs.length`)
- Si el servicio no está en BD, no aparece la columna (seguro / zero-break)

#### `services/admin-service/src/routes/pl.js`
- Añadida entrada `'BUDGET_INFLUENCER_PAID': 'Budget Nutfruit'` en `serviceMapping` (después de `INFLUENCER_UGC`)
- `revenueData['Budget Nutfruit']` ya estaba inicializado (línea 490) — sin cambios adicionales

#### `client/src/features/pl/PLMatrix.tsx`
- Sin cambios — la fila `{ dept: 'Imcontent', services: ['Budget Nutfruit'] }` ya existía

#### ⚠️ SQL a ejecutar en Supabase (una sola vez):
```sql
-- Ejecutar el contenido de: database/migrations/add_budget_influencer_paid_service.sql
```

**Flujo resultante:**
1. Usuario escribe importe en columna "Budget Influencer y Paid" de una fila Imcontent en Billing Matrix
2. Se guarda en `billing_details` con `service_id` del servicio `BUDGET_INFLUENCER_PAID`
3. P&L Real lee `billing_details`, el mapping traduce el código a `'Budget Nutfruit'`
4. La fila `Imcontent → Budget Nutfruit` en P&L muestra el valor acumulado por mes

---

### 2026-04-27 — Fix: Lógica de colores invertida en tabla Comparación de DepartmentPL

**Problema reportado:**
En la pestaña "Comparación" de cada departamento, los gastos se mostraban con colores invertidos: cuando el real estaba por debajo del presupuesto (situación buena) se pintaba en rojo, y cuando se sobrepasaba el presupuesto (situación mala) se pintaba en verde.

**Causa raíz:**
En `client/src/features/dashboard/DepartmentPL.tsx`, la función `renderCompRow` (líneas 749-772 antes del fix) se reutilizaba para INGRESOS, GROUP cost, GASTOS TOTALES y EBITDA, pero aplicaba la misma regla a todas:
- `diff > 0 → verde` y `diff < 0 → rojo`

Eso es correcto para ingresos y EBITDA (más = mejor), pero está invertido para gastos (más gasto que el presupuestado = malo).

**Solución implementada:**

#### `client/src/features/dashboard/DepartmentPL.tsx`
- `renderCompRow` ahora acepta un séptimo parámetro `isExpense: boolean = false`
- Helper interno `colorFor(v)` decide el color según el tipo de fila:
  - `isExpense = false` (ingresos / EBITDA): `v > 0 → verde`, `v < 0 → rojo`
  - `isExpense = true` (gastos): `v < 0 → verde`, `v > 0 → rojo`
- El total anual (columna derecha) usa la misma lógica para ser coherente

**Llamadas actualizadas:**
| Fila | `isExpense` |
|---|---|
| `INGRESOS` | `false` (default) — real > presup = verde |
| `GROUP (Immoral %)` | `true` — gasto invertido |
| `GASTOS TOTALES` | `true` — gasto invertido |
| `EBITDA` | `false` (default) — real > presup = verde |

**Lo que NO cambia:**
- Los valores numéricos (`real - budget`) son idénticos
- Los cálculos de totales no se tocan
- La pestaña "Dashboard" (cards superiores) ya tenía la lógica correcta y no se tocó (`expOk = ytdExpDiff <= 0`)
- Las pestañas Real / Presupuesto individuales no se tocan
- Los colores fijos del label "Real" (azul), "Presup." (verde) y "Dif." (rojo) se mantienen — solo cambian los colores numéricos de la fila Dif.

---

### 2026-04-27 — Fix: Asimetría en cálculo de Gastos Real vs Presupuesto en Dashboard de departamentos

**Problema reportado:**
En la pestaña "Dashboard" de cada departamento (cards "Rendimiento vs Presupuesto"):
- El card de **Ingresos** comparaba bien Real vs Presupuesto
- El card de **Gastos** mostraba un **Presupuesto incorrecto**: el monto era menor del esperado, no coincidía con el presupuesto total del depto
- El card de **Resultado Neto** estaba mal por consecuencia

**Causa raíz:**
En `client/src/features/dashboard/DepartmentPL.tsx → renderDashboardTab()`, los cálculos de gasto eran asimétricos:

| Variable | Qué incluía |
|---|---|
| `totalExpWithGroup` (Real) | gastos directos **+ Group cost (Immoral %)** ✅ |
| `budgetExpMonthly` (Presup.) | gastos directos del presupuesto **— sin Group cost** ❌ |

Y en el resultado:
- `resultadoMonthly` (Real) restaba `totalExpWithGroup` (con Immoral %)
- `budgetResultadoMonthly` (Presup.) restaba `budgetExpMonthly` (sin Immoral %)

Por eso el "Presupuesto" de Gastos salía bajo (le faltaba la cuota de Group cost) y el resultado neto budget salía inflado falsamente.

La pestaña "Comparación" ya hacía bien el cálculo simétrico usando el helper `calculateGroupCost(valuesMap)` para ambos lados. La pestaña Dashboard simplemente nunca llamaba al equivalente para budget.

**Solución implementada:**

#### `client/src/features/dashboard/DepartmentPL.tsx → renderDashboardTab()`
- Añadida `budgetGroupCostMonthly = calculateGroupCost(compBudgetValues)` justo después de `groupCostMonthly` — reusa el helper que ya existía y se usaba en Comparación
- Añadida `budgetExpWithGroup = budgetExpMonthly + budgetGroupCostMonthly`, simétrico a `totalExpWithGroup`
- `budgetResultadoMonthly` cambia de `budgetRevTotals - budgetExpMonthly` a `budgetRevTotals - budgetExpWithGroup`
- El card de Gastos (`ytdExpBudget`) ahora lee de `budgetExpWithGroup` en vez de `budgetExpMonthly`

**Lo que NO cambia:**
- Los cálculos del lado Real no se tocan
- `budgetExpMonthly` (sin group cost) sigue existiendo como variable intermedia
- La pestaña "Comparación" no se toca (ya era correcta)
- Las pestañas Real / Presupuesto individuales no se tocan
- Los departamentos que ya son "Immoral" siguen recibiendo `groupCost = 0` (la helper retorna 0 para `isImmoral`)
- Cálculo de coste/hora, gráficos de evolución, alerta mensual: no se tocan

**Resultado esperado:**
- Card de Gastos del Dashboard muestra ahora el Presupuesto **incluyendo la cuota Immoral %** (igual que el Real)
- Card de Resultado Neto consistente entre Real y Presupuesto
- `expOk` (semáforo del card) refleja correctamente si el real está dentro de presupuesto

---

### 2026-05-08 — Fix: Acumulado YTD del Dashboard de deptos cuenta hasta mes cerrado (no mes actual)

**Problema reportado:**
En el Dashboard de cada departamento, el filtro "Acumulado (YTD)" sumaba desde enero hasta el mes en curso. Como se factura a mes vencido (en mayo se cierra abril), el Real solo tiene datos hasta abril mientras que el Presupuesto cubre todos los meses. Resultado: el YTD comparaba 4 meses de Real contra 5 meses de Presupuesto, marcando siempre desviación negativa falsa en Ingresos, Gastos y Resultado Neto.

**Causa raíz:**
En `client/src/features/dashboard/DepartmentPL.tsx → renderDashboardTab()`:
```js
const currentMonth = new Date().getMonth();   // En mayo = 4
const bannerEndMonth = bannerMonth === 'ytd' ? currentMonth : (bannerMonth as number);
```
Y todas las sumas YTD usan `slice(0, bannerEndMonth + 1)` → en mayo acumulaba meses 0..4 (Ene-May), incluyendo el mes en curso sin datos reales.

**Solución implementada:**

#### `client/src/features/dashboard/DepartmentPL.tsx → renderDashboardTab()`
- Sustituido `currentMonth` por `lastClosedMonth` con lógica year-aware:
  - Año pasado (selectedYear < todayYear): `lastClosedMonth = 11` → todo cerrado
  - Año actual: `lastClosedMonth = todayMonthIdx - 1` → mes anterior
  - Año futuro: `lastClosedMonth = -1` → nada cerrado
- `bannerEndMonth = bannerMonth === 'ytd' ? lastClosedMonth : (bannerMonth as number)` — el selector manual por mes (Ene-Dic) no se ve afectado
- Variable derivada `ytdHasClosedMonths = lastClosedMonth >= 0`

**Fallback UI cuando no hay meses cerrados (enero del año actual o año futuro):**
- Las 3 tarjetas de "Rendimiento vs Presupuesto" se ocultan y aparece el texto **"Sin meses cerrados aún"**
- Los chips mensuales también se ocultan cuando `alertMonths.length === 0`
- El selector mes-a-mes sigue disponible (el usuario puede elegir un mes específico igual)

**Lo que NO cambia:**
- El label del selector sigue siendo "Acumulado (YTD)" — sin texto dinámico extra
- El selector manual por mes (Ene, Feb, …, Dic) funciona idéntico
- Las pestañas Real / Presupuesto / Comparación no se tocan — esas muestran los 12 meses siempre
- Los gráficos (Ventas vs Gastos, evolución, etc.) siguen mostrando los 12 meses
- Para años pasados YTD sigue acumulando los 12 meses como antes
- `Dashboard.tsx` (dashboard general) NO se tocó — no compara budget vs real, no tiene el bug

**Resultado:**
- En mayo el YTD acumula Ene-Abr (4 meses cerrados) tanto en Real como en Presupuesto → comparación justa
- En junio acumulará Ene-May (5 meses) automáticamente, etc.

---

### 2026-05-08 — UX: Etiqueta dinámica de rango en cards YTD del Dashboard de deptos

**Objetivo:**
Cuando el selector está en "Acumulado (YTD)", mostrar al lado de los labels "Real" y "Presupuesto" de cada card el rango que se está acumulando — p.ej. `(de Ene a Abr)` en mayo. Cuando el usuario elige un mes específico (Ene, Feb, …, Dic) la descripción desaparece porque ya no aporta nada.

#### `client/src/features/dashboard/DepartmentPL.tsx`
- Nuevas variables tras `MONTH_SHORT`:
  ```js
  const ytdRangeLabel = !ytdHasClosedMonths ? ''
      : lastClosedMonth === 0 ? MONTH_SHORT[0]
      : `de ${MONTH_SHORT[0]} a ${MONTH_SHORT[lastClosedMonth]}`;
  const showYtdRange = bannerMonth === 'ytd' && !!ytdRangeLabel;
  ```
- En los 3 cards (Ingresos, Gastos, Resultado Neto), las etiquetas `Real` y `Presupuesto` envuelven una `<span>` adicional, condicional a `showYtdRange`, con estilo `text-[10px] text-gray-400 font-normal` para que sea sutil.

**Comportamiento:**
- En mayo 2026 (mes actual) con YTD seleccionado → `Real (de Ene a Abr)`, `Presupuesto (de Ene a Abr)`
- Si solo hay un mes cerrado (p.ej. febrero) → muestra `(Ene)` sin "de ... a ..."
- Al seleccionar un mes individual → desaparece la descripción
- Para año pasado completo → `(de Ene a Dic)` automáticamente
- Para año futuro o enero del año actual → no se muestra nada porque ya está activo el placeholder "Sin meses cerrados aún"

**Lo que NO cambia:**
- Cálculos, colores, totales: ninguno se toca
- El selector "Acumulado (YTD)" sigue con la misma etiqueta
- El módulo Dashboard general no se ve afectado

---

### 2026-05-08 — Config: Imsales exento de allocación Group cost (temporal)

**Objetivo:**
Desactivar temporalmente la allocación de Group cost (Immoral %) para el departamento Imsales en `DepartmentPL.tsx`. La intención es reactivarla en el futuro, así que se mantiene la estructura de filas en el código.

**Cambio en `client/src/features/dashboard/DepartmentPL.tsx`:**
- Nueva constante `isGroupCostExempt` justo después de definir `deptNames`:
  ```js
  // Departamentos sin allocación de Group cost (Immoral %).
  // 'Imsales' está temporalmente exento — para reactivarlo, quitar 'Imsales' de esta línea.
  const isGroupCostExempt = deptNames.includes('Immoral') || deptNames.includes('Imsales');
  ```
- 4 ocurrencias previas de `isImmoral` / `deptNames.includes('Immoral')` reemplazadas por `isGroupCostExempt`:
  - Helper `calculateGroupCost` (línea ~575)
  - `groupCostMonthly` en `renderDashboardTab` (línea ~858)
  - Condicional fila "GROUP" en pestaña Comparación (línea ~803)
  - Condicional fila "Group (Immoral %)" en pestañas Real/Presupuesto (línea ~1798)

**Resultado en la vista de Imsales:**
- Pestaña Dashboard: la fila "Gastos Generales (Group)" se ve con 0 € (la fila Group % sigue visible mostrando la % real del depto)
- Pestaña Comparación: la fila GROUP se oculta entera (como ya ocurría con Immoral)
- Pestañas Real / Presupuesto: la fila Group (Immoral %) se oculta entera
- Los totales de Gastos y EBITDA ya no incluyen la cuota Immoral % para Imsales

**Reactivar Imsales en el futuro:** quitar `|| deptNames.includes('Imsales')` de la línea 131 — ningún otro cambio necesario.

**Pendiente de decisión:**
`Dashboard.tsx` (dashboard general) tiene lógica de Group cost equivalente en las tarjetas de depto (líneas 528-529, 850-851, 892). NO se ha tocado aún — esperar confirmación del usuario para extender allí también la exención de Imsales.

---

### 2026-05-08 — Fix + UX: Chips "Detalle por mes" — meses sin Real se muestran en estilo neutral

**Problema reportado:**
En la sección "Detalle por mes (resultado neto vs presupuesto)" del Dashboard de cada depto, las chips aparecían en rojo para meses sin Real registrado, mostrando una "desviación" engañosa (`0 - Presupuesto = -Presupuesto`). Iteración inicial: ocultar las chips de esos meses → se perdía continuidad visual (saltos en la secuencia de meses). Iteración final: mostrar **todas** las chips del rango, pero los meses sin Real en estilo neutral con etiqueta "sin actividad".

**Causa raíz:**
El loop que construye `alertMonths` no diferenciaba meses con datos Real de meses sin ellos. Para un mes sin datos, calculaba `diff = -budgetRes` (siempre negativo, siempre rojo).

**Solución final:**

#### `client/src/features/dashboard/DepartmentPL.tsx`
1. Cada `alertMonth` ahora incluye un flag `hasRealData: boolean`:
   ```js
   const hasRealData = (revTotals[i] || 0) > 0 || (totalExpWithGroup[i] || 0) > 0;
   ```
2. El render de las chips bifurca según `hasRealData`:
   - **Con Real** → chip verde/roja existente con icono, mes y diff
   - **Sin Real** → chip gris neutral con solo el mes y el texto "sin actividad" en cursiva (sin icono ni valor numérico)
3. Tooltip de chips neutrales: "Sin Real registrado en este mes"

**Comportamiento resultante:**
- Se ve la secuencia completa del rango YTD (p.ej. Ene-Abr en mayo) sin huecos
- Los meses con Real registrado se ven en verde o rojo según comparación con presupuesto
- Los meses sin Real se ven en gris con "sin actividad" — claramente diferenciados, no confunden con desviación negativa
- Si todos los meses están sin datos → la sección entera se sigue ocultando (gracias al `alertMonths.length > 0 && (...)`)

**Criterio "con Real registrado":** ingresos reales > 0 **o** gastos reales > 0. Cubre tanto depts que facturan como los que solo tienen costes.

**Lo que NO cambia:**
- Cálculos de las 3 tarjetas grandes (Rendimiento vs Presupuesto): se mantienen
- Lógica del YTD (acumulado hasta mes cerrado): se mantiene
- Pestañas Real / Presupuesto / Comparación: no se ven afectadas

---

## Resumen sesión 2026-04-27

| # | Tipo | Cambio | Archivos | SQL pendiente |
|---|---|---|---|---|
| 1 | Feature | Columna "Otras Comisiones" en Billing Matrix (Immoral) → fila P&L "Otras comisiones" | MatrixGrid.tsx, pl.js | `add_immoral_commissions_service.sql` |
| 2 | Feature | Columna "Budget Influencer y Paid" en Billing Matrix (Imcontent) → fila P&L "Budget Nutfruit" | MatrixGrid.tsx, pl.js | `add_budget_influencer_paid_service.sql` |
| 3 | Fix | Lógica de colores invertida en tabla Comparación de DepartmentPL (gastos pintaban al revés) | DepartmentPL.tsx | — |
| 4 | Fix | Asimetría en Gastos Real vs Presupuesto del Dashboard de departamentos (faltaba Group cost en budget) | DepartmentPL.tsx | — |

⚠️ **2 SQL por ejecutar en Supabase** (en `database/migrations/`):
1. `add_immoral_commissions_service.sql`
2. `add_budget_influencer_paid_service.sql`

---

---

## Sesión 2026-06-16 — Rentabilidad por Cuenta: horas manuales, buscador, evolución anual, tiempo real

**Rama:** `fix/rentabilidadxcuentas` (no se ha tocado `main`)

### Contexto del problema original
El dashboard de ClickUp mostraba para Ángela Navarro mayo 2026 `60:28:01` (60.47 h) pero la app marcaba `58.3 h`. Las 2 entries que faltaban eran de **Alba Ortega** y **Leidy Puentes Gómez**, ambas **usuarias desactivadas** en ClickUp — sus IDs no aparecen ya en `/team/{id}.members` ni en `/list/{id}/member`, y `?assignee=<uid>` con sus IDs históricos tampoco devuelve nada con el token actual. Después de probar varias vías (location sweep, IDs históricos en `profitability_user_mappings`, etc.) decidimos NO depender de ClickUp para esos casos y abrir un camino de **horas manuales**.

### Cambios funcionales

| # | Tipo | Cambio | Archivos clave |
|---|---|---|---|
| 1 | Feature | **Personas manuales y horas por cliente×mes**. Tabla nueva en Supabase: `profitability_manual_persons` (id, name, cost_per_hour override, dept, notas) y `profitability_manual_hours` (client_id, manual_person_id, year, month, hours, UNIQUE). El coste/h se resuelve por P&L si el nombre matchea una categoría; si no, se usa el override. Aparece en el desglose del modal mensual como una persona más con `source: 'manual-pl'` o `'manual'`. | `services/admin-service/src/routes/profitability.js` (endpoints CRUD + paso 8b de `/accounts/:year`), `client/src/features/profitability/Profitability.tsx` (TeamModal con + Añadir horas manuales), `client/src/features/profitability/ProfitabilitySetup.tsx` (ManualPersonsSection) |
| 2 | Feature | **Buscador + ordenación + ocultar cuentas** en la vista principal y en cada bloque de Configurar. Buscador por nombre. Ordenación: alfabético (default), rentabilidad, horas, fee, asc/desc. Ocultar/mostrar via botón "Ocultos (N)" que abre un dropdown con los items ocultos y "Mostrar" por cada uno. Tabla nueva `profitability_hidden_items (scope, ref_id)` genérica para 3 scopes: `client`, `clickup_user`, `manual_person`. | `Profitability.tsx`, `ProfitabilitySetup.tsx` (hook `useHiddenSet` + `HiddenDropdown` reutilizable), `services/admin-service/src/routes/profitability.js` (endpoints `/hidden-items`) |
| 3 | Feature | **Evolución anual por cuenta**. En modo Anual, click en el icono TrendingUp de la fila abre un modal con 3 mini-gráficas SVG independientes (Horas verde, Coste rojo, Beneficio índigo con área), cada una con línea de tendencia (regresión lineal) y badge "al alza/baja/estable". Hover muestra valor del mes. Click en mes con horas abre el TeamModal de ese mes. Tabla bajo las gráficas con Mes/Fee/Horas/Coste/Beneficio/Margen. | `Profitability.tsx` (`AnnualEvolutionModal`, `MetricChart`) |
| 4 | Fix | **months_active correcto**: contador literal de meses con sueldo > 0 (sin rellenar huecos ni proyectar). Si Julian sólo tiene mayo → 1 mes; al añadir junio → 2 meses; persona con enero+febrero+abril sin marzo → 3 meses, no 4. | `services/admin-service/src/routes/profitability.js` (`computeRealCostPerPerson`) |
| 5 | Fix | **Sincronía cross-feature en tiempo real**. Todas las queries del módulo con `staleTime: 0`, `refetchOnWindowFocus: true`, `refetchOnMount: 'always'` y `placeholderData: keepPreviousData`. Al editar P&L y volver a Rentabilidad, los datos se actualizan solos sin recargar. Optimistic update en horas manuales (`setQueryData` directo) y en hide/unhide (`onMutate` + rollback). | `Profitability.tsx`, `ProfitabilitySetup.tsx` |
| 6 | Fix | **Cálculo €/h y desglose en Configurar > Personas manuales**. La sección ahora muestra Match P&L + Depto + €/h con su fórmula sueldo_anual ÷ (160h × meses) + Fuente (matched/override/sin coste), igual que la sección de empleados activos arriba. | `ProfitabilitySetup.tsx` (`ManualPersonsSection`), `services/admin-service/src/routes/profitability.js` (`GET /manual-persons?year=`) |
| 7 | Feature | **Changelog**: 3 entradas nuevas (v1.38, v1.39, v1.40) en `client/src/lib/changelog.ts` + iconos `Users`, `Search`, `Zap` añadidos al `ICON_MAP` de `WhatsNew.tsx`. | `client/src/lib/changelog.ts`, `client/src/components/shared/WhatsNew.tsx` |

### Migrations SQL a ejecutar en Supabase

```sql
-- 1. database/migration_profitability_manual.sql
CREATE TABLE IF NOT EXISTS profitability_manual_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cost_per_hour DECIMAL(8,2) NOT NULL DEFAULT 0,
  department TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profitability_manual_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  manual_person_id UUID NOT NULL REFERENCES profitability_manual_persons(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, manual_person_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_pmh_client_year ON profitability_manual_hours(client_id, year);
CREATE INDEX IF NOT EXISTS idx_pmh_person ON profitability_manual_hours(manual_person_id);

-- 2. database/migration_profitability_hidden.sql
CREATE TABLE IF NOT EXISTS profitability_hidden_items (
  scope TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  hidden_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (scope, ref_id)
);
```

### Notas operacionales
- **Para que las horas faltantes de mayo de Ángela aparezcan**: dar de alta a Alba Ortega y Leidy Puentes Gómez en Configurar → Personas manuales (dejando coste/h en 0 → se calcula desde P&L). Luego en el modal de Ángela · Mayo → + Añadir horas manuales → cargar `1.14` y `1.06`.
- **Mismo patrón aplica a cualquier futuro caso**: persona desactivada de ClickUp con horas pasadas no recuperables → meter como persona manual + cargar horas en los meses que hicieron falta.
- **Workers eliminados de ClickUp**: desaparecen de Configurar > Coste por hora (esa tabla viene de `/team/{id}` de ClickUp), pero su coste/h sigue calculándose desde P&L y aplicándose a entries pasadas via name matching. NO se pierde nada.
- **Cuentas eliminadas/archivadas en ClickUp**: el mapeo en `profitability_client_lists` permanece. Las entries históricas (si las hubo) siguen sumando. Si la lista deja de existir, futuros entries=0 y la cuenta aparece con fee y 0 horas, lo cual es correcto.

---

## Pendientes
- Ejecutar en Supabase los 2 SQL de migración listados arriba (sesión 2026-04-27) antes de que las nuevas columnas aparezcan en Billing Matrix
- Ejecutar en Supabase los 2 SQL de migración de la sesión 2026-06-16 (`migration_profitability_manual.sql` y `migration_profitability_hidden.sql`) para que las funcionalidades nuevas de Rentabilidad funcionen
- Verificar en producción que los fixes del historial de cambios (Creado/Editado/Eliminado) funcionan correctamente
- Considerar añadir opción de ocultar/mostrar clientes también en P&L Matrix si el usuario lo requiere
- (Diferido) Permitir asociar cuentas a listas de ClickUp aunque la lista no tenga horas trackeadas este año (caso Bobo Choses)
- Ejecutar `scripts/15_estimated_lines.sql` (tabla `estimated_lines` para Forecast)
- Ejecutar `scripts/16_pl_section_key.sql` (columna `section_key` en `budget_lines` y `estimated_lines` para separar items que comparten nombre entre secciones — ej. David sueldo vs comisión)
- Ejecutar `scripts/17_forecast_scenarios.sql` (tabla `forecast_scenarios` para la biblioteca de escenarios)
- Ejecutar `scripts/18_scenarios_scope.sql` (columna `scope` para separar biblioteca de escenarios Forecast vs Presupuesto)

---

### 2026-06-19 — Feature: Nueva pestaña Forecast (Real Estimado) en P&L Matrix y Departamentos

Pestaña nueva en P&L Matrix y en cada vista de Departamento, totalmente editable e independiente del Presupuesto. Renombrada de "Real Estimado" a **Forecast** poco después de crearla.

**Backend / DB:**
- Nueva tabla `estimated_lines` (espejo exacto de `budget_lines`: mismas columnas mensuales, `cell_metadata`, `annual_total` generado).
- Constraint `view_type` de `pl_cell_notes` expandido con `'estimated'` y `'dept-estimated'`.
- Endpoint `/pl/matrix/:year?type=estimated` lee/escribe en `estimated_lines` (misma lógica que `budget`).
- `POST /pl/matrix/save` con `type=estimated` escribe en `estimated_lines`.
- Migración: `scripts/15_estimated_lines.sql`

**Frontend:**
- `client/src/lib/api/admin.ts`: tipos extendidos con `'estimated'` y `'dept-estimated'`.
- `PLMatrix.tsx`: nueva pestaña **Forecast** entre Comparación y al final del orden de tabs; totalmente editable (mismo `renderEditableCell` que Presupuesto); notas con `view_type='estimated'`.
- `DepartmentPL.tsx`: nueva pestaña **Forecast** read-only; notas con `view_type='dept-estimated'`.
- Modal "¿Qué es Forecast?" accesible desde un icono ⓘ junto al título, con copy explicando la diferencia con Presupuesto.

---

### 2026-06-19 — Fix: Separar items mismo-nombre por sección (David sueldo vs comisión)

**Problema:**
En la pestaña Presupuesto, items que aparecían en más de una sección con el mismo nombre (caso conocido: David en Sueldos y Comisiones de Immoralia) compartían **una sola fila en `budget_lines`** porque la tabla no tenía forma de distinguir si era de sueldo o comisión. Borrar uno borraba el otro. El frontend en parseMatrixData "broadcasteaba" el mismo valor a ambos bloques.

**Causa raíz:**
`budget_lines` y `estimated_lines` no tienen columna que identifique la sección — solo `(fiscal_year, department_id, line_type, expense_category_id)`. David-Immoralia tenía 1 sola fila, no 2.

**Solución:**
- Nueva columna `section_key` (NULLABLE, VARCHAR(50)) en `budget_lines` y `estimated_lines`.
- Backfill SQL con mapeo hardcodeado de (dept, item) → section_key, combinado con `pl_custom_rows`.
- David-Immoralia se duplica como dos filas independientes: una con `section_key='personal'` y otra `'comisiones'`.
- Backend GET agrupa por `${deptName}::${catName}::${sectionKey}` (antes solo por `dept::cat`).
- Backend SAVE filtra por `section_key` en queries y lo incluye al insertar.
- Migración: `scripts/16_pl_section_key.sql`

Previo a esto se hizo una **deduplicación masiva** de `budget_lines` y `estimated_lines` (había hasta 31 filas duplicadas por combinación de saves antiguos) usando `MAX()` por mes para consolidar.

---

### 2026-06-20 — Feature: Escenarios "¿qué pasaría si…?" en Forecast y Presupuesto

Sistema completo de simulación hipotética sobre el P&L sin tocar los datos base.

**Modelo del escenario** (`client/src/features/pl/ForecastScenarios.tsx`):
```ts
{
  name, range: { from, to },
  revenue:  { globalPct, byDept, byItem? },
  expenses: { globalPct, bySection, byDept, bySectionDept?, byItem? }
}
```
- `range`: rango de meses afectados — por defecto desde el mes siguiente al actual hasta diciembre.
- Pasos discretos de **5% en 5%** de **−30% a +30%**.
- Prioridad de multiplicador (más específico gana): `byItem > bySectionDept > byDept > bySection > globalPct`.

**UI** (`ForecastScenariosModal`):
- Panel lateral derecho con presets (Crecimiento, Crisis, Optimización, etc.), rango temporal con chips ("Lo que queda", "Q3", "Q4", "Año completo"), configuración global y por hub/categoría con **drill-down anidado hasta item individual**.
- Botón "Escenarios" en el header de P&L Matrix con badge contador.
- Chip activo en el título con resumen y ✕ para volver a la base.
- Celdas afectadas se pintan en verde (subida) o rosa (bajada), con valor base tachado debajo y delta %.

**Persistencia** (tabla nueva `forecast_scenarios` en DB):
- Columnas: `name`, `scenario` (JSONB), `shared_with_depts` (TEXT[]), `created_by`, `scope` ('forecast' | 'budget'), `created_at`.
- Endpoints: `GET /pl/scenarios?scope=&dept=` · `POST` · `PATCH` · `DELETE`.
- Migración: `scripts/17_forecast_scenarios.sql`

**Separación Forecast vs Presupuesto** (la biblioteca era compartida en v1, corregido):
- Campo `scope` separa las dos bibliotecas.
- Cada pestaña ve solo SUS escenarios para guardar/editar/eliminar.
- Migración: `scripts/18_scenarios_scope.sql`

**Compartir con Hubs:**
- Hubs hardcodeados: Immedia, Imcontent, Immoralia, Imsales.
- Cuando un superadmin marca un escenario como compartido con un hub, el jefe de ese depto ve un banner gradiente al entrar al hub (en cualquier pestaña, no solo Forecast/Presupuesto).
- Dot rojo pulsante en la pestaña correspondiente (Forecast o Presupuesto) indicando dónde está el escenario.
- El jefe de hub solo PUEDE aplicar el escenario (read-only) — no editar, no borrar, no guardar.
- Las celdas del Departamento muestran la misma visualización de escenario que en P&L Matrix (tinte + base tachada + delta %).

**Group Cost reaccionando al escenario** (DepartmentPL):
- Añadida query `getPLMatrix(year, 'estimated')` → `compEstimatedValues`.
- En pestaña Forecast el Group cost se calcula desde datos Forecast (no Real); en Presupuesto desde Budget; en Real desde Real.
- El multiplicador del escenario activo se aplica al cálculo de Total Revenue, Dept Revenue e Immoral Expenses → si sube gastos de Immoral, el Group del hub sube proporcionalmente.

**Onboarding / Avisos:**
- Tour interactivo con spotlight la primera vez que se entra a P&L Matrix (3 pasos: intro + spotlight en Presupuesto + spotlight en Forecast + outro).
- Burbuja "NUEVO" junto al icono ⓘ de Forecast (primera vez).
- Burbuja "NUEVO" junto al botón Escenarios (primera vez).
- Quick guide de 4 pasos dentro del panel Escenarios (primera vez).
- Todo persistido en localStorage con claves versionadas (`_v2`).

---

## Notas
- El archivo `.env` NO está commiteado en git (está en `.gitignore`). Las credenciales se comparten por canal seguro.
- La tabla `change_log` fue creada directamente en Supabase. Si se recrea la base de datos, ejecutar `database/change_log.sql`.
- El commissions-service tiene su propia copia de `changeLogger.js` porque es un proceso Node.js independiente (puerto 3012) con su propio árbol de imports.
- **Patrón "nueva columna en Billing Matrix → fila P&L existente":** crear servicio en BD (`services` + `service_year_assignments`), añadir `getSvc('CODE')` al array del depto en `MatrixGrid.tsx`, y añadir entrada al `serviceMapping` de `pl.js`. La fila destino en P&L ya debe existir en `REVENUE_STRUCTURE` y en `revenueData` (línea 471 de pl.js).
- **Helper `calculateGroupCost(valuesMap)` en DepartmentPL.tsx:** usar siempre que se quiera obtener la cuota de Immoral % de un depto, ya sea para datos Real o Presupuesto. Pasar `compRealValues` o `compBudgetValues` según el caso.

---

### 2026-06-22 — Detalle de facturación en hubs (rama `feat/detallefacturacionhubs`, mergeada a `main`)

**Propósito:** dar visibilidad — solo lectura — de qué clientes y qué montos componen el ingreso de cada hub, sin alterar la lógica existente de Billing Matrix ni de P&L.

#### 1. Nueva pestaña "Facturación" en los hubs

Espejo del Billing Matrix filtrado por hub (Immedia, Imcontent, Immoralia, Imsales). Muestra las mismas filas (clientes) y columnas (servicios) que la pestaña Real del P&L del hub, pero pivotadas: filas = cliente, columnas = servicios del hub, celdas = monto facturado.

- `client/src/features/billing/BillingHubMirror.tsx` _(archivo nuevo)_
  - Filtrado solo a clientes con `total > 0` en el hub, ordenados de mayor a menor.
  - Toggle **Mes / Anual**: en Anual se hace fetch paralelo de los 12 meses (`useQueries`) y se agrega por cliente y servicio.
  - 3 KPI cards: clientes facturados, servicios del hub, total facturación.
  - Exportar **CSV** y **PDF** (`jspdf` + `jspdf-autotable`) con el período y el hub en el nombre del fichero (`Facturacion_<Hub>_<Mes_Año>.{csv|pdf}` o `_Anual_<año>`).
  - Estados vacíos diferenciados (hub no soportado / sin facturación en el período).
  - Sin columna "Vertical" (a petición).

- `client/src/features/billing/hubBillingMap.ts` _(archivo nuevo)_
  - Mapping canónico **P&L hubs → datos Billing Matrix**, idéntico a la lógica del backend en `services/admin-service/src/routes/pl.js` (líneas 588-645).
  - Crítico: NO se puede matchear por nombre de servicio porque:
    - "Paid General" / "Paid imfilms" no son columnas — son `monthly_billing.fee_paid` filtrado por `vertical = 'imfilms'` o no.
    - Los demás se mapean por **service.code** (BRANDING, CONTENT_DESIGN, etc.), no por nombre, ya que existen "Set-up Inicial" en varios departamentos.
  - Estructura:
    ```ts
    HUB_SERVICES = {
      immedia: [Paid General, Paid imfilms, Setup inicial (PAID_MEDIA_SETUP)],
      imcontent: [Branding, Diseño, Contenido con IA, RRSS, Estrategia Digital, Influencers, Diseño de Landing, Budget Nutfruit],
      immoralia: [Setup inicial IA, Automation, Consultoría],
      imsales: [Setup inicial (ims), Captación],
    }
    ```
  - Cada `HubServiceDef` tiene `valueFor(row, columnsByCode) => number` que sabe cómo extraer el monto.

#### 2. Detalle de clientes al clicar montos de ingreso en pestaña Real

- `client/src/features/billing/RevenueCellDetailModal.tsx` _(archivo nuevo)_
  - Se activa solo cuando `activeTab === 'Real'`, `section === 'revenue'` y `value > 0`.
  - Header en gradiente índigo/púrpura/rosa con 3 mini-stats: P&L Real / Billing / Clientes.
  - Tabla: # · Cliente · Importe · % del total (sin columna Vertical).
  - Si el total Billing no coincide con el P&L Real, aviso amarillo con la diferencia.
  - Usa el mismo `hubBillingMap.ts` para resolver clientes/montos.

- En `DepartmentPL.tsx`:
  - `renderReadOnlyCell` añade `onClick` y estilos hover (cursor-pointer + ring índigo) cuando la celda es clicable.
  - Sin colisión con el `onContextMenu` existente (notas).

#### 3. Botón Exportar del header con dropdown CSV/PDF

Antes era un stub sin acción. Ahora aplica a Real, Presupuesto, Forecast y Comparación.

- `DepartmentPL.tsx`:
  - `DropdownMenu` con "Exportar CSV" (icono verde) y "Exportar PDF" (icono rojo).
  - Helpers `buildExportRowsSingle()` y `buildComparisonRows()` reutilizan `getCellValue`, `calculateSectionTotal` y `calculateGroupCost`.
  - PDF landscape A3, cabecera índigo, subtotales en negrita (Ingresos, Gastos, Group cost si aplica, EBITDA).
  - Comparación expande cada concepto en 3 filas: Real / Presupuesto / Diferencia.
  - Nombre fichero: `PL_<hub>_<Tab>_<año>.{csv|pdf}`.
  - El dropdown se oculta en Dashboard, Solicitudes y Facturación (esas pestañas tienen sus propios botones específicos o no aplican).

#### 4. Avisos NUEVO para descubrir las funciones

- `client/src/features/billing/HubsInfoModals.tsx` _(archivo nuevo)_
  - `RealDetailInfoModal`: explica el clic-detalle de ingresos.
  - `FacturacionInfoModal`: explica el espejo del Billing Matrix, el toggle Mes/Anual y el export.
  - Mismo patrón visual que `ForecastInfoModal` (gradiente índigo, emoji, lista de 3-4 puntos).

- En `DepartmentPL.tsx`:
  - Botón `InfoIcon` junto al título cuando `activeTab === 'Real'` o `activeTab === 'Facturación'`, con halo pulsante hasta que se ve por primera vez.
  - `NewFeatureBubble` flotante debajo del título (reutilizado de `ForecastScenarios.tsx`).
  - Persistencia "visto" en localStorage:
    - `real_billing_detail_seen_v1`
    - `facturacion_info_seen_v1`

#### Garantías de no-romper

- `BillingMatrix.tsx` y `MatrixGrid.tsx`: intactos. Esta feature solo lee la salida de `adminApi.getMatrix`.
- `pl.js` y demás rutas backend: intactos. No se añadieron endpoints.
- `DepartmentPL.tsx`: cambios aditivos — nueva pestaña, nuevo state, nuevas funciones export, info icons; no se tocó la lógica de notas, escenarios, budget requests, comparación, EBITDA ni group cost.

#### Notas técnicas

- El "toggle Anual" es **client-side**: 12 fetches paralelos cacheados por React Query (`staleTime: 30s`). No requiere endpoint nuevo.
- Si en el futuro Billing Matrix añade columnas para nuevos servicios del P&L, ampliar `HUB_SERVICES` en `hubBillingMap.ts` con `svcByCode('Nombre P&L', 'CODE_SERVICIO')` y aparecerá automáticamente en el espejo y en el detalle.
- `RevenueCellDetailModal` solo soporta los servicios listados en `hubBillingMap.ts`. Si se clica un servicio sin mapeo (ej: SEO, Web dev, Otros servicios) muestra estado "Servicio no mapeado" en vez de tabla vacía engañosa.

**Commits relevantes (rama mergeada con `--no-ff`):**
- `7cf8084` feat(hubs): añadir pestaña Facturación y detalle de celda Real
- `6370079` fix(hubs): eliminar var no usada
- `107e341` fix(hubs): mapear servicios al P&L canónico
- `3796f3a` feat(hubs): toggle Anual, export CSV+PDF, quitar col Vertical
- `1543fa4` feat(hubs): avisos NUEVO en pestañas Real y Facturación
- `0dd8126` feat(hubs): exportar P&L a CSV/PDF desde dropdown del header
- `bb47c8f` merge commit en main

---

### 2026-07-08 — Feature: Añadir y eliminar filas dentro de los Escenarios (Presupuesto & Forecast)

**Motivo:** Los escenarios solo permitían subir o bajar valores en porcentajes. No se podía simular la baja de un trabajador a partir de un mes ni el alta de uno nuevo (con su coste). Tampoco cubría casos típicos de nómina como la paga doble en diciembre.

**Rama:** `fix/escenarios2`

#### Nueva funcionalidad — Filas del escenario

Dentro del modal ✨ Escenarios (tanto para el scope `budget` como `forecast`) hay una sección nueva **"Filas del escenario"** con dos acciones:

1. **Eliminar fila existente**
   - Buscador por nombre, hub o categoría (case-insensitive).
   - Lista agrupada por sección: `Facturación · Personal · Comisiones · Marketing · Formación · Software · Adspent · Gastos Operativos`. Con búsqueda activa se auto-expanden las categorías con match.
   - Al marcar una fila, se elige el mes desde el que aplica la baja (por defecto `range.from` del escenario). Los meses anteriores se quedan intactos; desde ese mes la fila se pone a 0.

2. **Añadir fila nueva**
   - Selección de sección, hub, nombre, coste `€/mes`, y rango de meses (`fromMonth` → `toMonth`).
   - Cuando la sección es **Personal**, aparecen dos controles adicionales:
     - Checkbox "Paga doble en diciembre" — duplica automáticamente el mes 12 (14 pagas ES).
     - Input libre "Extra dic. (€)" — para estimar un importe extra que no sea exactamente el sueldo.
   - Estos ajustes se guardan en `extraByMonth: { 12: X }` — retrocompatible.

#### Cambios en tipos (`client/src/features/pl/ForecastScenarios.tsx`)

Se extendió `ForecastScenario` con dos campos opcionales para no romper escenarios ya guardados:

```ts
removedItems?: Array<{ id, section, dept, item, fromMonth }>
addedRows?:    Array<{ id, section, dept, name, monthlyAmount, fromMonth, toMonth, extraByMonth? }>
```

Nuevos helpers exportados:
- `isItemRemoved(scenario, section, dept, item, monthIdx)`
- `addedRowValue(row, monthIdx)` — suma el `monthlyAmount` y el `extraByMonth[m]` si aplica.
- `addedRowsBySection(scenario, section)`

#### Integración en la matriz

- `PLMatrix.tsx` (vista superadmin) y `DepartmentPL.tsx` (vista por depto) inyectan las `addedRows` del escenario dentro de `mergedRevenueStructure` / `mergedExpenseStructure` **solo cuando el escenario aplica** (`activeTab ∈ {Forecast, Presupuesto}`). No se altera la base de datos.
- `getCellValue` (y `getScenarioValue` en DepartmentPL) devuelven:
  - `addedRowValue(row, monthIdx)` si la fila fue añadida por el escenario.
  - `0` si `isItemRemoved(...)` es cierto para ese mes.
  - Multiplicador de porcentaje habitual en el resto de casos.

#### Visualización de celdas

- Filas **añadidas**: fondo violeta + label `NUEVA` + tooltip con detalle (importe/mes y rango).
- Filas **eliminadas**: fondo rose + valor base tachado + label `−100%` + tooltip con el mes desde el que aplica.
- Se preserva el resto de comportamiento previo (tinted `emerald`/`rose` para % up/down).

#### UX del modal

- Los desplegables de "Eliminar fila existente" y "Añadir fila nueva" son controlados (`useState`) y llevan un botón **X** para cerrarlos, además del toggle mostrar/ocultar.
- Badge `NUEVO` junto al título "Filas del escenario".
- Guía "En 5 pasos" (antes 4) — se añadió el paso "Añade o quita filas ✨".

#### Avisos NEW (`NewFeatureBubble`)

Nueva `localStorage` key: `scenario_rows_seen_v1`.
- En `PLMatrix.tsx`: burbuja anunciando "Añadir y quitar filas" junto al botón ✨ Escenarios (después de que el usuario haya visto la primaria).
- En `DepartmentPL.tsx`: misma burbuja envolviendo el botón Escenarios.
- Al abrir el panel se marca automáticamente como vista.

#### Garantías de no-romper

- El tipo `ForecastScenario` solo se extiende con campos **opcionales** — los escenarios guardados en DB (JSONB) siguen funcionando idénticos.
- Cuando el escenario no tiene `removedItems` ni `addedRows`, todos los helpers y `getCellValue` se comportan exactamente igual que antes.
- Presupuesto y Forecast siguen siendo bibliotecas independientes (`scope` en `forecast_scenarios`).
- Las filas añadidas solo se muestran en las pestañas donde aplica el escenario; no se persisten en `pl_matrix` ni en `pl_custom_rows`.
- Dept heads (`canEdit={false}`) solo consumen escenarios compartidos — nunca ven la UI de edición de filas.

#### Archivos modificados

| Archivo | Descripción |
|---|---|
| `client/src/features/pl/ForecastScenarios.tsx` | Tipos + helpers + UI del modal (nueva sección "Filas del escenario") |
| `client/src/features/pl/PLMatrix.tsx` | `getCellValue`, merges y celdas coloreadas — vista superadmin |
| `client/src/features/dashboard/DepartmentPL.tsx` | `getCellValue`/`getScenarioValue`, merges y celdas — vista por depto |

**Commits relevantes:**
- `90e83e0` escenarios: soportar añadir y eliminar filas en el modal
- `d820e31` escenarios: aplicar filas añadidas/eliminadas en Presupuesto y Forecast
- `2a67939` escenarios: aplicar filas añadidas/eliminadas en vista por departamento
- `4189b7e` arreglo en escenario: quitar import no usado que rompía el build
- `c0debbd` escenarios: agrupar por sección en eliminar, cerrar bloques con X y paga doble/extra en personal

---

### 2026-07-08 — Feature: Enviar novedades por email desde la app

**Motivo:** Anunciar novedades del producto exigía redactar correos por fuera (Gmail o similar). Necesitamos una vía dentro de la app que reutilice el historial de novedades (`CHANGELOG`), evite duplicar el copy y permita elegir con precisión quién debe recibir cada aviso, incluyendo direcciones externas a la plataforma.

**Rama:** `fix/escenarios2`

#### Nueva pantalla — Enviar novedades

Menú lateral (solo superadmins) → **✉️ Enviar novedades** (`/release-notifications`).

**Layout en dos columnas:**

- **Izquierda:**
  1. *Elige la novedad* — lista completa del `CHANGELOG` con buscador por título/descripción y filtro por tipo (Nuevo · Mejora · Corrección · En desarrollo). Cada entry muestra badge de tipo, fecha, título y preview corta de la descripción.
  2. *Elige destinatarios* — bloque "Añadir emails manuales" (acepta coma/espacio/`;` como separadores, valida al vuelo, chips con `X` para eliminar) + tabla de usuarios de la app con buscador (email/nombre), filtro por rol y por departamento, botón "Seleccionar todos los visibles" y "Limpiar todo". Contador diferencia internos vs externos.
  - CTA sticky con contador total (Enviar).

- **Derecha:** vista previa del correo tal cual lo recibirá el destinatario — se pinta con un `<iframe srcDoc>` a partir del HTML generado en el cliente.

**Modal de confirmación** — antes de enviar muestra:
- Título de la novedad + total de destinatarios.
- Lista completa (usuarios de la app y externos etiquetados como *externo*).
- Aviso amber: "cada destinatario recibirá el correo en su dirección. Esta acción no se puede deshacer".
- Banner rojo con el detalle si el envío falla, con resultado por destinatario (✓/✗ + error si lo hay).
- Botón **Probar SMTP** que llama a `/release-notifications/diagnose?verify=1` — hace un handshake real con el servidor y devuelve `ok`/`smtp-not-configured`/`smtp-verify-failed`.

#### Sistema de templates (`client/src/lib/releaseEmailBuilder.ts`)

`buildChangelogEmail(entry)` devuelve `{ subject, html, text }`:
- **Builder por defecto** — hero con gradiente según el tipo (`new_module` verde/cyan, `improvement` índigo/rosa, `fix` naranja, `in_progress` violeta), badge del tipo, título, descripción, CTA y footer. Sirve para cualquier `ChangelogEntry`.
- **Builders específicos** — para entradas destacadas con contenido rico. Actualmente:
  - `v1.41-escenarios-filas` → tarjetas de Bajas/Altas/Paga doble.
  - `v1.42-enviar-novedades-email` → tarjetas 1·2·3 del flujo.

Añadir una novedad con builder custom = registrar `id` → `builder` en `CUSTOM_BUILDERS`.

#### Endpoints backend (`services/admin-service/src/routes/release-notifications.js`)

Middleware `requireSuperAdmin`:
- Verifica token con `supabase.auth.getUser`.
- Consulta `user_profiles` (nombre real de la tabla en este proyecto — el primer intento fallaba porque miraba `profiles`).
- Requiere `role === 'superadmin'`, si no → 403 con `detail` para debug.

| Método | Path | Descripción |
|---|---|---|
| GET | `/release-notifications/templates` | Templates del legacy flow (mantiene compat) |
| GET | `/release-notifications/diagnose[?verify=1]` | Estado del SMTP (env vars + handshake real si se pide) |
| GET | `/release-notifications/preview/:key` | HTML del template legacy |
| POST | `/release-notifications/send` | Envío usando template legacy |
| POST | `/release-notifications/send-html` | **Endpoint principal** — recibe `{ subject, html, text?, to[] }` renderizado por el cliente |
| POST | `/release-notifications/scenarios-rows` | Atajo directo (legacy) |

Detalles:
- Transporter de nodemailer con `pool: false` (Vercel serverless), `connectionTimeout: 8000`, `greetingTimeout: 8000`, `socketTimeout: 15000`.
- Envío 1-a-1: cada destinatario recibe correo dedicado, no se expone la lista.
- Validación server-side de emails con regex; los inválidos se ignoran y se cuentan en `skippedInvalid`.
- Devuelve `{ ok, sent, failed, skippedInvalid, results[], sentBy }`.

#### Timeout global en `fetchApi` (`client/src/lib/api/client.ts`)

Añadido `AbortController` con timeout configurable (default 45s) para que ninguna petición se cuelgue indefinidamente. Si expira, `Error("Timeout tras 45s esperando al servidor")` visible al usuario.

#### Sidebar + Sistema NEW

- `client/src/lib/constants.ts`: nuevo ítem `{ label: 'Enviar novedades', path: '/release-notifications', icon: 'Mail', requiredPermission: 'release_notifications', superadminOnly: true }` + entrada en `ALL_MODULES` (`release_notifications`).
- `client/src/components/layout/Sidebar.tsx`: importa el icono `Mail`.
- `client/src/lib/changelog.ts`: dos nuevas entries en la cabecera (`v1.41-escenarios-filas` y `v1.42-enviar-novedades-email`) — con `highlight: true` para que aparezca el punto pulsante en el sidebar hasta que el usuario lo vea.
- `client/src/components/shared/WhatsNew.tsx`: añadidos `Mail` y `Sparkles` al `ICON_MAP` para que se pinten en el panel superior.

#### Garantías

- Endpoint bloqueado si el user no es superadmin (403 explícito).
- El `CHANGELOG` sigue siendo la única fuente de verdad — cambios de copy o de metadata se hacen ahí y se propagan tanto al panel superior como a la pantalla de envío.
- Si el SMTP no está configurado, el envío no rompe la app: devuelve 500 controlado, la UI muestra el error con recomendaciones.

**Archivos añadidos/modificados:**

| Archivo | Descripción |
|---|---|
| `client/src/features/release-notifications/ReleaseNotifications.tsx` | Página principal |
| `client/src/lib/releaseEmailBuilder.ts` | Builders de correo (default + custom) |
| `client/src/lib/changelog.ts` | Nuevas entries |
| `client/src/lib/api/admin.ts` | `sendReleaseNotificationHtml`, `diagnoseReleaseSmtp`, `listReleaseTemplates`, `previewReleaseTemplate` |
| `client/src/lib/api/client.ts` | Timeout global con `AbortController` |
| `client/src/lib/constants.ts` | Nuevo módulo + NAV item |
| `client/src/components/layout/Sidebar.tsx` | Icono Mail |
| `client/src/components/shared/WhatsNew.tsx` | ICON_MAP ampliado |
| `client/src/App.tsx` | Ruta `/release-notifications` |
| `services/admin-service/src/routes/release-notifications.js` | Middleware + endpoints |
| `services/admin-service/src/lib/releaseEmail.js` | Template legacy (mantiene compat) |
| `services/admin-service/src/index.js` | Mount de la nueva ruta |
| `scripts/send_release_email.js` | Script CLI para lanzar el correo con envs SMTP |
| `scripts/release_email_template.js` | Template compartido con el CLI |

**Commits relevantes:**
- `dbe68d2` novedades: endpoints templates/preview/send con auth superadmin
- `0b2b1c9` novedades: página Enviar novedades con selector template, usuarios y preview
- `340989a` novedades: listar CHANGELOG completo, preview client-side y emails manuales
- `7a85477` novedades: diagnóstico SMTP, timeouts y errores visibles en el modal

---

### 2026-07-09 — Provisión de nueva trabajadora en el hub Imcontent

**Contexto:**
Se incorpora una nueva persona al equipo de Imcontent que aún no tiene nombre asignado (está pendiente de contratación). Hay que dejar la fila creada en la estructura para poder cargar presupuesto y forecast desde ya, y tener el hueco listo cuando llegue el momento de registrar su sueldo real.

**Solución:**
Se añade la fila `Nueva Trabajadora` en la sección Personal → Imcontent del `EXPENSE_STRUCTURE` compartido. Aparece automáticamente en Real, Presupuesto, Comparación, Forecast y Escenarios porque los cuatro tabs comparten la misma fuente de verdad.

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `client/src/features/pl/PLMatrix.tsx` | `EXPENSE_STRUCTURE.personalItems` — Imcontent |
| `client/src/features/dashboard/DepartmentPL.tsx` | Mismo array replicado por hub |
| `client/src/features/dashboard/Dashboard.tsx` | Mismo array replicado |
| `client/src/features/dashboard/DashboardDetalle.tsx` | Mismo array replicado |
| `services/admin-service/src/routes/pl.js` | `PERSONAL_ITEMS.Imcontent` para conteo de personas del hub |
| `services/admin-service/src/routes/profitability.js` | `PERSONAL_ITEMS.Imcontent` para coste/hora |
| `services/admin-service/src/routes/chat.js` | Clasificador de categoría `personal` |
| `services/admin-service/src/routes/dashboard.js` | Clasificador de categoría `personal` |

**Base de datos:**
No requiere migración. La categoría en `expense_categories` se autocrea la primera vez que se guarda un valor en la celda (ver `pl.js:855-874`) y se asigna al año fiscal actual en `category_year_assignments`.

**Cuando llegue el nombre real:**
Buscar/reemplazar `"Nueva Trabajadora"` en los 8 archivos anteriores por el nombre definitivo. Si ya se hubieran cargado valores en BBDD, renombrar también la entrada en `expense_categories` para no perder el histórico.

**Commit:**
- `d5bce5d` Añadir fila "Nueva Trabajadora" en el hub Imcontent
- `79b114a` novedades: fix 403 — la tabla es user_profiles, no profiles

---

### 2026-07-14 — Feature: Módulo de Impagos (dunning)

**Rama:** `feat/impagos`

**Motivo:**
Sustituir el flujo actual de n8n que envía recordatorios de facturas vencidas los lunes por un módulo integrado en la app con **trazabilidad completa**: cuántos recordatorios ha recibido cada cliente, en qué nivel, cuánto tarda en pagar, y KPIs de recuperación. Además integrar links de pago Stripe reales en cada correo.

#### Arquitectura

- **Backend**: nuevo router `services/admin-service/src/routes/dunning.js` + libs auxiliares.
- **Base de datos**: 4 tablas nuevas (`dunning_config`, `dunning_templates`, `dunning_cases`, `dunning_reminders`) + tabla de overrides (`dunning_email_overrides`).
- **Frontend**: 2 rutas nuevas dentro del desplegable Payments (`/payments/dunning` y `/payments/dunning/config`).
- **Cron**: Vercel Cron cada hora + cron diario de sincronización de cobros.
- **SMTP**: reutiliza nodemailer + Gmail SMTP ya configurado.
- **Stripe**: reutiliza `createCheckoutSession()` de `lib/stripe.js`.

#### Tablas nuevas (`database/migrations/add_dunning*.sql`)

| Tabla | Propósito |
|---|---|
| `dunning_config` | Single-row. Reglas (rangos días por nivel), programación (send_days[], send_hour, timezone), marca (colores, logo, firma, bancos), modo prueba, metadatos del cron |
| `dunning_templates` | Plantilla de email por nivel (1, 2, 3): asunto, hero_title/subtitle, intro_copy, outro_copy |
| `dunning_cases` | Uno por factura vencida (`invoice_id` UNIQUE). Status: open/paid/cancelled |
| `dunning_reminders` | Histórico de cada envío. Incluye stripe_session_id, is_test |
| `dunning_email_overrides` | Redirigir emails de un contact_id concreto a otro email |

Todas con RLS: solo superadmins. Service role del backend bypasea RLS.

#### Backend — endpoints principales

Auth: **`requireSuperAdmin`** para casi todo. Excepciones:
- `GET /dunning/logo` — público (para `<img src>` en emails)
- `GET /dunning/logo-debug` — diagnóstico
- `POST /dunning/cron/run` y `/cron/sync-paid` — auth por `CRON_SECRET` (Vercel Cron)

Endpoints:
- `GET/PUT /dunning/config`
- `GET/PUT /dunning/templates`
- `POST /dunning/preview` y `/preview-v2` (render con datos de ejemplo)
- `GET /dunning/overdue-invoices` (Holded en vivo + emails de `/contacts`)
- `GET /dunning/cases`, `/cases/:id`, `/stats` (KPIs excluyen `is_test=true`)
- `POST /dunning/preview-run` (plan de envíos, sin enviar)
- `POST /dunning/test-send` (una plantilla a tu email con Stripe real)
- `POST /dunning/run` (envío real, respeta test_mode + overrides)
- `POST /dunning/sync-paid` (cruza casos abiertos con Holded, cierra pagados)
- `POST /dunning/reset-test-data` (borra histórico — solo con test_mode ON)
- CRUD `/dunning/overrides/:contact_id`

#### Libs auxiliares

- `lib/dunningWorker.js`: `buildDunningPlan()` decide qué facturas enviar y en qué nivel. Enriquece emails con `/contacts` de Holded (Holded no incluye contactEmail en `/documents/invoice`).
- `lib/dunningEmailV2.js`: renderer del email premium. Reproduce el diseño oficial: hero con degradado, 6 cards de datos, botón Stripe, botones de bancos configurables. Compatible con Gmail (table-based + inline styles).
- `lib/dunningLogo.js`: PNG del logo en base64 (para servir desde el endpoint público `/logo`).
- `lib/dunningRenderer.js`: renderer legacy por bloques (deprecado pero preservado).

#### Frontend — rutas y navegación

`NAV_ITEMS` de `constants.ts`: añadidos 2 hijos al desplegable *Payments*:
- **Impagos** → `/payments/dunning`
- **Configuración de impagos** → `/payments/dunning/config`

Nuevo permiso `dunning` en `ALL_MODULES`.

#### Frontend — Dashboard `/payments/dunning`

- KPIs (vencidas ahora, recordatorios enviados sin contar test, casos cobrados, media días hasta cobro, casos abiertos).
- Reparto por nivel 1/2/3 con importes.
- Tabla de facturas vencidas en vivo desde Holded, cruzada con `dunning_cases` para mostrar recordatorios enviados y último envío por caso.
- Banner amarillo permanente si el sistema está en modo prueba.
- Banner ámbar si el sistema está desactivado.

#### Frontend — Configuración `/payments/dunning/config`

Tabs:
1. **Reglas**: rangos de días por nivel, repetición nivel 3, importe mínimo, BCC.
2. **Programación**: toggle activar sistema, días de la semana (uno o varios), hora/minuto, timezone. Muestra última ejecución del cron y del sync-paid.
3. **Marca y bancos**: toggle mostrar/ocultar logo, URL de imagen del logo (con preview + fallback a `/logo.png` local), color primario/secundario del degradado, firma HTML, textos de botones y badge, lista editable de bancos (nombre + URL + color).
4. **Plantillas**: formulario simple por nivel (título hero, subtítulo, copies intro/outro, asunto) con preview live del diseño premium.
5. **Ejecutar**: modo prueba dirigido + overrides por cliente + acciones (Ver preview, Enviar prueba, Sincronizar cobros, Resetear datos de prueba, Ejecutar ahora con dry-run).

#### Modo prueba dirigido

Toggle en tab Ejecutar. Cuando está activo:
- TODOS los envíos (manuales o cron) van a `test_mode_email` en lugar de al cliente.
- El email lleva un banner amarillo al inicio indicando el destinatario original.
- El asunto se marca con `[PRUEBA]`.
- Los recordatorios se guardan en `dunning_reminders` con `is_test=true` → **no ensucian KPIs**.
- Banner amarillo permanente en el dashboard mientras esté activo.

#### Cron automático (Vercel Cron)

En `vercel.json`:
```json
"crons": [
    { "path": "/api/admin/dunning/cron/run", "schedule": "0 * * * *" },
    { "path": "/api/admin/dunning/cron/sync-paid", "schedule": "0 6 * * *" }
]
```

- `/cron/run` corre cada hora en punto (UTC). Chequea si toca según config (día de la semana + hora en la timezone de config). Idempotente: si se ejecutó hace menos de 30 min, salta.
- `/cron/sync-paid` corre diariamente a las 6:00 UTC.
- Auth por `CRON_SECRET` (env var en Vercel).

#### Precedencia de destinatario del email (worker)

`test_mode` → `override_email` → email real del contacto en Holded → skip por no-email.

En test_mode/override el envío se hace aunque el cliente no tenga email en Holded.

#### SQL a ejecutar en Supabase (6 migraciones, idempotentes)

En orden:
- `database/migrations/add_dunning.sql` — schema inicial + seed de 3 plantillas
- `database/migrations/add_dunning_v2.sql` — brand + bancos + plantillas estructuradas
- `database/migrations/add_dunning_v3.sql` — logo URL + test_mode + overrides
- `database/migrations/add_dunning_v4.sql` — metadatos del cron
- `database/migrations/add_dunning_v5.sql` — is_test para no contar prueba en KPIs
- `database/migrations/add_dunning_v6.sql` — toggle show_logo

#### Variables de entorno requeridas en Vercel

| Variable | Uso |
|---|---|
| `HOLDED_API_KEY` | ya existente |
| `STRIPE_SECRET_KEY` | ya existente |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST` | ya existente |
| `CRON_SECRET` | **nuevo** — cualquier string aleatorio largo |
| `APP_URL` | opcional. Si se define, se prefiere para las URLs de imágenes en el email. Cuidado con espacios/tabs |

#### Pendiente / limitaciones conocidas

- El logo del email se sirve desde el endpoint público `/api/admin/dunning/logo`. En preview branches funciona con `VERCEL_URL`. En producción funciona con el dominio de la app. Si el logo no carga, hay un toggle *Mostrar logo* en Configuración → Marca y bancos para ocultarlo.
- Los links Stripe expiran a las 23 horas (límite de Stripe Checkout Sessions). Si el cliente abre el email más tarde y necesita nuevo link, se genera desde el módulo Payments existente.

#### Commits principales de la rama

- `299c508` fase 1 — dashboard + esqueleto config + editor plantillas
- `77e5511` fase 2a — envío bajo demanda + test-send + sync-paid
- `13b6964` fase 3 — diseño premium + Stripe + bancos configurables
- `7c36941` fase 3.1 — logo imagen + modo prueba dirigido + overrides
- `86a3a2b` fixes — enrichment emails Holded + confirm contextual + destino visible en preview
- `054c7c1` fix — logo base64 embed + resultados con nombre cliente
- `1390638` fase 2b — cron Vercel automático
- `93c61a2` fix — reasons legibles + botón resetear pruebas
- `8b3ff75` fix — KPIs excluyen envíos en modo prueba
- `5b33e70`/`abb386d`/`c5a610e` fixes — logo desde endpoint público
- `9e84b6d` toggle mostrar/ocultar logo

#### Ajustes finales (post-QA con usuario)

**Toggle mostrar/ocultar logo** (`add_dunning_v6.sql`):
- Nueva columna `dunning_config.show_logo boolean DEFAULT true`.
- Toggle en Configuración → Marca y bancos → "Mostrar logo en el email".
- Si se desactiva, el hero del email queda solo con título + subtítulo, sin bloque de logo.
- Motivo: soluciona los casos donde el dominio de producción (`imfinance.immoral.es`) todavía no está configurado en DNS y el logo sale roto en preview branches.

**Resumen del estado en la tab Programación**:
- Card destacado al principio con el estado ACTUAL guardado (leído de `config`, no del form):
  - Verde: *"Sistema ACTIVO — Se envían recordatorios los [días] a las HH:MM ([timezone])"*.
  - Ámbar: *"Sistema activo pero sin días configurados"*.
  - Gris: *"Sistema DESACTIVADO — No se envía nada automáticamente"*.
- Banner azul si hay cambios sin guardar respecto a `config`.
- Feedback "✓ Guardado" durante 3 segundos al pulsar el botón (`justSaved` timer).
- Motivo: al pulsar Guardar el toggle solo cambiaba estado en BD pero no había confirmación visual.

**Traducciones y limpieza UX**:
- Los `reason` técnicos del worker (`waiting-repeat-0/7`, `level-2-already-sent`, etc.) se traducen a español legible en el modal de preview y en el resumen de envío.
- El modal "Envío completado" muestra tabla con **nombre del cliente + número de factura + destino real + estado**, en lugar del `invoice_id` bruto.
- El campo `to` en cada resultado es siempre el destino final (respetando test_mode/override), no el email original del cliente.
- Confirmación al pulsar "Ejecutar ahora" es contextual: en modo prueba avisa que todo irá al email de prueba; en modo real avisa que va a los clientes.

**Fix del logo en emails**:
- Endpoint público `GET /api/admin/dunning/logo` que sirve el PNG binario desde el base64 embebido.
- El renderer construye la URL usando `base_url` (host del request actual) → `VERCEL_URL` → `APP_URL` trimeada → fallback.
- Endpoint diagnóstico `GET /api/admin/dunning/logo-debug` para verificar env vars y URL calculada.
- Motivo: Gmail bloquea `data:` URIs por seguridad, así que hay que servir el logo desde un endpoint HTTP público real.

**KPIs limpios** (`add_dunning_v5.sql`):
- Columnas `is_test` en `dunning_reminders` y `dunning_cases`.
- Cuando `test_mode=true` o hay `override`, el envío se marca como `is_test=true`.
- El endpoint `/stats` filtra por `is_test=false` en TODAS sus queries.
- La migración marca retroactivamente como test los envíos previos con prefijo `[PRUEBA]` o `[REDIRIGIDO]` en el asunto.

**Resetear datos de prueba**:
- Endpoint `POST /dunning/reset-test-data` que borra TODO el histórico de `dunning_reminders` y `dunning_cases`.
- Protegido: solo funciona si `test_mode=true` (para no borrar histórico real por accidente).
- Botón visible en Configuración → Ejecutar solo cuando modo prueba está activo.

#### Flujo de QA recomendado

1. Correr las 6 migraciones SQL en orden (`add_dunning.sql` → `add_dunning_v6.sql`).
2. Configurar env var `CRON_SECRET` en Vercel (Production + Preview).
3. En la app: *Configuración de impagos → Ejecutar* → activar **Modo prueba dirigido** con el email de administración.
4. *Configuración → Marca y bancos* → ajustar colores, firma, lista de bancos. Desactivar el logo si no se está viendo en preview.
5. *Configuración → Plantillas* → revisar copies de los 3 niveles.
6. *Configuración → Reglas* → ajustar rangos si es necesario.
7. *Configuración → Programación* → seleccionar días + hora + timezone. Activar sistema. Guardar.
8. *Configuración → Ejecutar* → **Ver preview** → confirmar plan → **Ejecutar ahora** (los 12 llegan a la bandeja de administración con Stripe real).
9. Verificar diseño, contenidos, botón Stripe (que abra el checkout con el importe correcto), botones de bancos.
10. Repetir con **Resetear datos de prueba** entre pruebas.
11. Cuando esté a gusto: apagar modo prueba. El cron enviará automáticamente en los días/hora configurados.

#### Última mano

**Commits añadidos tras el registro inicial:**
- `ffe6302` docs: registrar módulo en REGISTRO y changelog

---

### 2026-07-16 — Feature: Escenarios · definir monto por fila + compartir por correo (rama `fix/escenarios3`, mergeada a `main`)

**Motivo:**
Los escenarios sólo permitían ajustes por porcentaje. Faltaba poder decir "en julio para Automation vamos a facturar 12.000 €" (un objetivo concreto por fila y mes) manteniendo el resto del forecast/presupuesto intacto. Además, no había forma de avisar a alguien de que había un escenario disponible: sólo se podía compartir con hubs y quien no supiera que existía nunca lo veía.

#### Cambios funcionales

1. **Definir monto por fila (además del ajuste por %)**
   - Nueva sección en el modal de escenarios: **"Definir monto por fila"**, con la misma jerarquía visual que las secciones de % ya existentes (Ingresos: hub → servicio; Gastos: categoría → hub → item).
   - Cada leaf muestra el nombre + un input de €/mes. Escribir un monto crea el override con el rango del escenario por defecto; borrarlo (0) lo elimina.
   - Los grupos con overrides activos se auto-expanden y muestran "N definidos".
   - Encima del árbol, lista de overrides activos con **chip de rango de meses editable** (con enlace para volver al rango del escenario).
   - Prioridad de resolución por celda: `addedRow` → `removed` → `amountOverride` → ajuste por %.

2. **Marca visual en la P&L**
   - Celdas con monto definido se muestran con fondo ámbar y el valor base tachado debajo como referencia.
   - Se arregló un bug donde las filas de **Ingresos** (revenue) tomaban una rama read-only en Forecast que se saltaba la marca de escenario; ahora usan el mismo renderer que gastos.

3. **Banner "estás en un escenario" en la P&L**
   - Debajo del header aparece un banner con rayas ámbar cuando hay un escenario aplicado en Forecast/Presupuesto.
   - Cuando el usuario llega por link compartido, el título cambia a "ESCENARIO COMPARTIDO CONTIGO".
   - Incluye una fila con **4 tarjetas comparativas anuales**: Ingresos, Gastos, EBITDA y Rentabilidad %, cada una mostrando `base → escenario` con la variación en € o puntos porcentuales, y flecha ▲/▼ verde/rojo según mejora o empeora el resultado.
   - Botón "Volver a Forecast/Presupuesto base" para salir del escenario.

4. **Compartir escenarios por correo**
   - Nuevo icono de sobre junto al lápiz/papelera de cada escenario guardado.
   - Mini-formulario dentro del modal: uno o varios emails (separables por coma/espacio) + mensaje opcional.
   - Endpoint `POST /pl/scenarios/:id/share` con `{ emails, message }` que envía un correo HTML con hero, chips de resumen, mensaje opcional del emisor y CTA para abrir el escenario.
   - El link es `/pl-matrix?tab=Forecast|Presupuesto&scenario=<id>`. La URL base se resuelve dinámicamente desde el request (preview de Vercel o dominio de producción) — mismo patrón que `dunningEmailV2` para el logo.
   - Alias de remitente: si el correo de la sesión es `admin@immoral.com`, se muestra **"Daniel"** como remitente. Regla puntual sólo para ese correo compartido; el resto de usuarios se muestra tal cual.

5. **Activación por URL param**
   - `PLMatrix` lee `?scenario=<id>` y lo aplica automáticamente si coincide con un escenario guardado.
   - Sincroniza el param al activar/desactivar escenarios manualmente, así los enlaces preservan el estado y el back del browser funciona bien.

#### Archivos modificados

| Archivo | Cambio |
|---|---|
| `client/src/features/pl/ForecastScenarios.tsx` | Tipo `ScenarioAmountOverride`, campo `amountOverrides?`, helper `getAmountOverride()`, componente `AmountInput`, sección "Definir monto por fila" con drill-down, mini-formulario de compartir, prop `onShare` |
| `client/src/features/pl/PLMatrix.tsx` | `getCellValue()` honra overrides antes que %, `renderEditableCell()` pinta celda ámbar, banner con comparativa anual base↔escenario, hook `useUrlState('scenario')`, `useMemo` de `baseTotalsAnnual`, wiring de `onShare` con `toast` |
| `client/src/features/dashboard/DepartmentPL.tsx` | Aplica overrides en `getCellValue()`, `getScenarioValue()` y `renderReadOnlyCell()` |
| `client/src/lib/api/admin.ts` | Método `shareForecastScenario(id, { emails, message })` |
| `services/admin-service/src/routes/pl.js` | Endpoint `POST /pl/scenarios/:id/share`, helper `resolveBaseUrl(req)`, tabla `SENDER_ALIASES` con `admin@immoral.com → Daniel`, template HTML del email |

Retrocompatible con escenarios guardados: `amountOverrides` es opcional en `ForecastScenario`.

#### Copy del correo (final)

- Subject: `Escenario compartido: <nombre>`
- Cuerpo: *"<Sender> ha preparado un escenario sobre el Forecast y quiere que lo revises. Al abrirlo verás el impacto de los ajustes propuestos mes a mes, por hub y por categoría — con la variación en ingresos, gastos, EBITDA y rentabilidad respecto a la línea base."*
- Pie: *"El escenario vive dentro de la app: puedes explorarlo con toda la información, y el Forecast base queda intacto hasta que decidáis aplicarlo."*
- CTA: **Abrir escenario en la app →**

#### Commits principales de la rama

- `5a88595` feat — permitir fijar monto por fila y mes (base)
- `585aa81` feat — rediseñar UI con drill-down por hub/categoría/item
- `06ba785` feat — marcar overrides en modal, compartir por correo y banner de vista simulada
- `316f961` fix — derivar URL base del link del email desde el request (para previews)
- `9a01ae8` fix — marca visual en ingresos + comparativa antes/después con rentabilidad
- `b726235` polish — quitar etiqueta FIJO y renombrar como "definir monto"
- `1bfe1e2` polish — copy del correo con más aplomo + alias Daniel para admin@immoral.com
- `d9e7d36` merge a `main`
- `8381bae` UX: resumen del estado + feedback guardado en Programación

---

### 2026-07-16 — UX: Pantallitas de guía en Impagos y Configuración de impagos

**Rama:** `fix/impagos1`

**Motivo:**
El módulo de impagos es nuevo y tiene bastante superficie (dashboard, 5 tabs de configuración, modo prueba, overrides, cron, plantillas por nivel…). Un usuario que entra por primera vez no tiene contexto de qué mira ni qué hace cada botón. Se añaden pantallitas explicativas cortas dentro de la propia app para que se entienda sin necesidad de consultar documentación externa.

#### Nuevo componente `client/src/features/dunning/DunningGuide.tsx`

Contiene 3 piezas reutilizables:

| Componente | Uso |
|---|---|
| `DunningIntroPanel` | Panel plegable "¿Qué es el módulo de impagos?" con el flujo en 3 pasos (Detecta → Recuerda → Sigue) y aviso de arrancar en modo prueba. Se renderiza tanto en el dashboard como en la página de configuración. |
| `LevelsLegend` | Tarjeta con los 3 niveles de aviso (colores amber/orange/red) mostrando el rango de días real leído de `dunning_config` y una descripción del tono de cada uno. Aparece en el dashboard antes del reparto por nivel. |
| `TabGuide` | Panel guía por pestaña de configuración. Icono contextual + descripción + lista de tips prácticos con `ArrowRight`. Se puede ocultar. |

Todos los paneles son **ocultables** y el estado se persiste en `localStorage` con claves específicas (`dunning:intro-dismissed`, `dunning:guide:rules`, `dunning:guide:schedule`, etc.). Cuando están ocultos aparece un enlace pequeño "Mostrar guía" para volverlos a abrir.

#### Integración en `DunningDashboard.tsx`

- `DunningIntroPanel` justo debajo del header (antes de los banners de estado).
- `LevelsLegend` antes del bloque de reparto por nivel, alimentado con los valores actuales de `configData.config.level_*_days_*` (con fallback a 5/9, 10/14, 15).

#### Integración en `DunningConfig.tsx`

- `DunningIntroPanel` bajo el header general.
- `TabGuide` como primer elemento dentro de cada tab:
  - **Reglas** — explica qué son los rangos, la repetición del nivel 3, el importe mínimo y el BCC.
  - **Programación** — explica el reloj cada hora, cómo elegir día/hora, ejemplo típico (lunes 09:00) y el sync-paid diario.
  - **Marca y bancos** — explica que todo lo de esta pestaña afecta al email real que recibe el cliente, con el toggle del logo, colores del degradado y firma HTML.
  - **Plantillas** — explica las variables disponibles (`{{contact_name}}`, `{{invoice_number}}`…), qué es el hero, el intro y el outro copy.
  - **Ejecutar** — explica el modo prueba, overrides, preview vs dry-run vs ejecutar, y sincronización de cobros.

#### Cambios menores

- `changelog.ts`: nueva entrada `v1.44-impagos-guia` (icon Lightbulb, highlight true, superadminOnly true) para que los superadmins vean la novedad en el ChangeLogPanel.

#### Verificación

- `npx tsc --noEmit -p tsconfig.app.json` — sin errores.
- `npx vite build` — build limpio.

#### Commit

- `fix/impagos1` — feat(dunning): pantallitas guía integradas en Impagos y su configuración + registro en REGISTRO y changelog.

---

### 2026-07-16 — Fix: URL del correo de novedades apunta al módulo, no al home

**Rama:** `fix/envionovedades` (mergeada a `main` en commit `438823e`)

**Motivo:**
Cuando un superadmin usaba **Enviar novedades** para notificar una novedad por correo, todos los enlaces del email (botón CTA principal y link "Ir a la app" del footer) apuntaban al `appUrl` base (el home). El destinatario aterrizaba en el Dashboard y tenía que buscar manualmente el módulo donde estaba la funcionalidad nueva. Cada `ChangelogEntry` ya llevaba un `moduleKey`, pero no se estaba usando para construir el link.

#### Cambio

`client/src/lib/releaseEmailBuilder.ts`:

- Nuevo mapa `MODULE_ROUTES: Record<string, string>` que traduce cada `moduleKey` a su ruta interna (alineado con `NAV_ITEMS` de `client/src/lib/constants.ts`).
- Nuevo helper `ctaUrlFor(entry, appUrl)` que devuelve `appUrl + ruta del módulo`. Si la entrada no tiene `moduleKey` o mapea a la raíz (`dashboard`), devuelve `appUrl` tal cual — comportamiento anterior preservado.
- Los tres builders (`buildDefault`, `buildScenariosRows`, `buildEnviarNovedadesEmail`) sustituyen su uso de `${appUrl}` en los enlaces (`<a href>`, subject de texto plano) por `${ctaUrl}`.

#### Mapeo `moduleKey → ruta`

| moduleKey | ruta |
|---|---|
| `dashboard` | `/` (usa la raíz, no se anexa) |
| `billing` | `/billing` |
| `media_investment` | `/media-investment` |
| `payrolls` | `/payroll` |
| `payments` | `/payments` |
| `payment_links` | `/payments/generate-link` |
| `dunning` | `/payments/dunning` |
| `commissions` | `/commissions` |
| `pl_matrix` | `/pl-matrix` |
| `departamentos` | `/departamentos` |
| `clients` | `/clients` |
| `client_billing` | `/client-billing` |
| `settings` | `/settings` |
| `user_management` | `/users` |
| `imsales_billing` | `/imsales-billing` |
| `developers` | `/developers` |
| `profitability` | `/profitability` |
| `release_notifications` | `/release-notifications` |

#### Ejemplo

Antes:
- Novedad `v1.43-impagos` (moduleKey `dunning`) → botón "Abrir en la app" → `https://app-finance.vercel.app` (home).

Después:
- Novedad `v1.43-impagos` → botón "Abrir en la app" → `https://app-finance.vercel.app/payments/dunning` (el módulo real).

#### Nota sobre versionado

- Se registra como `v1.46-envionovedades-url-modulo` en `changelog.ts`.
- `v1.44-impagos-guia` y `v1.45-escenarios-montos-y-compartir` ya estaban ocupadas en `main` cuando se documentó este fix, así que se cogió la siguiente libre (`v1.46`).

#### Commit

- `fe79c98` fix(envionovedades): CTA del email lleva al módulo, no al home
- `438823e` merge a `main`

---

### 2026-07-16 — Fix: Cron automático de Impagos no ejecutaba (POST vs GET)

**Rama:** `fix/impagos2`

**Problema reportado:**
El sistema de impagos aparecía como "Activado" en la configuración, el cron horario estaba dado de alta en `vercel.json`, pero no llegaba ningún recordatorio automático a nadie. Los envíos manuales desde el botón "Ejecutar ahora" y desde `POST /dunning/run` sí funcionaban.

**Causa raíz:**
Vercel Cron Jobs llaman al endpoint configurado usando el método **GET**. Nuestros endpoints estaban registrados solo como `router.post('/cron/run', ...)` y `router.post('/cron/sync-paid', ...)`. Cuando Vercel pegaba con GET no había handler para ese método → Express caía en el siguiente middleware (`router.use(requireSuperAdmin)`), que devolvía `401 no-auth` porque el header `Authorization: Bearer CRON_SECRET` no es un token de Supabase. Resultado: el cron pegaba una vez por hora contra el servidor, cobraba 401 y se descartaba, sin dejar rastro en `dunning_config`.

**Solución (`services/admin-service/src/routes/dunning.js`):**

- Extraídos los handlers de `/cron/run` y `/cron/sync-paid` a funciones `cronRunHandler` / `cronSyncPaidHandler`.
- Registrados en `router.get(...)` (para Vercel Cron) **y** `router.post(...)` (para disparo manual con `curl`). Los dos pasan por el mismo middleware `requireCronSecret`, así que la protección con `Authorization: Bearer CRON_SECRET` no cambia.
- Añadida trazabilidad de "skip": cada vez que el cron llega pero no envía (sistema deshabilitado, día/hora que no toca), se actualiza `last_cron_run_at` + `last_cron_status = "skipped: <motivo>"` + `last_cron_summary`. Así en la UI se ve que Vercel sí está pegando aunque no toque enviar. La rama de `ran-recently` (idempotencia de 30 min) no reescribe el timestamp para no romper la propia protección.

**Cambios**

- `services/admin-service/src/routes/dunning.js` — GET+POST en los dos endpoints del cron + stamp de skip.
- `client/src/lib/changelog.ts` — entrada `v1.47-impagos-cron-metodo-http`.

**Cómo verificar en producción**

1. Esperar a que Vercel Cron ejecute (cada hora en punto).
2. En Impagos → Configuración → Programación, mirar "Última ejecución": debe actualizarse aunque no toque enviar (por defecto solo lunes 9:00 Madrid).
3. Cuando toque día/hora configurados, revisar en la BD `dunning_reminders` para ver los envíos.
4. Manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://app-finance.vercel.app/api/admin/dunning/cron/run` (GET) debe responder JSON.

---

### 2026-07-16 — Feature: Historial de envíos + open tracking en Impagos

**Rama:** `fix/impagos3`

**Motivo:**
Después del fix del cron (`fix/impagos2`) los recordatorios empezaron a salir, pero la única forma de saber qué había hecho el sistema era mirar `dunning_config.last_cron_status` (solo la última ejecución) y `dunning_cases` (uno por factura). No había una vista con el histórico completo de cron runs, ni un log unificado de envíos que dijese "por qué no salió este correo", ni nada para saber si el cliente había abierto el email.

**Cambios**

`database/migrations/add_dunning_v7.sql` (nuevo):

- Tabla `dunning_cron_runs` (id, ran_at, source, endpoint, status, reason, summary jsonb, is_test, duration_ms) con RLS restringido a superadmins e índices por `ran_at DESC`, `status`, `endpoint`.
- Columnas nuevas en `dunning_reminders`: `first_opened_at`, `last_opened_at`, `open_count`.

`services/admin-service/src/routes/dunning.js`:

- Helper `detectCronSource(req)`: distingue Vercel Cron (`x-vercel-cron` header) de disparos manuales.
- Helper `logCronRun(...)`: inserta una fila en `dunning_cron_runs` por cada llamada al cron (ok / skipped / error), sin tirar la ejecución si el log falla.
- `cronRunHandler` y `cronSyncPaidHandler`: envuelven la lógica ya existente y llaman a `logCronRun` en todas las ramas (system-disabled, not-scheduled, ran-recently, ok, error).
- Nuevo endpoint público `GET /dunning/track/open/:reminderId.gif`: sirve un GIF transparente 1×1 y registra `open_count += 1` + `first_opened_at` (si es la primera) + `last_opened_at`. Devuelve el pixel primero y actualiza después para no romper la carga si BD falla. Valida el UUID antes de tocar BD para no filtrar información.
- `executeSend`: pre-genera el `id` del reminder con `crypto.randomUUID()`, se lo pasa como `tracking_pixel_url` al renderer y usa ese mismo id al insertar la fila.
- Nuevos endpoints superadmin `GET /dunning/cron-runs` y `GET /dunning/reminders` (paginados, con filtros por status/endpoint y opción `include_test`).

`services/admin-service/src/lib/dunningEmailV2.js`:

- `renderDunningEmailV2` acepta un nuevo parámetro opcional `tracking_pixel_url` y, si viene, inyecta `<img src="{tracking_pixel_url}" width="1" height="1" .../>` justo antes de `</body>`.

`client/src/lib/api/dunning.ts`:

- Tipos nuevos `DunningCronRun`, `DunningReminderRow`. Ampliación de `DunningReminder` con `first_opened_at`, `last_opened_at`, `open_count`, `is_test`, `stripe_payment_url`.
- Métodos `listCronRuns()` y `listReminders()` en `dunningApi`.

`client/src/features/dunning/DunningConfig.tsx`:

- Nueva pestaña `history` con icono `Clock`.
- Componente `HistoryTab` compuesto por:
  - `CronRunsSection`: tabla con las últimas 100 ejecuciones. Columnas: fecha, origen (Vercel Cron / Manual), endpoint, estado (chip verde/amarillo/rojo), motivo o resumen (X enviados, Y fallidos), duración (ms) y botón "Detalle" que despliega el JSON de summary plegable.
  - `RemindersSection`: tabla con los últimos 200 recordatorios. Columnas: fecha, factura, cliente, nivel, destinatario (con badge `·PRUEBA` si aplica), estado (chip), **abierto** (verde con timestamp de primera apertura + contador si >1, gris "No" si no), y error si falló. Toggle "Incluir envíos de prueba".
- Ambas secciones con botón "Actualizar" (refetch) y su propia guía plegable en `TabGuide`.

`client/src/features/dunning/DunningGuide.tsx`:

- Añadido `'history'` al union type del prop `tab` de `TabGuide`.

`client/src/lib/changelog.ts`:

- Entrada `v1.48-impagos-historial-y-tracking`.

**Limitaciones del open tracking (documentadas en la propia UI)**

- Gmail y Outlook web → funciona bien (el proxy de imágenes de Google carga el pixel en cuanto el usuario abre el correo).
- Outlook desktop → funciona salvo que el usuario haya bloqueado descarga de imágenes.
- Apple Mail iOS 15+ / macOS → Mail Privacy Protection **pre-carga todos los pixels** aunque el usuario no abra el correo → falsos positivos "abierto".
- Clientes que bloquean imágenes por defecto → no se registra apertura aunque hayan leído.

Es orientativo, no auditoría. Sirve para señalar clientes que aparentemente no lo han visto (candidatos a reintento por otro canal) pero no vale como prueba legal.

**Migración a aplicar en Supabase**

`database/migrations/add_dunning_v7.sql` (aditiva, sin borrado).

---

### 2026-07-20 — Rama `fix/impagoscc`: CC, visibilidad total de vencidas, alertas y reporte

**Rama:** `fix/impagoscc` (creada desde `main`)

Bloque grande de mejoras sobre el módulo de Impagos. Cinco bloques funcionales independientes, todos aditivos. Se resumen aquí en orden lógico; cada uno con su migración numerada.

---

#### Bloque 1 — CC en los recordatorios (v8)

**Motivo:** los recordatorios de impago se enviaban solo al cliente. Se pedía poder añadir personas en copia visible (CC) — típicamente el gestor del cliente, el comercial que lleva la cuenta o administración interna.

**Migración `add_dunning_v8.sql`** — aditiva:
- `dunning_config.cc_emails text[]` → CC globales que aplican a todos los recordatorios.
- `dunning_email_overrides.override_cc_emails text[]` → CC específicos por cliente Holded (se suman a los globales, no los reemplazan).
- `dunning_reminders.cc_emails text[]` → snapshot del CC realmente enviado (auditoría).

**Backend (`services/admin-service/src/routes/dunning.js`):**
- Helper `sanitizeEmailList(input, excludeEmail)` — valida, deduplica y excluye la dirección destino para no dispararle dos copias.
- `executeSend`: calcula `ccList = globales + override` (deduplicado, excluyendo `destEmail`), lo inyecta en `nodemailer.sendMail({ cc })` y lo persiste en `dunning_reminders.cc_emails`.
- **Modo prueba:** el CC no se aplica (el email de test no debe copiar a terceros).
- `PUT /config`: validación de `cc_emails` — si alguna dirección no es válida devuelve `400 invalid-cc-emails`.
- `PUT /overrides/:contact_id`: idem con `override_cc_emails` → `400 invalid-override_cc_emails`.
- `preview-run` y `dry-run` devuelven el `cc` efectivo para que la UI lo enseñe antes de enviar.
- `GET /reminders` incluye `cc_emails` en el select.

**Frontend:**
- `client/src/lib/api/dunning.ts` — añadidos `cc_emails`, `override_cc_emails`, `cc?` en `RunResult`, `PlanItem.dest_cc?`, `DunningReminder.cc_emails?`.
- `client/src/features/dunning/DunningConfig.tsx`:
  - Componente `EmailListEditor` — chips con validación inline; Enter/coma/backspace para gestionar entradas; rechaza inválidos y duplicados sin romper el input.
  - **Reglas** → nueva sección "Copia visible (CC)" con `EmailListEditor` justo antes del BCC. Guía explicando la diferencia CC (visible) vs BCC (oculta).
  - **Overrides** → input CC en el alta + edición inline por fila (chips en la propia tabla, `updateCcMutation` con re-upsert conservando el resto de campos).
  - PreviewModal y RunResultsModal muestran los CC por envío.
  - Sección Historial → muestra los CC que llevó cada recordatorio (compacto: `email +N` si hay varios).

---

#### Bloque 2 — Visibilidad total de facturas vencidas + buscador

**Motivo:** en el módulo Impagos solo aparecían las facturas que ya estaban en algún nivel (≥5 días vencidas por defecto). Las de 1-4 días quedaban invisibles. Además faltaba filtrar por cliente.

**Backend:**
- `GET /overdue-invoices`: filtro cambiado de `if (daysOverdue < config.level_1_days_min)` a `if (daysOverdue < 1)`. Ahora aparecen todas las vencidas (≥1 día). Las que aún no llegan al nivel 1 se devuelven con `suggested_level: 0`.
- El motor de envío (`buildDunningPlan.decideAction`) sigue devolviendo `skip: not-overdue-enough` para nivel 0 → **no envía** recordatorios a esas facturas. Solo cambia la visibilidad.
- Cruce con `dunning_cases` ahora filtra `is_test=false`: los envíos de prueba no ensucian el `last_reminder_at` de la fila real. Consistente con los KPIs del dashboard que ya filtraban prueba.

**Frontend (`DunningDashboard.tsx`):**
- Buscador en el header de la tabla — filtro cliente por nombre, email o número de factura. Contador "X de Y facturas" cuando hay filtro activo.
- Badge "Sin nivel" (gris) para las de nivel 0 — ya lo pintaba `levelBadge(0)`, ahora sí llega a mostrarse.
- Nota nueva en el header aclarando que los envíos de prueba se ignoran.

**Consecuencia importante:** desaparece la contradicción "0 recordatorios enviados en KPI pero fila con último envío tal fecha". Los envíos de prueba siguen visibles en Configuración → Historial → Historial de envíos con el toggle "Incluir envíos de prueba".

---

#### Bloque 3 — Alerta cuando un cliente acumula ≥N facturas vencidas (v9, v10, v11)

**Motivo:** cuando un mismo cliente acumula varias facturas vencidas, hay que enterarse sí o sí antes de emitir la siguiente. Requisito del usuario: modal bloqueante en la app + email periódico.

**Migraciones**

- `add_dunning_v9.sql` — configuración de la alerta:
  - `dunning_config.multi_alert_enabled` bool (default true)
  - `multi_alert_threshold` smallint ≥2 (default 2)
  - `multi_alert_to` text
  - `multi_alert_cc_emails` text[]
  - `multi_alert_last_sent_at` timestamptz
  - `multi_alert_last_summary` jsonb

- `add_dunning_v10.sql` — historial + días de envío:
  - `multi_alert_send_days` smallint[] (default `{1}` = lunes)
  - Tabla `dunning_multi_alert_history` — snapshot diario por cliente que supere el umbral. Índice único `(contact_id, ran_date)` para idempotencia. Campos: `invoice_count`, `max_days_overdue`, `total_amount`, `currency`, `invoices` (jsonb), `email_sent`. RLS: solo superadmin.

- `add_dunning_v11.sql` — hora configurable:
  - `multi_alert_send_hour` smallint (0-23, default 9) — en la timezone del config.

**Backend**

Helpers:
- `computeMultiOverdueAlerts({ config })` — agrupa vencidas por contact_id y devuelve los que superan el umbral (>=2 por defecto), ordenados por count desc → total_amount desc.
- `renderMultiOverdueEmail({ alerts, threshold, appUrl })` — HTML con hero rojo, tabla de clientes (Cliente + email · Facturas · Deuda · Máx días) y CTA "Abrir módulo Impagos". Asunto sin corchetes: `Alerta de impagos · CARRER WORLD acumula 3 facturas` o `Alerta de impagos · 5 clientes con facturas vencidas pendientes`.
- `sendMultiOverdueEmail({ alerts, config, baseUrl })` — TO + CC; si TO vacío usa `ccList[0]` como TO y el resto como CC. Si TO+CC vacío → `no-recipients`.
- `currentTimeInTz(config)` — devuelve `{ weekday, hour }` en la zona horaria del config.
- `snapshotMultiOverdueAlerts({ alerts, emailSent })` — upsert por `(contact_id, ran_date)`, idempotente.
- `maybeDispatchMultiAlert({ config, baseUrl, force })` — orquesta: verifica `enabled` + `sendDays.includes(weekday)` + `hour === sendHour` + anti-spam 20h; si todo pasa, envía y actualiza `last_sent_at`. Con `force=true` (botón manual) ignora schedule y anti-spam.

Integración en el cron:
- `sync-paid` (diario 06:00 UTC) → **solo snapshot** del historial. No envía email.
- `run` (horario `0 * * * *`) → dispara `maybeDispatchMultiAlert` en cada tick, independiente del schedule de recordatorios y del `config.enabled` global. Su schedule propio: `multi_alert_send_days` + `multi_alert_send_hour`.

Endpoints REST:
- `GET /dunning/multi-overdue-alerts` — lista los clientes que superan el umbral ahora + `enabled` + `last_sent_at`. Consume el banner global y el preview de configuración.
- `POST /dunning/multi-overdue-alerts/send` — force=true. Envía + hace snapshot + actualiza timestamps.
- `GET /dunning/multi-overdue-history` — dos modos:
  - Sin `contact_id` → agregado por cliente/mes de los últimos N meses (parametrizable). Devuelve `clients[]` con `months_flagged`, `total_days_flagged`, `peak_invoice_count`, `peak_amount`, `months[]`.
  - Con `contact_id` → detalle día a día de ese cliente.

Validaciones en `PUT /config`:
- `multi_alert_cc_emails` inválidos → 400.
- `multi_alert_to` inválido → 400.
- `multi_alert_threshold < 2` → 400.
- `multi_alert_send_hour` fuera de [0, 23] → 400.

**Frontend**

Componente `client/src/features/dunning/MultiOverdueAlertBanner.tsx`:
- **Modal bloqueante** con overlay negro semi-transparente. Hero rojo con icono, tabla de clientes, totales y CTAs.
- Solo se pinta para `profile.role === 'superadmin'`.
- Al montar y en `visibilitychange`/`focus` revalida contra el endpoint.
- Cierre inmediato (estado local `dismissed=true`), persiste día natural local en `localStorage['dunning:multi-alert:hidden-until-day']`. No vuelve a salir hasta el día siguiente.
- Botón "Ir al módulo de impagos" navega y cierra a la vez. Texto pequeño avisando "Volverá a aparecer mañana si sigue habiendo alertas".

Se monta en `client/src/components/layout/Layout.tsx` justo después del Header. Aparece en TODA la app.

Configuración (`DunningConfig.tsx` → tarjeta `MultiAlertCard` en pestaña Reglas):
- Toggle enabled, umbral (min 2), TO (email), CC (`EmailListEditor`), días de la semana (chips), hora (0-23).
- Preview en vivo del estado actual (recalcular manual).
- Detección de cambios sin guardar (aviso azul) → botón muta a "Guardar y enviar" cuando hay cambios pendientes (guarda `updateConfig` primero y después dispara `sendMultiOverdueAlert`). Con esto se acabó el "no-recipients" por olvidar guardar.
- Editar el formulario limpia el resultado de la mutación anterior (evita mostrar mensajes obsoletos).
- Mensaje `no-recipients` reescrito en lenguaje humano en la UI.
- "Guardar alerta" desactivado si no hay cambios que guardar.

Nueva pestaña "Reincidentes":
- Componente `ReincidentsTab` en `DunningConfig.tsx`.
- Consulta `dunningApi.getMultiOverdueHistory({ months })` con ventana configurable (3/6/12/24 meses).
- Tabla por cliente: Meses afectados (badge coloreado: rojo si ≥3), Días acumulados, Pico facturas, Pico deuda, y una **línea de tiempo** con chips por mes (color según `max_invoice_count`, tooltip con detalle).
- Sirve para el cierre mensual: "antes de emitir la siguiente factura a X, mira lo que arrastra".

Tipos TS actualizados en `client/src/lib/api/dunning.ts`:
- `DunningConfig` extendido con los campos v9/v10/v11.
- Nuevas interfaces `MultiOverdueAlert`, `MultiOverdueSnapshot`, `MultiOverdueHistoryClient`.
- Métodos `listMultiOverdueAlerts`, `sendMultiOverdueAlert`, `getMultiOverdueHistory`, `getMultiOverdueContactHistory`.

---

#### Bloque 4 — Reporte periódico de facturas vencidas por email (v12)

**Motivo:** reemplazar el email semanal que salía por n8n con la relación de facturas vencidas. Se pedía que fuera igual pero con una columna extra que indique si a esa factura ya se le envió recordatorio.

**Migración `add_dunning_v12.sql`** — aditiva:
- `overdue_report_enabled` bool (default false)
- `overdue_report_to` text
- `overdue_report_cc_emails` text[]
- `overdue_report_send_days` smallint[] (default `{1}`)
- `overdue_report_send_hour` smallint (0-23, default 10)
- `overdue_report_last_sent_at` timestamptz
- `overdue_report_last_summary` jsonb

**Backend**

Helpers:
- `computeOverdueReport({ config })` — trae todas las vencidas de Holded (≥1 día), aplica filtros de min_amount y excluded_contact_ids, y las cruza con `dunning_reminders` (`status=sent`, `is_test=false`) para saber si ya se envió recordatorio real. Por invoice_id, guarda el último enviado (nivel + fecha).
- `renderOverdueReportEmail({ report, config, appUrl })`:
  - Header con título + fecha de corte.
  - Banda de KPIs en 4 columnas separadas por líneas verticales: Total facturas, Total deuda, Estado (críticos/warning), Con recordatorio (X/Y enviados).
  - Tabla densa (padding vertical 8px) con: Cliente, Nº Factura (mono), Emisión, Vencimiento (dd/mm/aa), Monto (tabular-nums), Días (20px, rojo si crítico, ámbar si warning), Estado (badge CRÍTICO rojo / WARNING ámbar), Recordatorio (✓ Sí · N1/N2/N3 en verde, o No en gris).
  - Zebra striping en las filas.
  - CTA "Abrir módulo Impagos →" como bloque propio.
  - Footer una línea con umbral crítico.
  - Asunto: `Relación de facturas vencidas · N pendientes · X €`.
- `sendOverdueReportEmail({ report, config, baseUrl })` — mismo patrón que la alerta: TO principal + CC; si TO vacío usa `ccList[0]`.
- `maybeDispatchOverdueReport({ config, baseUrl, force })` — verifica `overdue_report_enabled` + día + hora + anti-spam 20h. Si `total_count === 0` y no es `force`, skip con `no-overdue` (no molestar con "0 vencidas"). Con `force` (botón manual) ignora todos los checks.

Integración en el cron:
- El reporte se dispara en el cron `run` **después de `executeSend`** para que la columna "Recordatorio enviado" refleje lo que acaba de salir.
- **Importante:** también se dispara en los 3 caminos de skip del cron (system-disabled, not-scheduled, ran-recently) porque su schedule es 100% independiente del de recordatorios. Helper `dispatchReport()` centraliza la llamada, releyendo la config para evitar state stale.
- El cron `sync-paid` NO envía el reporte (evita doble disparo).

Endpoints REST:
- `GET /dunning/overdue-report/preview` — devuelve la data que se enviaría ahora (para orientar en la config sin gastar un email).
- `POST /dunning/overdue-report/send` — force=true. Ignora schedule y anti-spam.

Validaciones en `PUT /config`:
- `overdue_report_cc_emails` inválidos → 400.
- `overdue_report_to` inválido → 400.
- `overdue_report_send_hour` fuera de [0, 23] → 400.

**Frontend**

Tarjeta `OverdueReportCard` en pestaña Reglas (debajo de la alerta multi-vencida):
- Toggle enabled, TO, CC (`EmailListEditor`), días (chips), hora.
- Preview en vivo (`previewOverdueReport`).
- Botón "Guardar y enviar" con la misma mecánica de detección de cambios: si hay pendientes, guarda y envía; si no, solo envía. Mensajes de resultado en lenguaje humano.

Tipos TS: `DunningConfig` extendido, `OverdueReportRow`, `OverdueReportPreview`, métodos `previewOverdueReport`, `sendOverdueReport`.

---

#### Bloque 5 — Refactor del cron `run` para orquestar los 3 flujos

El `cronRunHandler` quedó con esta secuencia por tick horario:

1. Cargar config.
2. Disparar `maybeDispatchMultiAlert` (independiente).
3. Guards del sistema de recordatorios:
   - `!config.enabled` → skip (pero se dispara `dispatchReport` antes de responder).
   - `!isCronScheduledNow` → skip (idem).
   - `ran-recently` (<30 min) → skip (idem).
4. Si pasa los guards: `executeSend` (envío de recordatorios).
5. `dispatchReport()` — reporte de vencidas.
6. Log con `summary.multi_alert` y `summary.overdue_report`.

Esta arquitectura permite que los 3 flujos (alerta multi-vencida, recordatorios, reporte) tengan su propio schedule y su propio anti-spam sin acoplarse entre sí.

**Refactor menor de la respuesta del email de alerta multi-vencida:**
- Asunto sin corchetes, natural: `Alerta de impagos · N clientes con facturas vencidas pendientes`.

---

#### Bug fix: "Enviar alerta ahora" con no-recipients

**Síntoma:** el usuario rellenaba TO en pantalla, pulsaba "Enviar alerta ahora" y recibía "no-recipients" — porque el botón lee de BD y el TO no estaba guardado.

**Fix:** `MultiAlertCard` y `OverdueReportCard` detectan `hasUnsavedChanges` comparando el formulario contra `config` persistida. Si hay cambios, el `sendMutation` guarda con `updateConfig` primero (invalidando la query de config) y después llama al endpoint de envío. El botón cambia de "Enviar alerta ahora" a "Guardar y enviar" cuando hay cambios pendientes. Aviso azul explicando qué va a pasar. "Guardar alerta" desactivado si no hay diff. Editar el formulario limpia el resultado anterior de la mutación.

---

#### Iteraciones de diseño del email de reporte

Cinco commits sucesivos para llegar al equilibrio final:
1. Primera versión (funcional pero compacta).
2. `padding 18px` + KPIs con 4 bloques grandes de 26px → demasiado alto, mucho scroll.
3. Tipografías subidas a 15-20px + padding filas 14px → sigue demasiado alto.
4. Compacto extremo: KPIs en línea, padding 8px, letras 12.5-13px → muy denso, se pierde jerarquía.
5. **Versión final:** KPIs de vuelta separados en 4 columnas con líneas verticales pero tamaños medios (20px números principales, 14px mixtos, 11px etiquetas). Padding filas 8px (compacto). Días 14px con color según estado. Botón CTA "Abrir módulo Impagos" como bloque centrado propio. Footer una línea centrada. Tabla densa pero legible.

---

#### Archivos tocados en la rama

**Migraciones nuevas:**
- `database/migrations/add_dunning_v8.sql` — CC en recordatorios.
- `database/migrations/add_dunning_v9.sql` — config de alerta multi-vencida.
- `database/migrations/add_dunning_v10.sql` — días de envío + historial de alertas.
- `database/migrations/add_dunning_v11.sql` — hora configurable.
- `database/migrations/add_dunning_v12.sql` — reporte de vencidas.

**Backend:**
- `services/admin-service/src/routes/dunning.js` — todos los helpers, endpoints y cron.

**Frontend:**
- `client/src/lib/api/dunning.ts` — tipos y API.
- `client/src/features/dunning/DunningConfig.tsx` — `EmailListEditor`, `MultiAlertCard`, `OverdueReportCard`, `ReincidentsTab`, nueva pestaña "Reincidentes".
- `client/src/features/dunning/DunningDashboard.tsx` — buscador + limpieza de contradicción KPI/last_reminder.
- `client/src/features/dunning/MultiOverdueAlertBanner.tsx` (nuevo) — modal bloqueante con memoria diaria.
- `client/src/components/layout/Layout.tsx` — montaje global del banner.

---

#### Migraciones a aplicar en Supabase (por orden)

```sql
-- v8: CC en recordatorios
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE dunning_email_overrides
    ADD COLUMN IF NOT EXISTS override_cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE dunning_reminders
    ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];

-- v9: alerta multi-vencida
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_enabled       boolean       NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS multi_alert_threshold     smallint      NOT NULL DEFAULT 2 CHECK (multi_alert_threshold >= 2),
    ADD COLUMN IF NOT EXISTS multi_alert_to            text,
    ADD COLUMN IF NOT EXISTS multi_alert_cc_emails     text[]        NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS multi_alert_last_sent_at  timestamptz,
    ADD COLUMN IF NOT EXISTS multi_alert_last_summary  jsonb         NOT NULL DEFAULT '{}'::jsonb;

-- v10: días + historial
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_send_days smallint[] NOT NULL DEFAULT ARRAY[1];
-- (+ tabla dunning_multi_alert_history con RLS — ver archivo)

-- v11: hora
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_send_hour smallint NOT NULL DEFAULT 9
        CHECK (multi_alert_send_hour BETWEEN 0 AND 23);

-- v12: reporte de vencidas
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS overdue_report_enabled        boolean       NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS overdue_report_to             text,
    ADD COLUMN IF NOT EXISTS overdue_report_cc_emails      text[]        NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS overdue_report_send_days      smallint[]    NOT NULL DEFAULT ARRAY[1],
    ADD COLUMN IF NOT EXISTS overdue_report_send_hour      smallint      NOT NULL DEFAULT 10
        CHECK (overdue_report_send_hour BETWEEN 0 AND 23),
    ADD COLUMN IF NOT EXISTS overdue_report_last_sent_at   timestamptz,
    ADD COLUMN IF NOT EXISTS overdue_report_last_summary   jsonb         NOT NULL DEFAULT '{}'::jsonb;
```

Todas las migraciones son aditivas — se pueden aplicar en cualquier orden sin perder datos. Consultar los archivos v8-v12 en `database/migrations/` para el SQL completo con RLS y índices.

---

### 2026-07-20 — Rama `fix/impagosnoenviadas`: bugs post-despliegue de `fix/impagoscc`

**Rama:** `fix/impagosnoenviadas` (creada desde `main` tras el merge de `fix/impagoscc`)

Dos bugs detectados en producción y una mejora transversal de UX. Sin migraciones nuevas.

---

#### Bug 1 — El motor no enviaba a facturas que solo tenían recordatorios de prueba

**Síntoma:** de 14 facturas vencidas, solo se enviaron 4. Las 10 de N3 con más días vencidas (66, 66, 56, 35×6, 25 días) quedaron en `will_skip: 10` sin motivo visible en el summary. En el dashboard aparecían con "0 recordatorios / Nunca".

**Causa raíz:** `buildDunningPlan` en `services/admin-service/src/lib/dunningWorker.js` cargaba **todos** los `dunning_reminders` sin filtrar `is_test`. `decideAction` los usaba para decidir si ya se había avisado a esa factura y devolvía `level-3-already-sent` o `waiting-repeat-X/7`. Como el usuario había probado el sistema en modo prueba anteriormente, esas facturas tenían recordatorios fantasma con `is_test=true` que bloqueaban el envío real.

Es exactamente el mismo bug que arregló `fix/impagoscc` para el dashboard de Impagos (endpoint `/overdue-invoices` cruzaba con casos `is_test=true`), pero el motor de envío seguía con la fuga.

**Fix:**

- `dunningWorker.js:103-113`: añadido `.eq('is_test', false)` al select de reminders en `buildDunningPlan`. Los envíos de prueba dejan de contar para decisiones reales.
- Comentario nuevo explicando la razón: si el usuario prueba el sistema en modo prueba, esos reminders quedan con `is_test=true` en BD y NO deben bloquear el envío real del cron.

**Consecuencia:** tras desplegar, la próxima ejecución del cron `run` a la hora configurada considera esas 10 facturas como "primera vez" (porque no tienen ningún reminder real) y les envía el nivel correspondiente.

---

#### Bug 2 — El envío manual bloqueaba el envío automático de las siguientes 20h

**Síntoma:** el reporte periódico de facturas vencidas nunca se envía automáticamente. Manualmente sí funciona. Igual con la alerta multi-vencida.

**Causa raíz:** el endpoint `POST /overdue-report/send` (envío manual) actualizaba `overdue_report_last_sent_at` con el timestamp actual. `maybeDispatchOverdueReport` tiene anti-spam de 20h leyendo ese campo. Resultado: cualquier envío manual (típicamente para probar destinatarios) bloqueaba el próximo envío automático dentro de la ventana de 20h — 22:53 del día anterior + 09:00 del día siguiente = ~10h de diferencia → `sent-recently` skip.

Idéntico bug para `multi_alert_last_sent_at` en el endpoint `POST /multi-overdue-alerts/send`.

**Fix:**

- `maybeDispatchOverdueReport` y `maybeDispatchMultiAlert`: ya no actualizan `*_last_sent_at` cuando se llaman con `force=true`. Solo los envíos automáticos del cron tocan ese campo — el anti-spam solo cuenta ejecuciones programadas.
- Endpoint `POST /multi-overdue-alerts/send`: refactor. En lugar de llamar directamente a `sendMultiOverdueEmail` + duplicar el `update`, ahora pasa por `maybeDispatchMultiAlert({ force: true })`. Con eso el snapshot del histórico se registra igual y el `last_sent_at` no se contamina.
- Endpoint `POST /overdue-report/send`: ya usaba `maybeDispatchOverdueReport({ force: true })` — solo necesitaba el fix del helper.

**Consecuencia:** puedes disparar los envíos manuales todas las veces que quieras sin bloquear los automáticos. `last_sent_at` refleja solo la última ejecución programada, que es lo que el anti-spam necesita.

---

#### Mejora — Feedback estándar de guardado en todos los formularios de config

**Motivo:** al pulsar "Guardar" en cualquier sección de la configuración de Impagos no había manera de saber si el guardado había funcionado. Solo el spinner del botón cuando estaba en curso.

**Solución:** nuevo componente `SaveIndicator` reutilizable en `DunningConfig.tsx`:

- Recibe `status: 'idle' | 'pending' | 'success' | 'error'` y opcionalmente un `error` y un `successLabel`.
- Pinta:
  - `'Guardando…'` con spinner (persistente mientras dura la mutación).
  - `'<successLabel> ✓'` en verde con auto-hide de 3s tras éxito.
  - `'Error: <mensaje>'` en rojo, persistente hasta que se reintente.

**Refactor:** eliminado el `saveMutation` centralizado de `DunningConfig`. Cada tarjeta con botón "Guardar" ahora gestiona su propia mutación local con `queryClient.invalidateQueries` en el éxito y renderiza el `SaveIndicator` a la izquierda del botón.

Tarjetas cubiertas y su etiqueta de éxito:

| Tarjeta | Etiqueta |
|---|---|
| `RulesTab` | "Reglas guardadas" |
| `ScheduleTab` | "Programación guardada" (reemplaza el `justSaved` local antiguo) |
| `BrandTab` | "Marca guardada" |
| `TemplateEditorV2` | "Plantilla guardada" |
| `MultiAlertCard` | "Alerta guardada" |
| `OverdueReportCard` | "Reporte guardado" |

**Ventaja lateral:** el feedback siempre aparece en el contexto de lo que se acaba de guardar. Antes, si guardabas en "Reglas" y navegabas a "Programación", no había garantía de que el estado del mutation no interfiriera. Ahora cada tarjeta es su propia isla.

---

#### Transparencia — Ver qué facturas se descartaron y por qué

**Motivo:** cuando el resultado del cron dice `will_send: 4, will_skip: 10`, el usuario no puede saber por qué se saltaron 10 sin bajar a los logs de Vercel.

**Cambios:**

- `executeSend` en `dunning.js` devuelve un nuevo campo `plan_skipped[]` con cada factura descartada por el motor: `{ invoice_id, invoice_number, contact_name, level, days_overdue, reason }`. Antes solo llegaba el conteo agregado.
- `logCronRun` persiste el array completo en `dunning_cron_runs.summary.plan_skipped` — visible en Configuración → Historial → detalle de la ejecución.
- El endpoint `POST /dunning/run` devuelve `plan_skipped` en el body.
- Frontend: `RunResult` y `PlanSkipItem` añadidos a `client/src/lib/api/dunning.ts`.
- `RunResultsModal` renderiza dos tablas:
  1. **"Procesadas"** — las que se intentaron enviar (sent / failed / would-send / skipped).
  2. **"Descartadas antes de enviar"** — las que el motor decidió no enviar en esta ejecución, con motivo humanizado por `humanizeReason` (`level-3-already-sent`, `waiting-repeat-3/7`, `no-email`, `already-paid`, etc).

Con esto ya no queda duda de por qué se envían N de M en cada tick.

---

#### Archivos tocados

**Backend:**
- `services/admin-service/src/lib/dunningWorker.js` — filtro `is_test=false` en el select de reminders.
- `services/admin-service/src/routes/dunning.js` — `plan_skipped` en `executeSend` + log; refactor de `maybeDispatchOverdueReport` y `maybeDispatchMultiAlert` para no tocar `last_sent_at` en `force=true`; endpoint `/multi-overdue-alerts/send` delega en el helper.

**Frontend:**
- `client/src/lib/api/dunning.ts` — nueva interface `PlanSkipItem`; retorno de `run` incluye `plan_skipped`.
- `client/src/features/dunning/DunningConfig.tsx` — componente `SaveIndicator`; refactor de RulesTab / ScheduleTab / BrandTab / TemplateEditorV2 / MultiAlertCard / OverdueReportCard con mutación local + feedback; `RunResultsModal` con dos tablas.

Sin cambios de BD. Los deploys aplican los fixes al próximo tick del cron horario.

