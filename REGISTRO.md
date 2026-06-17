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

---

## Notas
- El archivo `.env` NO está commiteado en git (está en `.gitignore`). Las credenciales se comparten por canal seguro.
- La tabla `change_log` fue creada directamente en Supabase. Si se recrea la base de datos, ejecutar `database/change_log.sql`.
- El commissions-service tiene su propia copia de `changeLogger.js` porque es un proceso Node.js independiente (puerto 3012) con su propio árbol de imports.
- **Patrón "nueva columna en Billing Matrix → fila P&L existente":** crear servicio en BD (`services` + `service_year_assignments`), añadir `getSvc('CODE')` al array del depto en `MatrixGrid.tsx`, y añadir entrada al `serviceMapping` de `pl.js`. La fila destino en P&L ya debe existir en `REVENUE_STRUCTURE` y en `revenueData` (línea 471 de pl.js).
- **Helper `calculateGroupCost(valuesMap)` en DepartmentPL.tsx:** usar siempre que se quiera obtener la cuota de Immoral % de un depto, ya sea para datos Real o Presupuesto. Pasar `compRealValues` o `compBudgetValues` según el caso.
