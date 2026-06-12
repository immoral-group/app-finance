# AUDIT-REPORT — app-finance

- Fecha: 2026-06-12
- Modo: AUDITORIA (solo lectura de código; no se ha tocado código ni configuración)
- Rama auditada: `claude/stoic-fermi-lk5a17` (= `origin/main`, commit `50b96d2`)
- Auditor: Claude (claude-fable-5), 4 pasadas paralelas: seguridad backend, frontend, correctitud docs↔código, dependencias/git/higiene

---

## Resumen de contexto (Fase 0)

- **Tipo de proyecto**: híbrido **web-app / api** (checklist de seguridad web-app/api aplicado). App interna de gestión financiera de Immoral.
- **Stack**: monorepo npm workspaces. Frontend React 19 + Vite 7 + TypeScript (`client/`, ~24,5k líneas). Backend: 4 microservicios Express (`services/{admin,billing,payroll,commissions}-service`) + `services/shared` (muerto). BD: Supabase/PostgreSQL con `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS). Pagos: Stripe + Holded. Email: SMTP/nodemailer.
- **Despliegue real**: Vercel serverless — `api/*/index.js` envuelve cada app Express y `vercel.json` enruta `/api/{admin,billing,payroll,commissions}`. El README describe en cambio 3 procesos locales en puertos 3010-3012 y el docker-compose un mundo que ya no existe.
- **Tests**: **cero** en todo el repo (ni unitarios, ni integración). **CI**: inexistente (`.github/workflows` no existe). El "contrato" del proyecto son README/REGISTRO.md/docs, hoy desactualizados.
- **Build**: el cliente compila (`tsc -b && vite build` OK); los 4 servicios pasan `node --check`. ESLint en rojo (251 errores).
- **Estado declarado vs percibido**: el README declara backend "COMPLETO" y frontend "pendiente"; la realidad es la inversa en madurez aparente — frontend grande y en producción, backend funcional pero **casi totalmente abierto al público** (sin auth) usando la clave que ignora RLS.
- **Hallazgo dominante**: la clave `service_role` real está commiteada en dos scripts, y el admin-service expone ~24 routers (pagos Stripe, usuarios, API keys) sin autenticación.

---

## Resumen ejecutivo

| Severidad | Nº gaps |
|---|---|
| 🔴 Crítico | 8 |
| 🟠 Alto | 14 |
| 🟡 Medio | 8 |
| ⚪ Bajo | 4 |
| **Total** | **34** |

**Los 3 riesgos más urgentes:**

1. **Clave `service_role` de Supabase commiteada** en `services/admin-service/wipe_expenses.mjs:4` e `inspect_cats.mjs:2` (proyecto `vhfdxyzobwjbfvhhqnbx.supabase.co`, exp. 2085). Cualquiera con acceso al repo tiene acceso total de lectura/escritura a la BD de producción, ignorando RLS. **Rotar la clave hoy** (GAP-01 / REPAIR-01).
2. **El admin-service no exige autenticación** en ~24 de sus 26 routers (`services/admin-service/src/index.js:43-83`): se pueden crear payment links de Stripe reales, crear/borrar usuarios y — lo peor — **fabricar API keys con scope `*` sin autenticarse** (`routes/developers.js:88`), lo que neutraliza el único gateway protegido que existe (GAP-02/03/04).
3. **Contraseñas de usuarios almacenadas en claro** en la columna `raw_password` de `user_profiles` (`routes/users.js:198,297`), expuestas además por `GET /users` (`select('*')`) que tampoco exige auth (GAP-05).

**Lo que está bien** (para calibrar): firma del webhook Stripe verificada correctamente; sin SQL crudo interpolado (RPC parametrizado); validación Joi en buena parte de billing/expenses/payroll/commissions; API keys hasheadas SHA-256; sin `.env` real trackeado; el cliente no accede a Supabase directamente (todo pasa por la API con Bearer); build del cliente verde; 0 TODO/FIXME abandonados.

---

## Tabla de gaps

Dimensiones: A correctitud · B arquitectura · C calidad · D tests · E convenciones · F seguridad · G dependencias/config · H git/entregabilidad.

| ID | Sev | Dim | Gap | Evidencia | Ficha |
|---|---|---|---|---|---|
| GAP-01 | 🔴 | F/H | Clave `service_role` real commiteada en dos scripts; `wipe_expenses.mjs` además es destructivo sin salvaguardas (borra `pl_custom_rows` de producción al ejecutarse) | `services/admin-service/wipe_expenses.mjs:4`, `inspect_cats.mjs:2` | REPAIR-01, REPAIR-02 |
| GAP-02 | 🔴 | F | Admin-service sin middleware de auth global: ~24 routers abiertos (`/billing`, `/expenses`, `/pl`, `/payments`, `/users`, `/payment-links`, `/integrations`, `/developers`, `/settings`…). Solo `/api` (gateway API-key) y handlers puntuales (`users.js:11-21`, `messages.js:23`, `notifications.js:20`) validan token | `services/admin-service/src/index.js:43-83` | REPAIR-03 |
| GAP-03 | 🔴 | F | CRUD de API keys sin auth: cualquiera crea una key con scope `*` y entra por el gateway | `routes/developers.js:60,88,135,165` | REPAIR-03 |
| GAP-04 | 🔴 | F | Creación de payment links Stripe y envío de emails sin auth; gestión de usuarios (crear/editar/borrar vía `supabase.auth.admin`) sin auth | `routes/payment-links.js:102,172,275`; `routes/users.js:162,272,362` | REPAIR-03 |
| GAP-05 | 🔴 | F | Contraseñas en claro en BD (`raw_password` en `user_profiles`), expuestas por `GET /users` con `select('*')` | `routes/users.js:198,297,129` | REPAIR-05 |
| GAP-06 | 🔴 | F | Rate limiting inexistente en todo el repo (creación de usuarios, API keys, payment links, envío de emails) | grep `rate-limit|rateLimit` → 0 resultados | REPAIR-04 |
| GAP-07 | 🔴 | G | `npm audit`: 19 vulnerabilidades — 1 crítica (`shell-quote`), 9 high (`vite` path traversal, `path-to-regexp` ReDoS, `lodash`…), 9 moderate | salida `npm audit` raíz | REPAIR-07 |
| GAP-08 | 🔴 | A | Hooks de React condicionales: `useState` tras early-return en UserManagement (crash potencial "Rendered more hooks" para superadmin) y `useMemo` condicional en ImsalesBilling | `client/src/features/.../UserManagement.tsx:192,203`; `ImsalesBilling.tsx:193`; ESLint `rules-of-hooks` | REPAIR-06 |
| GAP-09 | 🟠 | F | CORS: `cors()` abierto en admin y billing; `origin: FRONTEND_URL \|\| '*'` + `credentials: true` en payroll/commissions | `admin .../index.js:43`; `billing .../index.js:16`; `payroll .../index.js:20`; `commissions .../index.js:20` | REPAIR-08 |
| GAP-10 | 🟠 | F/G | Helmet ausente en admin-service (el más sensible); `helmet`, `morgan` y `pg` declarados y nunca importados en admin | `services/admin-service/src/index.js`; `package.json:25,28,31`; grep → 0 usos | REPAIR-08 |
| GAP-11 | 🟠 | F | Fuga de `err.message` (y `error.details` de Joi) al cliente: patrón generalizado, 168 ocurrencias en 49 archivos; payroll sí lo condiciona a development (`payroll .../index.js:78`), admin no | `payment-links.js:166`; `users.js:157,283`; `billing-service/src/index.js:39-43`; `events.js:52` | REPAIR-09 |
| GAP-12 | 🟠 | F | Webhook Stripe sin idempotencia: reintentos de Stripe re-disparan email y `POST /pay` a Holded (riesgo de doble marca de pago) | `routes/webhooks.js:80-120` | REPAIR-10 |
| GAP-13 | 🟠 | F | Autorización por rol solo cosmética en el cliente: `/payments`, `/fees`, `/payroll`, `/expenses`, `/payments/generate-link` accesibles por URL a cualquier usuario autenticado (sin `isSuperAdmin/hasPermission` en esas vistas); guard solo en Sidebar | `client/src/App.tsx:60-82`; `Sidebar.tsx:216-223`; ausencia verificada en `Payments.tsx`, `FeeConfiguration.tsx`, `GeneratePaymentLink.tsx`, `Payroll.tsx`, `Expenses.tsx` | REPAIR-20 |
| GAP-14 | 🟠 | G | `.env.example` no refleja lo que el código lee: admin omite 14 vars (SMTP_*, STRIPE_*, HOLDED_*, OPENAI/GEMINI, CLICKUP, APP_URL…); commissions omite 7; payroll omite `FRONTEND_URL`; no existe `client/.env.example` (VITE_* sin documentar, `envDir: '../'` no documentado) | `services/*/.env.example` vs grep `process.env`; `client/vite.config.ts:7`; `client/src/lib/supabase.ts:3-4` | REPAIR-11 |
| GAP-15 | 🔴 | H | `docker-compose.yml` inutilizable: builds de `services/expenses-service`, `services/periods-service` y `./frontend` que no existen; puertos 3001-3005 contradicen README y `.env.example`; 5 vars `VITE_*_SERVICE_URL` que ningún código lee | `docker-compose.yml` (builds, puertos, líneas 88-92) | REPAIR-12 |
| GAP-16 | 🔴 | H | Tres guías SQL contradictorias (README v2 / SETUP_GUIDE sin `functions_v2` / database/README aún en v1) y ~28 migraciones (9 `migration_*` sueltas, `database/migrations/`, `scripts/07-14`) sin orden de aplicación documentado; montar la BD desde cero con cualquier guía deja un schema incompleto para el código actual (p. ej. payment links, notifications, api_keys) | `README.md:181-195`; `database/SETUP_GUIDE.md`; `database/README.md`; inventario de `database/` y `scripts/` | REPAIR-13 |
| GAP-17 | 🟠 | A/H | README raíz desfasado: 3 microservicios de 4 (billing-service y capa Vercel invisibles), frontend marcado "[ ] pendiente" cuando está en producción, estructura de directorios y estado del proyecto obsoletos, ~15 endpoints documentados de >150 reales | `README.md:3,15-19,269-314,334-338` | REPAIR-14 |
| GAP-18 | 🟠 | H/F | Datos comerciales reales commiteados: clientes y cifras de facturación reales en `debug_table.txt`, `compare_output.txt`, `debug_paid_output.txt`; UUIDs y nombres de empleados en `mappings.txt`; volcados `service_check_output.json` y `services_dump.txt` en raíz | `services/admin-service/*.txt`; raíz del repo | REPAIR-02 |
| GAP-19 | 🟠 | B | billing-service: servicio fantasma — desplegado vía `vercel.json` y `api/billing/index.js` pero con 0 consumidores (la constante `BILLING` de `client.ts:7` no se usa); modelo de facturación paralelo (contratos+ledger) abandonado al implementarse la billing matrix en admin | `vercel.json:10-11`; `api/billing/index.js`; grep en `client/src` → 0 usos | REPAIR-16 |
| GAP-20 | 🟠 | B/C | `services/shared` es código muerto (0 imports; no declarado como dependencia; `install:all` no lo instala); `ledger.js` duplicado casi línea a línea con `billing-service/src/services/ledgerService.js`; `config/supabase.js` duplicado en los 4 servicios con `dotenv.config({path:'../../.env'})` frágil | `services/shared/*`; grep imports → 0; 4× `src/config/supabase.js` | REPAIR-17 |
| GAP-21 | 🟠 | G/H | Workspace desincronizado: 3 ficheros de `node_modules/` trackeados; lockfiles redundantes por servicio (admin, commissions, payroll) además del de la raíz; `install:all` ignora workspaces | `git ls-files \| grep node_modules` → 3; 5 lockfiles | REPAIR-18 |
| GAP-22 | 🟠 | G | Versión de Node sin fijar: sin `engines`, sin `.nvmrc`, `vercel.json` sin runtime | grep `engines` → 0; `vercel.json:1-24` | REPAIR-19 |
| GAP-23 | 🟠 | H | `client/public/login-bg.mp4` de 12,8 MB trackeado (≈ todo el peso del repo) | `git ls-files` + `du` | REPAIR-23 |
| GAP-24 | 🟠 | H | REGISTRO.md (diario de la rama `feat/updatebillingandapp`) desactualizado: payment links, notificaciones email y onboarding tour (commits jun-2026) sin registrar; "Pendientes" de abril sin cierre confirmado | `REGISTRO.md:1-7`; grep payment.link/onboarding → 0 | REPAIR-15 |
| GAP-25 | 🟠 | B/C | Archivos-Dios en el cliente: `DepartmentPL.tsx` 2.426 líneas, `PLMatrix.tsx` 1.679, `Dashboard.tsx` 1.086, `MatrixGrid.tsx` 1.032; `NutfruitBudget.tsx`/`IcexBudget.tsx` ~88 % duplicados (diff 46 líneas) | `client/src/features/...` | REPAIR-21 |
| GAP-26 | 🟠 | A | Promesa "React PWA" a medias falsa: manifest válido pero sin service worker (sin offline/caché); bundle único de 2.031 kB sin code-splitting | `index.html:8`; grep SW → 0; salida `vite build` | REPAIR-14 (doc) |
| GAP-27 | 🟡 | F | Primer usuario sin perfil se auto-crea como `superadmin` con todos los permisos | `routes/users.js:40,62-69` | REPAIR-03 (ADR-2) |
| GAP-28 | 🟡 | F | Validación desigual: `POST /payment-links/from-invoice` sin check de `amount_cents > 0` (sí existe en `/manual:189`); `POST /users` sin validar formato de email/contraseña | `payment-links.js:102-120`; `users.js:162` | REPAIR-04 |
| GAP-29 | 🟡 | F | PII en logs: email de destinatario y payloads completos | `commissions .../payment-requests.js:53`; `routes/pl.js:812` | REPAIR-22 |
| GAP-30 | 🟡 | C | Código muerto en cliente: `PLReport.tsx` (178 líneas), `BillingTable.tsx` (170, contiene 2 de los 4 errores rules-of-hooks), `ProgressBar.tsx` (30) — 0 importadores | grep importadores → 0 | REPAIR-21 |
| GAP-31 | 🟡 | A | Fallback silencioso `https://placeholder.supabase.co` enmascara una build mal configurada (solo `console.warn`) | `client/src/lib/supabase.ts:6-12` | REPAIR-22 |
| GAP-32 | 🟡 | D/E | Sin tests (0 archivos test en el repo) y sin CI; ESLint en rojo: 251 errores / 34 warnings (198 `no-explicit-any`, 34 `exhaustive-deps`) | `find` tests → 0; `.github/workflows` inexistente; `npm run lint` exit 1 | REPAIR-24 |
| GAP-33 | 🟡 | H | 30 ramas remotas vivas presumiblemente ya mergeadas, sin podar | `git branch -r` | (operativa; sin ficha — ver nota) |
| GAP-34 | ⚪ | G/C | Menores: `nodemailer` ^8.0.10 vs ^8.0.3 entre servicios; ~10 fetch crudos sin `response.ok` en `AIChatWidget.tsx` (129-400, `.catch(()=>{})` en 309); ~30 scripts ad-hoc de debug en `services/admin-service/scripts/`; deps desfasadas (supabase-js servicios ^2.39 vs 2.108, express 4 vs 5) | citados | REPAIR-22 / backlog |

**Sospechas (sin evidencia suficiente — NO son hallazgos):**
- Las RLS policies (`rls_policies_v2.sql`) podrían estar desalineadas con los roles que el código usa hoy (superadmin/partner…); como los servicios usan service_role, RLS no se ejercita y no se puede verificar sin acceso a la instancia Supabase.
- REGISTRO.md (sesión 2026-04-27) lista 2 SQL "por ejecutar en Supabase"; no es verificable desde el repo si se aplicaron.
- El secreto `service_role` filtrado podría estar también en forks/clones locales: la rotación (REPAIR-01) es la única mitigación real.

**Nota sobre GAP-33**: la poda de ramas remotas es una acción operativa de GitHub (no de código); se deja anotada para el administrador del repo en lugar de generar ficha.
