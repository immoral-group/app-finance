# REPAIR-PLAN — app-finance

- Fecha: 2026-06-12 · Generado en MODO AUDITORIA sobre `50b96d2` (`claude/stoic-fermi-lk5a17` = `origin/main`)
- Cada ficha es autocontenida: un agente ejecutor puede aplicarla leyendo solo la ficha.
- Tipos: **(a) fix directo** · **(b) requiere diseño previo** (ADR adjunto al final; necesita visto bueno humano antes de ejecutar).

## Olas de ejecución

| Ola | Fichas | Tema |
|---|---|---|
| 0 — inmediata (hoy) | 01, 02 | Secreto filtrado y datos sensibles en el repo |
| 1 — seguridad crítica | 03 (b), 04, 05 (b), 06, 07 | Auth, rate limiting, contraseñas, crash de UI, vulnerabilidades |
| 2 — hardening y config | 08, 09, 10, 11, 18, 19 | CORS/helmet, errores, idempotencia, env, workspace, Node |
| 3 — entregabilidad y docs | 12 (b), 13, 14, 15 | docker-compose, guía SQL, README, REGISTRO |
| 4 — arquitectura y limpieza | 16 (b), 17, 20, 21, 22, 23, 24 | billing-service, shared, guards UI, código muerto, tests/CI |

Dentro de cada ola las fichas son independientes salvo `depende_de` explícito.

---

### REPAIR-01 — Rotar la clave service_role de Supabase filtrada
- severidad: 🔴
- dimension: F
- tipo: (a) fix directo — **operativo, manual, fuera del repo**
- origen: seguridad: "Secretos y credenciales fuera del código y del historial de git"
- evidencia: `services/admin-service/wipe_expenses.mjs:4` y `services/admin-service/inspect_cats.mjs:2` contienen el JWT `service_role` completo del proyecto `vhfdxyzobwjbfvhhqnbx.supabase.co` (exp. 2085)
- causa_raiz: scripts de debugging ad-hoc creados con la clave pegada en duro y commiteados.
- accion: Rota la clave `service_role` en Supabase y actualiza todos los lugares donde se consume la antigua.
- archivos_a_tocar: [] (Supabase Dashboard + variables de entorno de Vercel; ningún archivo del repo)
- pasos:
    1. En Supabase Dashboard → Settings → API, regenera la `service_role` key del proyecto `vhfdxyzobwjbfvhhqnbx`.
    2. Actualiza `SUPABASE_SERVICE_ROLE_KEY` en las variables de entorno de Vercel (producción y preview) y en los `.env` locales del equipo.
    3. Redeploy de Vercel y verificación de que la app sigue funcionando (login + carga de billing matrix).
    4. Revisa en Supabase los logs de acceso recientes por si hubo uso no reconocido de la clave antigua.
- definicion_de_done: la clave antigua (la que figura en `wipe_expenses.mjs:4` del commit `50b96d2`) devuelve 401 al usarla contra `https://vhfdxyzobwjbfvhhqnbx.supabase.co/rest/v1/` y la app desplegada responde con normalidad.
- depende_de: []
- riesgo_regresion: si algún consumidor externo (scripts de equipo, integraciones, MCP) usa la clave antigua, dejará de funcionar — inventariar consumidores antes de rotar.

### REPAIR-02 — Eliminar del repo secretos, script destructivo y volcados con datos reales
- severidad: 🔴
- dimension: F/H
- tipo: (a) fix directo (la purga del historial es aparte: ver ADR-1)
- origen: seguridad: "Secretos fuera del repo"; "Logging sin PII"
- evidencia: `services/admin-service/wipe_expenses.mjs` (clave + borra `pl_custom_rows` de producción sin confirmación al ejecutarse), `inspect_cats.mjs` (clave), `debug_table.txt`/`compare_output.txt`/`debug_paid_output.txt` (clientes y cifras de facturación reales), `mappings.txt` (UUIDs + nombres de empleados), `service_check_output.json` y `services_dump.txt` (raíz)
- causa_raiz: artefactos de sesiones de debugging commiteados sin criba.
- accion: Borra del árbol de trabajo los 8 archivos listados y añade patrones a `.gitignore` para que no vuelvan.
- archivos_a_tocar: [services/admin-service/wipe_expenses.mjs, services/admin-service/inspect_cats.mjs, services/admin-service/debug_table.txt, services/admin-service/compare_output.txt, services/admin-service/debug_paid_output.txt, services/admin-service/mappings.txt, service_check_output.json, services_dump.txt, .gitignore]
- pasos:
    1. `git rm` de los 8 archivos.
    2. Añade a `.gitignore` raíz: `*_output.txt`, `*_dump.txt`, `debug_*.txt`, `*.output.json`.
    3. Revisa `services/admin-service/scripts/` y confirma (grep de `eyJ`) que ningún otro script contiene claves; no borres esos scripts en esta ficha.
    4. Commit con mensaje claro de retirada de artefactos sensibles.
- definicion_de_done: `git ls-files | grep -E 'wipe_expenses|inspect_cats|debug_table|compare_output|debug_paid_output|mappings.txt|service_check_output|services_dump'` devuelve vacío y `grep -rE 'eyJ[A-Za-z0-9_-]{40,}' --exclude-dir=node_modules .` sobre archivos trackeados devuelve 0 claves reales.
- depende_de: [REPAIR-01]
- riesgo_regresion: ninguno funcional (nada importa estos archivos). El historial de git sigue conteniendo la clave → ADR-1 decide si se purga; la rotación de REPAIR-01 es la mitigación efectiva.

### REPAIR-03 — Middleware de autenticación global en admin-service
- severidad: 🔴
- dimension: F
- tipo: **(b) requiere diseño previo — ver ADR-2**
- origen: seguridad: "Autenticación... correcta" y "Autorización efectiva en cada recurso"
- evidencia: `services/admin-service/src/index.js:43-83` monta ~24 routers sin auth; `routes/developers.js:60,88,135,165` (CRUD de API keys abierto → key con scope `*` sin autenticarse); `routes/payment-links.js:102,172,275` (sesiones de cobro Stripe y emails sin auth); `routes/users.js:162,272,362` (alta/edición/borrado de usuarios sin auth); `routes/users.js:40,62-69` (primer usuario sin perfil se auto-promociona a `superadmin`); `changeLogger.js:17` decodifica JWT sin verificar firma
- causa_raiz: la auth se añadió por handler en algunas rutas nuevas (users/messages/notifications) y nunca se generalizó; el servicio opera con service_role key que bypassa RLS, así que no hay segunda barrera.
- accion: Implementa el middleware global descrito en la opción recomendada del ADR-2 (verificación de JWT de Supabase + comprobación de rol, con lista blanca explícita de rutas públicas) y aplícalo antes de montar los routers.
- archivos_a_tocar: [services/admin-service/src/index.js, services/admin-service/src/middleware/auth.js (nuevo), services/admin-service/src/routes/developers.js, services/admin-service/src/routes/users.js, services/admin-service/src/utils/changeLogger.js]
- pasos:
    1. Crea `middleware/auth.js`: extrae Bearer, valida con `supabase.auth.getUser(token)`, carga `user_profiles.role`, adjunta `req.user`; 401 si falta/expira.
    2. En `index.js`, aplica el middleware a TODAS las rutas excepto: `GET /health`, `POST /webhooks/stripe` (firma propia), la página pública de payment link si existe (verificar cuál usa el pagador), y `/api/*` (gateway por API key ya existente).
    3. Añade comprobación de rol en routers de alto privilegio: `/users`, `/developers`, `/settings`, `/payment-links`, `/integrations` exigen rol admin/superadmin (según matriz de roles del ADR-2 aprobado).
    4. Elimina la auto-creación de `superadmin` en `users.js:40-69`; sustitúyela por error 403 con instrucción de usar `database/create_admin_user.sql`.
    5. Sustituye `extractUser` (decodificación sin verificar) por `req.user` del middleware.
    6. Verificación manual: sin token → 401 en `/billing`, `/users`, `/developers`, `/payment-links`; con token de usuario normal → 403 en `/users` y `/developers`; con token válido de admin → 200; `POST /webhooks/stripe` sigue aceptando llamadas firmadas.
- definicion_de_done: `curl -s -o /dev/null -w '%{http_code}' https://<app>/api/admin/developers/api-keys` sin Authorization devuelve 401 (y lo mismo para `/users`, `/payment-links/manual`, `/billing`); `GET /health` sigue devolviendo 200 sin auth; el flujo de pago por link sigue completándose end-to-end.
- depende_de: [] (ADR-2 aprobado)
- riesgo_regresion: alto — cualquier llamada del cliente que hoy no envíe token romperá. El cliente ya inyecta Bearer en `fetchApi` (`client/src/lib/api/client.ts:19-26`), pero hay que revisar los fetch crudos de `AIChatWidget.tsx` y la página pública del payment link (el pagador no tiene sesión). Probar todos los módulos del cliente tras aplicar.

### REPAIR-04 — Rate limiting y validación en endpoints sensibles
- severidad: 🔴
- dimension: F
- tipo: (a) fix directo
- origen: seguridad: "Rate limiting / protección frente a abuso"; "Validación de toda entrada externa"
- evidencia: grep `rate-limit|rateLimit` → 0 en todo el repo; `routes/payment-links.js:102-120` (`from-invoice` sin check `amount_cents > 0`, que sí existe en `manual`, línea 189); `routes/users.js:162` (sin validación de email/contraseña); `payment-links.js:275` (envío de email sin límite)
- causa_raiz: endpoints añadidos incrementalmente sin capa transversal de abuso.
- accion: Añade `express-rate-limit` en admin-service con límites estrictos para rutas sensibles y completa la validación de entrada que falta.
- archivos_a_tocar: [services/admin-service/src/index.js, services/admin-service/package.json, services/admin-service/src/routes/payment-links.js, services/admin-service/src/routes/users.js]
- pasos:
    1. Instala `express-rate-limit` en el workspace de admin-service.
    2. Limiter global laxo (p. ej. 300 req/15 min/IP) en `index.js` + limiter estricto (p. ej. 10 req/15 min/IP) para `POST /users`, `POST /developers/api-keys`, `POST /payment-links/*` y `POST /payment-links/:id/send-email`.
    3. En `payment-links.js` (`from-invoice`): valida `Number.isInteger(amount_cents) && amount_cents > 0` y longitud máxima de `concept` antes de llamar a Stripe.
    4. En `users.js` (`POST /users`): valida formato de email y longitud mínima de contraseña (Joi, como ya hace `routes/billing.js:506`).
- definicion_de_done: la petición nº 11 en 15 min a `POST /payment-links/manual` devuelve 429; `POST /payment-links/from-invoice` con `amount_cents: -5` devuelve 400; `POST /users` con email `"x"` devuelve 400.
- depende_de: [REPAIR-03]
- riesgo_regresion: límites demasiado bajos pueden afectar a uso legítimo en ráfaga (matriz de billing hace muchas llamadas) — el limiter estricto solo debe aplicar a las rutas listadas, no a lecturas.

### REPAIR-05 — Eliminar el almacenamiento de contraseñas en claro (raw_password)
- severidad: 🔴
- dimension: F
- tipo: **(b) requiere diseño previo — ver ADR-3** (puede ser intencional para compartir credenciales; decidir antes de borrar)
- origen: seguridad: "Logging sin PII ni secretos" / gestión de credenciales
- evidencia: `services/admin-service/src/routes/users.js:198` y `:297` guardan `raw_password: password` en `user_profiles`; `users.js:129` (`GET /users` con `select('*')`) la expone a cualquier llamante
- causa_raiz: atajo para que el admin pueda consultar/compartir contraseñas creadas, a costa de almacenarlas en claro.
- accion: Aplica la opción aprobada del ADR-3 (recomendada: eliminar la columna y el campo, usando invitaciones/reset de Supabase para compartir acceso).
- archivos_a_tocar: [services/admin-service/src/routes/users.js, database/migrations/ (nueva migración drop column), client/src/features/ (vista de usuarios si muestra la contraseña)]
- pasos:
    1. Elimina `raw_password` de los inserts/updates en `users.js:198` y `:297`.
    2. Cambia `select('*')` de `users.js:129` por lista explícita de columnas sin `raw_password`.
    3. Crea migración `database/migrations/` con `ALTER TABLE user_profiles DROP COLUMN raw_password;` (tras confirmar en ADR-3) y documenta su ejecución en Supabase.
    4. Busca en `client/src` usos de `raw_password` y elimínalos.
- definicion_de_done: `grep -rn raw_password --exclude-dir=node_modules .` devuelve 0 resultados en código (solo puede aparecer en la migración de borrado), y `GET /users` no devuelve ningún campo de contraseña.
- depende_de: [REPAIR-03]
- riesgo_regresion: si alguna vista del cliente muestra la contraseña al admin, perderá esa función — sustituir por botón "enviar reset de contraseña".

### REPAIR-06 — Corregir hooks de React condicionales (crash potencial)
- severidad: 🔴
- dimension: A
- tipo: (a) fix directo
- origen: test:`npm run lint` (react-hooks/rules-of-hooks, 4 errores)
- evidencia: `client/src/features/.../UserManagement.tsx:203` (`useState` después del early-return de la línea 192 `if (!isSuperAdmin())`); `ImsalesBilling.tsx:193` (`useMemo` condicional); los otros 2 errores están en el archivo muerto `BillingTable.tsx:50-51` (se elimina en REPAIR-21)
- causa_raiz: guard de rol insertado por encima de declaraciones de hooks.
- accion: Mueve todas las declaraciones de hooks por encima de cualquier return condicional en los dos componentes vivos.
- archivos_a_tocar: [client/src/features/**/UserManagement.tsx, client/src/features/**/ImsalesBilling.tsx]
- pasos:
    1. En `UserManagement.tsx`: desplaza los `useState`/`useEffect` posteriores a la línea 192 al bloque superior del componente; deja el `if (!isSuperAdmin()) return ...` después de todos los hooks.
    2. En `ImsalesBilling.tsx:193`: haz el `useMemo` incondicional (condición dentro del callback).
    3. `npm run lint` y confirma que `rules-of-hooks` pasa de 4 a 2 errores (los 2 restantes en `BillingTable.tsx`, código muerto).
- definicion_de_done: `cd client && npx eslint src/features --rule '{"react-hooks/rules-of-hooks":"error"}'` no reporta errores en `UserManagement.tsx` ni `ImsalesBilling.tsx`, y `npm run build` sigue en verde.
- depende_de: []
- riesgo_regresion: bajo — reordenación de hooks; verificar manualmente que la vista de usuarios renderiza para superadmin y que Imsales calcula igual.

### REPAIR-07 — Resolver vulnerabilidades de dependencias (1 crítica, 9 high)
- severidad: 🔴
- dimension: G
- tipo: (a) fix directo
- origen: `npm audit` (raíz)
- evidencia: 19 vulnerabilidades: crítica `shell-quote`; high `vite` (GHSA-4w7w-66w2-5vf9 y otras), `path-to-regexp <0.1.13`, `lodash`, `flatted`, `minimatch`, `picomatch`; moderate incl. `joi <18.2.1`
- causa_raiz: dependencias sin mantenimiento periódico (supabase-js de servicios ~70 minors detrás).
- accion: Ejecuta `npm audit fix` en la raíz, sube `vite` a la 8.x (o última 7.x parcheada) y verifica build; deja `joi` 18 (breaking) como tarea aparte documentada.
- archivos_a_tocar: [package.json, package-lock.json, client/package.json]
- pasos:
    1. `npm audit fix` en la raíz del workspace.
    2. Actualiza `vite` en `client/package.json` a versión sin las vulnerabilidades high y ejecuta `npm run build`.
    3. Re-ejecuta `npm audit`; documenta en el commit qué queda pendiente (joi 18.x) y por qué.
    4. Aprovecha para subir `@supabase/supabase-js` de los 4 servicios al rango del cliente (^2.93) si `npm run dev` arranca sin errores.
- definicion_de_done: `npm audit` en raíz devuelve 0 críticas y 0 high, y `cd client && npm run build` termina en verde.
- depende_de: [REPAIR-18] (limpiar lockfiles antes, para que el audit refleje un único árbol)
- riesgo_regresion: salto de vite puede requerir ajustes de config (`vite.config.ts`); probar `npm run dev:client` y build.

### REPAIR-08 — CORS restringido y helmet en admin-service
- severidad: 🟠
- dimension: F/G
- tipo: (a) fix directo
- origen: seguridad: "CORS restringido (no `*` con credenciales)"; "Cabeceras de seguridad"
- evidencia: `services/admin-service/src/index.js:43` (`cors()` abierto, sin helmet en todo el archivo); `services/billing-service/src/index.js:16` (`cors()` abierto); `services/payroll-service/src/index.js:20` y `services/commissions-service/src/index.js:20` (`origin: FRONTEND_URL || '*'` con `credentials: true`); admin declara `helmet` y `morgan` sin usarlos (`package.json:25,28`)
- causa_raiz: admin-service creció sin el hardening que sí tienen los otros 3 servicios.
- accion: Configura CORS con lista de orígenes desde env (sin fallback `*` cuando hay credentials) y monta helmet (y morgan, ya declarado) en admin-service.
- archivos_a_tocar: [services/admin-service/src/index.js, services/billing-service/src/index.js, services/payroll-service/src/index.js, services/commissions-service/src/index.js]
- pasos:
    1. En los 4 servicios: `cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) })`; en payroll/commissions elimina el fallback `'*'` cuando `credentials: true` (si no hay origins definidos, no habilites credentials).
    2. En admin `index.js`: `app.use(helmet())` y `app.use(morgan('combined'))` antes de las rutas (después del raw del webhook).
    3. Añade `ALLOWED_ORIGINS` a los `.env.example` (coordinar con REPAIR-11) y a Vercel.
    4. Nota: en producción el cliente y la API comparten origen en Vercel (mismo dominio), así que el CORS estricto no debería romper nada; verificar el flujo desde el dominio real.
- definicion_de_done: una petición con `Origin: https://evil.example` a `/api/admin/billing` no recibe `Access-Control-Allow-Origin` reflejado, y la respuesta de cualquier endpoint admin incluye cabeceras de helmet (`X-Content-Type-Options: nosniff`).
- depende_de: [REPAIR-03]
- riesgo_regresion: si existe algún consumidor cross-origin legítimo (n8n, MCP, integraciones), añadir su origen a `ALLOWED_ORIGINS` o dirigirlo por el gateway `/api` con API key (server-to-server no se ve afectado por CORS).

### REPAIR-09 — No filtrar detalles internos en errores de producción
- severidad: 🟠
- dimension: F
- tipo: (a) fix directo
- origen: seguridad: "Errores que no filtran stack traces ni detalles internos"
- evidencia: patrón en 168 ocurrencias/49 archivos: `routes/payment-links.js:166,235,311,335`; `routes/users.js:157,283`; `services/billing-service/src/index.js:39-43`; `billing-service/routes/events.js:52` (filtra `error.details` de Joi); contraejemplo correcto: `services/payroll-service/src/index.js:78` (solo en development)
- causa_raiz: handlers copian `err.message` al JSON de respuesta sin gate por entorno.
- accion: Añade un error-handler global en admin-service y billing-service que loguee el error completo en servidor y devuelva mensaje genérico salvo `NODE_ENV !== 'production'`; sustituye los `res.status(500).json({ error: err.message })` de rutas por `next(err)`.
- archivos_a_tocar: [services/admin-service/src/index.js, services/admin-service/src/routes/*.js, services/billing-service/src/index.js, services/billing-service/src/routes/events.js]
- pasos:
    1. Error-handler global al final de `admin-service/src/index.js`, espejo del patrón de `payroll-service/src/index.js:78`.
    2. Reemplazo mecánico en `services/admin-service/src/routes/*.js`: `catch (err) { ... res.status(500).json({ error: err.message }) }` → `catch (err) { next(err) }` (mantén los 4xx con mensajes de validación intencionales).
    3. En `billing-service/src/index.js:39-43` aplica el gate por entorno; en `events.js:52` devuelve solo el primer mensaje de Joi, no `error.details` completo.
- definicion_de_done: `grep -rn 'err.message\|error.message' services/admin-service/src/routes | grep 'status(500)'` devuelve 0 resultados, y un error forzado en producción responde `{"error":"Internal server error"}`.
- depende_de: []
- riesgo_regresion: el cliente puede mostrar hoy `err.message` en toasts; los errores 500 pasarán a ser genéricos (los 400 de validación se conservan). Revisar que ningún flujo del cliente dependa del texto de un 500.

### REPAIR-10 — Idempotencia en el webhook de Stripe
- severidad: 🟠
- dimension: F
- tipo: (a) fix directo
- origen: seguridad (automatización): "Idempotencia y manejo de reintentos"
- evidencia: `services/admin-service/src/routes/webhooks.js:80-120` — `handleSessionCompleted` re-envía email y re-llama `POST /pay` de Holded (`:106`) en cada reintento de Stripe; la firma sí se verifica (`webhooks.js:55-65`, correcto)
- causa_raiz: el handler actualiza por `stripe_session_id` sin comprobar si el evento ya fue procesado.
- accion: Haz el procesamiento idempotente: antes de actuar, comprueba el estado del payment link; si ya está `paid`, responde 200 sin re-ejecutar efectos secundarios.
- archivos_a_tocar: [services/admin-service/src/routes/webhooks.js]
- pasos:
    1. Al inicio de `handleSessionCompleted`, lee el registro por `stripe_session_id`; si `status === 'paid'` (o el campo equivalente), `return` antes de email/Holded.
    2. Registra `stripe_event_id` procesado en el update para trazabilidad.
    3. Simula doble entrega (llamar dos veces al handler con el mismo payload en un script local o con Stripe CLI) y verifica un solo email y una sola llamada a Holded.
- definicion_de_done: procesar dos veces el mismo evento `checkout.session.completed` produce exactamente una notificación y una llamada a Holded (verificable por logs), y la segunda entrega responde 200.
- depende_de: []
- riesgo_regresion: si el estado `paid` se setea en otro flujo antes del webhook, podría saltarse el email legítimo — comprobar contra el campo correcto.

### REPAIR-11 — Sincronizar .env.example con las variables reales (4 servicios + cliente)
- severidad: 🟠
- dimension: G
- tipo: (a) fix directo
- origen: convención del repo (los `.env.example` existen como contrato de setup; README §🔑)
- evidencia: admin omite 14 vars que el código lee (`SMTP_HOST/PORT/USER/PASS` en `budget-requests.js:62-66` y `webhooks.js:13-17`, `FINANCE_EMAIL`, `ADMIN_EMAIL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HOLDED_API_KEY`, `HOLDED_PAYMENT_ACCOUNT_ID`, `CLICKUP_API_TOKEN`/`CLICKUP_TEAM_ID`, `APP_URL`/`PRODUCTION_URL`); commissions omite 7 (SMTP_*, `ADMIN_EMAIL`, `ADMIN_CC_EMAIL`, `FRONTEND_URL`); payroll omite `FRONTEND_URL`; no existe `client/.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` leídas en `client/src/lib/supabase.ts:3-4`; `envDir: '../'` en `vite.config.ts:7` sin documentar)
- causa_raiz: las integraciones (Stripe, Holded, SMTP, IA) se añadieron sin actualizar los ejemplos.
- accion: Reescribe los 4 `.env.example` con todas las variables que cada servicio lee (grep `process.env`) con placeholders y comentario de uso, y crea `client/.env.example` (o sección en el de raíz dado `envDir: '../'`).
- archivos_a_tocar: [services/admin-service/.env.example, services/commissions-service/.env.example, services/payroll-service/.env.example, services/billing-service/.env.example, client/.env.example (nuevo), README.md]
- pasos:
    1. Por servicio: `grep -rhoE "process\.env\.[A-Z_]+" src | sort -u` y volcar cada variable al `.env.example` con placeholder y comentario.
    2. Crear `client/.env.example` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` y nota: "Vite lee el .env de la RAÍZ del repo (envDir: '../')".
    3. Añadir `ALLOWED_ORIGINS` si REPAIR-08 ya se aplicó.
    4. Actualizar la sección 🔑 del README para reflejar el conjunto completo (coordina con REPAIR-14).
- definicion_de_done: para cada servicio, el conjunto `grep -rhoE "process\.env\.[A-Z_]+" src | sort -u` está contenido en su `.env.example` (diff vacío), y existe `client/.env.example` con las 2 VITE_*.
- depende_de: []
- riesgo_regresion: ninguno (solo documentación de ejemplo; no tocar `.env` reales).

### REPAIR-12 — docker-compose.yml: eliminar (o reescribir)
- severidad: 🔴
- dimension: H
- tipo: **(b) requiere decisión — ver mini-RFC ADR-5** (recomendación: eliminar)
- origen: README/entregabilidad — el archivo promete un entorno que no puede levantarse
- evidencia: `docker-compose.yml` referencia `services/expenses-service`, `services/periods-service` y `./frontend`, que no existen; puertos 3001-3005 contradicen los reales (3010-3012 + 3001 billing); define 5 vars `VITE_*_SERVICE_URL` que ningún código lee (`docker-compose.yml:88-92` vs grep en `client/src` → solo 2 VITE_*); ningún servicio tiene `Dockerfile`
- causa_raiz: reliquia de la arquitectura original (5 microservicios) nunca actualizada al modelo Vercel + workspaces.
- accion: Según ADR-5: opción A (recomendada) — borrar `docker-compose.yml`; el entorno local soportado es `npm run dev` (ya funciona vía proxy de Vite, `client/vite.config.ts:11-29`).
- archivos_a_tocar: [docker-compose.yml, README.md]
- pasos:
    1. `git rm docker-compose.yml`.
    2. Verifica que el README no remite a docker (no lo hace hoy) y que REPAIR-14 documenta `npm run dev` como única vía local.
- definicion_de_done: `docker-compose.yml` no existe en el árbol trackeado y el README documenta el arranque local con `npm run dev`.
- depende_de: []
- riesgo_regresion: ninguno — el compose actual no puede ejecutarse (3 builds inexistentes).

### REPAIR-13 — Guía única y completa de aplicación de SQL
- severidad: 🔴
- dimension: H
- tipo: (a) fix directo (laborioso pero mecánico)
- origen: README §📊 "Base de Datos" (contradicho por `database/SETUP_GUIDE.md` y `database/README.md`)
- evidencia: README ordena `schema_v2 → sample_data → rls_policies_v2 → functions_v2 → test_data_complete`; SETUP_GUIDE omite `functions_v2.sql`; `database/README.md` documenta la versión v1 (`schema.sql`, `functions.sql`) y su tabla de migraciones se detiene en `add_hidden_from_clients.sql` (2026-04-17); ~28 archivos sin orden: 9 `migration_*.sql` sueltos en `database/`, 15 en `database/migrations/` (numeración 001, 002, 05, 06 + 9 sin numerar), 8 en `scripts/` (07-14, incl. `11_chat_messages.sql`, `12_notifications.sql`, `14_api_keys.sql` que el código actual requiere)
- causa_raiz: cada feature añadió su SQL donde le pareció; nadie mantiene un índice de orden de aplicación.
- accion: Crea `database/MIGRATIONS.md` como única fuente de verdad: lista ordenada y fechada de TODOS los .sql necesarios para montar la BD desde cero hasta el código actual, y corrige/redirige las tres guías existentes hacia él.
- archivos_a_tocar: [database/MIGRATIONS.md (nuevo), database/README.md, database/SETUP_GUIDE.md, README.md]
- pasos:
    1. Inventaría los .sql de `database/`, `database/migrations/` y `scripts/` y ordénalos: base v2 (schema_v2, sample_data, rls_policies_v2, functions_v2) → migraciones por fecha de commit (`git log --follow --format=%ad -1 -- <archivo>`).
    2. Marca explícitamente los obsoletos/superseded (schema.sql v1, functions.sql v1, rls_policies.sql v1) como "NO ejecutar — histórico".
    3. Escribe `database/MIGRATIONS.md` con la tabla: orden, archivo, fecha, qué crea, requerido por (módulo de código).
    4. Sustituye las secciones de orden de `database/README.md` y `SETUP_GUIDE.md` por un enlace a `MIGRATIONS.md`; actualiza README raíz (coordina con REPAIR-14).
    5. Opcional recomendado: mueve `scripts/*.sql` a `database/migrations/` para un único directorio (actualiza referencias).
- definicion_de_done: existe `database/MIGRATIONS.md` que lista el 100 % de los .sql trackeados (cotejo: `git ls-files '*.sql' | wc -l` = nº de filas entre activos y marcados como históricos), y ni README ni SETUP_GUIDE contienen un orden contradictorio con él.
- depende_de: []
- riesgo_regresion: documental; si se mueven los .sql de `scripts/`, revisar que ningún script JS los referencie por ruta.

### REPAIR-14 — Actualizar README raíz a la arquitectura real
- severidad: 🟠
- dimension: A/H
- tipo: (a) fix directo
- origen: README (fuente de verdad principal, hoy contradice el repo)
- evidencia: `README.md:3` "3 microservices" (hay 4 + `services/shared`); diagrama `README.md:15-19` sin billing-service ni capa Vercel (`api/*`, `vercel.json`); `README.md:269-314` estructura obsoleta; `README.md:334-338` frontend "[ ]" cuando `client/` está en producción; el cliente llama a `/api/*` (`client/src/lib/api/client.ts:3-8`), no a localhost:301X; promesa "React PWA" (`README.md:9`) sin service worker (manifest sí: `client/index.html:8`)
- causa_raiz: README escrito para la fase "solo backend" y nunca revisado.
- accion: Reescribe las secciones de arquitectura, estado, estructura y despliegue para reflejar: 4 servicios + estado de cada uno (según resultado de ADR-4 sobre billing), despliegue Vercel serverless, frontend React completo, "instalable vía manifest" en lugar de "PWA" (o tarea pendiente de SW), y arranque local con `npm run dev`.
- archivos_a_tocar: [README.md]
- pasos:
    1. Actualiza diagrama y lista de servicios (incluye `api/` wrappers y vercel.json).
    2. Corrige el checklist de estado (frontend hecho; backend con las salvedades de seguridad ya en curso).
    3. Documenta los dos modos de ejecución: producción (Vercel `/api/*`) y local (`npm run dev`, proxy de Vite 3010-3012).
    4. Ajusta la afirmación PWA y la sección de BD (enlaza `database/MIGRATIONS.md`).
- definicion_de_done: el README no contiene las cadenas "3 microservices", la estructura obsoleta de `README.md:269-314`, ni el checklist de frontend sin marcar; menciona `billing-service`, `api/` y `vercel.json`.
- depende_de: [REPAIR-12, REPAIR-13, REPAIR-16]
- riesgo_regresion: ninguno (documentación).

### REPAIR-15 — Cerrar o actualizar REGISTRO.md
- severidad: 🟠
- dimension: H
- tipo: (a) fix directo
- origen: convención del repo (REGISTRO.md funciona de facto como changelog)
- evidencia: `REGISTRO.md:1-7` se declara diario de la rama `feat/updatebillingandapp` (abril 2026); último toque `0ad60e7` (2026-06-03); features de junio sin registrar (payment links `643d0b1`, emails `04c0084`, onboarding tour `f7c278e`/`50b96d2`); sección "Pendientes" de 2026-04-27 con 2 SQL "por ejecutar" sin confirmación
- causa_raiz: el diario se abandonó al cambiar de rama/flujo.
- accion: Añade una entrada de cierre que: (1) registre las features de junio con sus commits, (2) resuelva o re-liste los "Pendientes" de abril (verificar con el equipo si esos 2 SQL se ejecutaron), y (3) declare el documento como histórico remitiendo a partir de ahora al log de git o a un `CHANGELOG.md` si se prefiere.
- archivos_a_tocar: [REGISTRO.md]
- pasos:
    1. Nueva sección fechada 2026-06 con: payment links Stripe+Holded, notificaciones email, onboarding tour, mejoras de rentabilidad (commits `04c0084`…`50b96d2`).
    2. Revisar la lista "Pendientes": marcar cerrados los confirmados; los no confirmables, anotarlos como "estado desconocido — verificar en Supabase".
    3. Cabecera nueva: "Documento histórico de la fase abril-junio 2026; el registro continúa en git log / CHANGELOG.md".
- definicion_de_done: `grep -i 'payment link\|onboarding' REGISTRO.md` devuelve resultados y la cabecera declara el estado del documento.
- depende_de: []
- riesgo_regresion: ninguno.

### REPAIR-16 — Decidir el destino de billing-service (eliminar o documentar)
- severidad: 🟠
- dimension: B
- tipo: **(b) requiere diseño previo — ver ADR-4** (recomendación: retirar del despliegue)
- origen: ninguna fuente lo respalda (el README ni lo menciona) — código muerto desplegado
- evidencia: `vercel.json:10-11` y `api/billing/index.js` lo despliegan; un solo endpoint funcional `POST /events/invoice-issued` (`services/billing-service/src/routes/events.js:46`) sobre tablas `contracts`/ledger; 0 consumidores (constante `BILLING` de `client/src/lib/api/client.ts:7` sin usos); duplica el dominio de facturación que admin-service implementa como billing matrix
- causa_raiz: diseño original (contratos + ledger de doble entrada) abandonado al reimplementarse la facturación en admin-service; nunca se retiró.
- accion: Según opción aprobada en ADR-4. Opción A (recomendada): retirar del despliegue y archivar — borrar `api/billing/`, el rewrite de `vercel.json`, la constante `BILLING` del cliente y la entrada `dev:billing`; mover `services/billing-service` fuera o borrarlo (queda en historial).
- archivos_a_tocar: [vercel.json, api/billing/index.js, services/billing-service/, client/src/lib/api/client.ts, package.json, README.md]
- pasos:
    1. Elimina el rewrite `/api/billing/(.*)` de `vercel.json` y el directorio `api/billing/`.
    2. Borra `services/billing-service/` y la línea `BILLING` de `client.ts:7`; quita `dev:billing` e `install:all` del `package.json` raíz.
    3. Búsqueda de regresión: `grep -rn 'api/billing\|billing-service' --exclude-dir=node_modules .` → solo documentación histórica.
    4. Documenta en README/REGISTRO que el modelo contratos+ledger queda descartado (recuperable del historial).
- definicion_de_done: `vercel.json` no contiene `/api/billing`, `services/billing-service` no existe en el árbol, y `npm run dev` + `npm run build` siguen en verde.
- depende_de: [] (ADR-4 aprobado)
- riesgo_regresion: si algún sistema externo (n8n, integraciones) llama a `/api/billing/events/invoice-issued`, dejará de funcionar — comprobar logs de Vercel de los últimos 30 días antes de retirar.

### REPAIR-17 — Eliminar services/shared y unificar la configuración de Supabase
- severidad: 🟠
- dimension: B/C
- tipo: (a) fix directo
- origen: ninguna (limpieza de código muerto verificado)
- evidencia: 0 imports de `services/shared` en todo el repo (grep `from '.*shared`); no declarado como dependencia por ningún servicio; `install:all` (`package.json:7`) no lo instala; `shared/ledger.js` duplica `billing-service/src/services/ledgerService.js`; `config/supabase.js` cuadruplicado en los 4 servicios con `dotenv.config({ path: '../../.env' })` dependiente del CWD
- causa_raiz: intento de paquete compartido nunca adoptado; cada servicio mantuvo su copia.
- accion: Borra `services/shared/`; opcionalmente (si REPAIR-16 conserva ≥2 servicios) promociona un único `config/supabase.js` a paquete workspace consumido por todos, eliminando las copias.
- archivos_a_tocar: [services/shared/, services/*/src/config/supabase.js, services/*/package.json]
- pasos:
    1. `git rm -r services/shared`.
    2. (Opcional, recomendado) Crea `packages/shared-config` (o reutiliza `services/shared` con nombre correcto) exportando el cliente Supabase; decláralo en cada `package.json` (`"@immoral/shared": "*"` via workspaces) y reemplaza los 3-4 `src/config/supabase.js`.
    3. Si se hace el paso 2, sustituye el `dotenv.config({path:'../../.env'})` relativo por resolución robusta (p. ej. `process.env` directo en Vercel + dotenv solo en dev).
    4. `node --check` de los 4 (o 3) `src/index.js` y `npm run dev` en verde.
- definicion_de_done: `grep -rn "shared" services/*/src --include='*.js'` no muestra imports rotos, no quedan ≥2 copias idénticas de la creación del cliente Supabase, y todos los servicios arrancan (`node --check` OK, `/health` responde en dev).
- depende_de: [REPAIR-16]
- riesgo_regresion: la unificación toca el arranque de todos los servicios — probar en dev y en preview de Vercel antes de producción. Si se prefiere mínimo riesgo, ejecutar solo el paso 1 (borrado de lo muerto).

### REPAIR-18 — Sanear workspace: node_modules trackeados y lockfiles redundantes
- severidad: 🟠
- dimension: G/H
- tipo: (a) fix directo
- origen: convención del repo (`package.json` raíz declara workspaces) + .gitignore existente
- evidencia: `git ls-files | grep node_modules` → 3 (`services/{admin,commissions,payroll}-service/node_modules/.package-lock.json`); lockfiles por servicio en admin, commissions y payroll además del de raíz y el de client; `install:all` (`package.json:7`) hace `cd`+`npm install` por carpeta ignorando workspaces y omite `services/shared`
- causa_raiz: migración a workspaces a medias; restos del modelo por-carpeta.
- accion: Saca de git los ficheros de node_modules, elimina los lockfiles secundarios y deja `npm install` en raíz como única vía (simplifica o elimina `install:all`).
- archivos_a_tocar: [.gitignore, services/admin-service/package-lock.json, services/commissions-service/package-lock.json, services/payroll-service/package-lock.json, client/package-lock.json, package.json]
- pasos:
    1. `git rm --cached` de los 3 ficheros bajo node_modules; confirma que `.gitignore` (`node_modules`) los cubre en adelante.
    2. `git rm` de los 3 lockfiles de servicios y el de `client/` (el lockfile del workspace es el de la raíz).
    3. Borra árboles locales y ejecuta `npm install` en raíz; verifica `npm ls --workspaces` sin errores y `npm run build`.
    4. Cambia `install:all` por `npm install` (o elimínalo) en `package.json`.
- definicion_de_done: `git ls-files | grep -E 'node_modules|^(client|services)/.*package-lock.json'` devuelve vacío y `npm install && npm run build` desde raíz limpia termina en verde.
- depende_de: []
- riesgo_regresion: el árbol de dependencias resuelto puede variar levemente al consolidar en un lockfile — ejecutar build y arranque dev de los 4 servicios tras el cambio.

### REPAIR-19 — Fijar la versión de Node
- severidad: 🟠
- dimension: G
- tipo: (a) fix directo
- origen: README §Requisitos ("Node.js 18+", hoy sin efecto técnico)
- evidencia: sin campo `engines` en ningún package.json (grep → 0), sin `.nvmrc`, `vercel.json:1-24` sin runtime declarado
- causa_raiz: nunca se fijó; el runtime de Vercel queda al default cambiante.
- accion: Añade `"engines": { "node": ">=20 <23" }` (o la versión que use producción en Vercel — comprobarla) al package.json raíz y de cada workspace, crea `.nvmrc` y fija el runtime en la configuración de Vercel.
- archivos_a_tocar: [package.json, client/package.json, services/*/package.json, .nvmrc (nuevo)]
- pasos:
    1. Comprueba en el dashboard de Vercel la versión de Node activa del proyecto.
    2. Añade `engines` coherente con ella en los package.json y crea `.nvmrc`.
    3. `npm install && npm run build` con esa versión para validar.
- definicion_de_done: `grep -l '"engines"' package.json client/package.json services/*/package.json | wc -l` ≥ 2 (raíz y client como mínimo), existe `.nvmrc`, y el build pasa con la versión fijada.
- depende_de: []
- riesgo_regresion: si `engines` no coincide con la versión real de Vercel, el deploy avisará/fallará — por eso el paso 1 es obligatorio.

### REPAIR-20 — Guards de rol en las vistas sensibles del cliente
- severidad: 🟠
- dimension: F
- tipo: (a) fix directo
- origen: convención del repo (UserManagement y Settings ya implementan el patrón: `UserManagement.tsx:192`, `SettingsPage.tsx:11`)
- evidencia: `client/src/App.tsx:60-82` no aplica guard de rol por ruta; ocultamiento solo en `Sidebar.tsx:216-223`; `Payments.tsx`, `FeeConfiguration.tsx`, `GeneratePaymentLink.tsx`, `Payroll.tsx`, `Expenses.tsx` sin ninguna llamada a `isSuperAdmin/hasPermission/canEdit` — accesibles por URL a cualquier autenticado (incluido rol `partner`)
- causa_raiz: el control de rol se implementó en el menú, no en las rutas.
- accion: Crea un `RoleProtectedRoute` (envoltorio de `ProtectedRoute` con prop de roles/permiso) y aplícalo en `App.tsx` a las 5 rutas sensibles, replicando la matriz de visibilidad que ya usa el Sidebar.
- archivos_a_tocar: [client/src/components/layout/RoleProtectedRoute.tsx (nuevo), client/src/App.tsx]
- pasos:
    1. Implementa `RoleProtectedRoute` usando el mismo helper de permisos que `Sidebar.tsx:216-223`.
    2. Envuelve `/payments`, `/payments/generate-link`, `/fees`, `/payroll`, `/expenses` (y revisa si hay más rutas que el Sidebar oculta por rol).
    3. Redirige a `/` con aviso cuando el rol no tiene acceso.
    4. Nota: esto es defensa en profundidad de UX; la barrera real es REPAIR-03 en el servidor.
- definicion_de_done: con un usuario de rol `partner` autenticado, navegar a `/payments` y `/fees` por URL redirige fuera (no renderiza la vista); `npm run build` en verde.
- depende_de: [REPAIR-03]
- riesgo_regresion: roles legítimos que hoy usan esas vistas sin ser superadmin podrían quedar fuera — replicar exactamente la matriz del Sidebar, no inventarla.

### REPAIR-21 — Eliminar código muerto del cliente y deduplicar Nutfruit/Icex
- severidad: 🟡
- dimension: C/B
- tipo: (a) fix directo
- origen: ninguna (limpieza verificada por grep de importadores)
- evidencia: 0 importadores de `client/src/features/pl/PLReport.tsx` (178 líneas), `client/src/features/billing/BillingTable.tsx` (170 líneas; contiene 2 errores rules-of-hooks), `client/src/components/shared/ProgressBar.tsx` (30 líneas); `NutfruitBudget.tsx` (392) e `IcexBudget.tsx` (388) son ~88 % idénticos (diff normalizado: 46 líneas)
- causa_raiz: iteraciones que dejaron versiones anteriores sin borrar; budget por cliente copiado y pegado.
- accion: Borra los 3 archivos muertos; extrae `ClientBudget` parametrizado (nombre de cliente/config) y haz que Nutfruit e Icex lo usen.
- archivos_a_tocar: [client/src/features/pl/PLReport.tsx, client/src/features/billing/BillingTable.tsx, client/src/components/shared/ProgressBar.tsx, client/src/features/**/NutfruitBudget.tsx, client/src/features/**/IcexBudget.tsx, client/src/features/**/ClientBudget.tsx (nuevo)]
- pasos:
    1. `git rm` de los 3 archivos muertos; `npm run build` para confirmar 0 referencias.
    2. Diff de Nutfruit/Icex; extrae las 46 líneas de diferencia a props/config; crea `ClientBudget.tsx`; convierte ambos en wrappers finos (o rutas con prop).
    3. `npm run lint`: los errores rules-of-hooks deben quedar a 0 (junto con REPAIR-06).
- definicion_de_done: build verde; `grep -rn 'PLReport\|BillingTable\|shared/ProgressBar' client/src` → 0; ESLint `rules-of-hooks` → 0 errores; las vistas de presupuesto Nutfruit e Icex renderizan idéntico a antes.
- depende_de: [REPAIR-06]
- riesgo_regresion: la unificación de budgets puede alterar detalles visuales por cliente — comparar render antes/después de ambas vistas.

### REPAIR-22 — Higiene menor: PII en logs, fallback Supabase, fetches del chat
- severidad: 🟡
- dimension: F/C
- tipo: (a) fix directo
- origen: seguridad: "Logging sin PII"; convención del repo (wrapper `fetchApi` central)
- evidencia: `services/commissions-service/src/routes/payment-requests.js:53` (email del destinatario en log); `services/admin-service/src/routes/pl.js:812` (payload completo en log); `client/src/lib/supabase.ts:6-12` (fallback `https://placeholder.supabase.co` con solo `console.warn`); `client/src/components/**/AIChatWidget.tsx:129-400` (~10 fetch crudos, varios sin `response.ok`, `.catch(()=>{})` en :309); `nodemailer` ^8.0.10 (admin) vs ^8.0.3 (commissions)
- causa_raiz: restos de depuración y atajos puntuales.
- accion: Anonimiza los 2 logs, convierte el fallback placeholder en error explícito al arrancar (throw en build/runtime si faltan las VITE_*), migra los fetch del chat al wrapper `fetchApi` o añade checks de `response.ok`, y alinea nodemailer a una sola versión.
- archivos_a_tocar: [services/commissions-service/src/routes/payment-requests.js, services/admin-service/src/routes/pl.js, client/src/lib/supabase.ts, client/src/components/**/AIChatWidget.tsx, services/commissions-service/package.json]
- pasos:
    1. `payment-requests.js:53`: loguea id de la solicitud, no el email; `pl.js:812`: elimina el volcado del payload (o loguea solo claves).
    2. `supabase.ts`: si faltan `VITE_SUPABASE_URL`/`ANON_KEY`, `throw new Error(...)` en lugar de placeholder.
    3. `AIChatWidget.tsx`: usa `fetchApi` o añade `if (!response.ok) throw` en cada fetch; elimina los `.catch(()=>{})` salvo telemetría deliberada (comenta por qué).
    4. nodemailer `^8.0.10` en ambos servicios; `npm install`.
- definicion_de_done: `grep -n 'console.log' services/commissions-service/src/routes/payment-requests.js services/admin-service/src/routes/pl.js` no muestra PII/payloads; arrancar el cliente sin VITE_* falla con error claro; `grep -c 'response.ok' AIChatWidget.tsx` cubre todos sus fetch; un solo rango de nodemailer en el repo.
- depende_de: []
- riesgo_regresion: el throw del cliente convierte una mala config en fallo de arranque visible (intencional); verificar que los entornos de preview tienen las VITE_* definidas.

### REPAIR-23 — Sacar login-bg.mp4 (12,8 MB) del repositorio
- severidad: 🟠
- dimension: H
- tipo: (a) fix directo
- origen: higiene de repo (≈ todo el peso de `.git` es este archivo)
- evidencia: `client/public/login-bg.mp4` = 12.856 KB, mayor archivo trackeado; `.git` pesa 15 MB
- causa_raiz: asset multimedia commiteado en lugar de servido desde almacenamiento.
- accion: Sube el vídeo a Supabase Storage (bucket público) o al CDN que ya use el proyecto, referencia la URL en el componente de login y elimina el archivo del árbol.
- archivos_a_tocar: [client/public/login-bg.mp4, client/src/features/**/Login*.tsx (donde se referencie)]
- pasos:
    1. Localiza la referencia (`grep -rn 'login-bg' client/src client/index.html`).
    2. Sube el mp4 a Supabase Storage público; sustituye la ruta por la URL (con fallback de poster/imagen ligera si la red falla).
    3. `git rm client/public/login-bg.mp4`. (La purga del historial se decide en ADR-1 junto con la del secreto.)
    4. Verifica el login en dev con el vídeo remoto.
- definicion_de_done: `git ls-files | grep login-bg` vacío, la página de login muestra el vídeo de fondo cargado desde URL externa, build verde.
- depende_de: []
- riesgo_regresion: dependencia de red para el fondo del login — añadir poster estático como fallback.

### REPAIR-24 — Base mínima de tests y CI
- severidad: 🟡
- dimension: D/E
- tipo: (a) fix directo (alcance deliberadamente mínimo; ampliar cobertura es backlog)
- origen: README §🎯 "Agregar tests unitarios e integración" (compromiso documentado e incumplido)
- evidencia: 0 archivos `*.test.*`/`*.spec.*` en el repo; `.github/workflows` inexistente; `npm run lint` exit 1 (251 errores)
- causa_raiz: el proyecto creció sin red de seguridad; toda verificación es manual.
- accion: Añade (1) workflow de GitHub Actions que ejecute install + `node --check` de los servicios + `npm run build` del cliente + lint, y (2) primeros smoke tests (vitest) de las utilidades puras más críticas del backend (p. ej. cálculo de splits/prorrateo) y del wrapper `fetchApi`. Ajusta la config de ESLint para que el CI falle solo en errores accionables (rules-of-hooks, no-unused-vars) mientras `no-explicit-any` se rebaja a warning con nota de deuda.
- archivos_a_tocar: [.github/workflows/ci.yml (nuevo), client/eslint.config.js, package.json, services/admin-service/src/**/ (tests nuevos junto al código o en tests/), client/src/lib/api/client.test.ts (nuevo)]
- pasos:
    1. Workflow `ci.yml`: checkout, setup-node (versión de REPAIR-19), `npm install`, `node --check services/*/src/index.js`, `cd client && npm run build && npm run lint`.
    2. Rebaja `no-explicit-any` a warn en la config de ESLint (deuda registrada), deja `rules-of-hooks` como error.
    3. Instala vitest en el workspace; 3-5 tests de funciones puras de cálculo (identificarlas en `routes/billing.js` / `expenses.js` — si la lógica está incrustada en handlers, testea vía supertest el endpoint con Supabase mockeado o extrae la función pura mínima).
    4. Verifica el workflow en verde en una rama.
- definicion_de_done: `.github/workflows/ci.yml` existe y su última ejecución en GitHub está en verde; `npx vitest run` pasa con ≥3 tests; `npm run lint` exit 0.
- depende_de: [REPAIR-06, REPAIR-19]
- riesgo_regresion: ninguno en runtime; el riesgo es social (CI rojo bloqueando merges) — por eso el alcance del lint se ajusta antes de activarlo.

---

## ADRs / mini-RFCs (requieren visto bueno humano antes de ejecutar)

### ADR-1 — ¿Purgar el historial de git tras retirar el secreto y los datos sensibles?
- **Contexto**: REPAIR-02 borra del árbol la clave service_role, los volcados con datos de clientes y (REPAIR-23) el mp4, pero todo permanece en el historial (commit `0ad60e7` en adelante). El repo es privado (`immoral-marketing/app-finance`).
- **Problema**: ¿reescribir el historial (`git filter-repo`) para eliminar la clave, los datos comerciales y los 12,8 MB del vídeo?
- **Opciones**:
  - **A. No purgar** (solo rotar clave + borrar del árbol). Pros: cero riesgo operativo; la clave rotada ya no sirve. Contras: datos comerciales de clientes siguen legibles en el historial para cualquier colaborador presente o futuro.
  - **B. Purga completa con `git filter-repo`** (clave, *.txt de debug, mp4). Pros: historial limpio, repo de 15 MB → ~2 MB. Contras: reescribe SHAs → todos los clones/forks deben re-clonar; rompe referencias a commits en PRs/issues; debe coordinarse con todo el equipo y hacerse en ventana controlada.
  - **C. Purga selectiva** (solo los archivos con datos de clientes y la clave; el mp4 se queda). Pros/contras intermedios.
- **Recomendación**: **B** si el equipo es pequeño y puede re-clonar coordinadamente (parece el caso: 2 autores); **A** como mínimo aceptable dado que la clave se rota. La decisión es del humano por su impacto operativo.
- **Plan de migración (si B)**: avisar al equipo → mergear todo lo vivo → `git filter-repo` con lista de rutas → force-push → todos re-clonan → verificar que Vercel sigue desplegando.

### ADR-2 — Estrategia de autenticación para admin-service (soporta REPAIR-03)
- **Contexto**: el cliente ya envía `Authorization: Bearer <JWT de Supabase>` en todas sus llamadas (`client/src/lib/api/client.ts:19-26`); algunos handlers ya validan con `supabase.auth.getUser(token)` (`users.js:11-21`); existe un gateway por API key para integraciones (`routes/api-gateway.js`, tabla de `scripts/14_api_keys.sql`). Pero ~24 routers no validan nada y el servicio usa la service_role key (sin RLS).
- **Problema**: qué mecanismo global aplicar y cómo tratar las rutas que deben seguir siendo públicas.
- **Opciones**:
  - **A. Middleware global de JWT Supabase + roles (recomendada)**: generaliza el patrón ya existente en `users.js`; lista blanca explícita: `/health`, `/webhooks/stripe` (firma propia), endpoint público de payment link del pagador (identificarlo), `/api/*` (API key). Roles desde `user_profiles`. Pros: cero cambios en el cliente; coherente con lo que ya hay. Contras: una llamada a Supabase Auth por request (cacheable; o verificar el JWT localmente con el secret/JWKS del proyecto para evitar el round-trip).
  - **B. Pasar todo por el gateway de API keys**: obligaría a reescribir el cliente y mezcla auth de usuarios con auth de máquinas. Descartable.
  - **C. Activar RLS + anon key por usuario**: el modelo más robusto a largo plazo (la BD aplica permisos), pero implica reescribir el acceso a datos de los 4 servicios y revisar todas las policies (`rls_policies_v2.sql`). Demasiado grande como primer paso.
- **Decisión recomendada**: **A** ahora; **C** como evolución posterior si se quiere defensa en profundidad.
- **Impacto**: REPAIR-03/04/08/20 dependen de esta decisión. **Pregunta abierta para el humano**: ¿qué roles deben poder usar `/payments`, `/fees`, `/payroll`, `/expenses`? La matriz del Sidebar (`Sidebar.tsx:216-223`) se tomará como fuente salvo indicación contraria.

### ADR-3 — raw_password: ¿feature deliberada o deuda a eliminar? (soporta REPAIR-05)
- **Contexto**: `users.js:198,297` guarda la contraseña en claro en `user_profiles.raw_password`. No hay comentario ni doc que explique por qué; el patrón típico es "que el admin pueda ver/compartir la contraseña creada".
- **Problema**: almacenar contraseñas en claro es indefendible (cualquier lectura de la tabla las expone, y hoy `GET /users` ni siquiera exige auth), pero si el flujo de onboarding del equipo depende de "copiar la contraseña desde la app", eliminarla rompe ese flujo.
- **Opciones**:
  - **A. Eliminar columna y campo; onboarding vía email de invitación/reset de Supabase (recomendada)**. Pros: elimina el riesgo de raíz con el mecanismo estándar. Contras: cambia el flujo del admin.
  - **B. Mostrar la contraseña solo una vez al crearla (no persistirla)**. Pros: conserva el "copiar y pasar por WhatsApp". Contras: requiere tocar la UI de creación.
  - **C. Mantenerla** — no defendible; se lista solo por completitud.
- **Decisión recomendada**: **A** (o B si el flujo manual es irrenunciable). **Pregunta abierta para el humano**: ¿algún proceso del equipo consulta hoy `raw_password`?

### ADR-4 — Destino de billing-service (soporta REPAIR-16)
- **Contexto**: servicio con modelo contratos + ledger de doble entrada, un endpoint funcional, desplegado en `/api/billing` y sin un solo consumidor detectable en el repo. La facturación real vive en admin-service (billing matrix).
- **Opciones**:
  - **A. Retirar del despliegue y borrar (recomendada)**: queda en el historial de git si se quiere recuperar. Pros: menos superficie de ataque (hoy es un endpoint de escritura sin auth expuesto), menos confusión. Contras: si había planes de migrar al modelo ledger, se pierde el andamiaje visible.
  - **B. Conservar pero des-desplegar**: quitar `api/billing` y el rewrite, mantener el código con README que explique su estado experimental. Pros: conserva el trabajo visible. Contras: código sin dueño tiende a pudrirse.
  - **C. Conservar desplegado y protegerlo con la auth de REPAIR-03**: solo si alguien lo usa.
- **Decisión recomendada**: **A**, previa comprobación en logs de Vercel (últimos 30 días) de que `/api/billing/*` no recibe tráfico. **Pregunta abierta para el humano**: ¿hay algún plan vivo para el modelo de contratos/ledger?

### ADR-5 — docker-compose.yml (soporta REPAIR-12)
- **Contexto**: describe 6 contenedores de una arquitectura que ya no existe (3 directorios inexistentes, puertos incorrectos, 5 variables que nadie lee, sin Dockerfiles).
- **Opciones**:
  - **A. Eliminarlo (recomendada)**: el flujo local real es `npm run dev` (concurrently + proxy de Vite) y el despliegue es Vercel. Pros: elimina una trampa para quien lo intente usar. Contras: ninguno práctico.
  - **B. Reescribirlo** para los 4 servicios reales + client. Pros: entorno reproducible con contenedores. Contras: trabajo no trivial (crear 5 Dockerfiles) sin demanda conocida.
- **Decisión recomendada**: **A**, salvo que el equipo quiera contenedores para onboarding.

---

## Ítems sin ficha (registrados, no planificados)

- **GAP-33** (30 ramas remotas sin podar): acción operativa en GitHub para el administrador, no de código.
- **Refactor de archivos-Dios** (`DepartmentPL.tsx` 2.426 líneas, `PLMatrix.tsx` 1.679, etc.): deliberadamente fuera del plan — sin tests (REPAIR-24 es el prerequisito), un refactor estructural de ese tamaño tiene más riesgo de regresión que beneficio inmediato. Re-evaluar tras tener red de tests.
- **Actualización mayor de express 4→5 y joi 17→18**: breaking changes sin urgencia de seguridad equivalente (lo crítico se cubre en REPAIR-07); backlog.
- **Service worker / PWA real**: el plan corrige la documentación (REPAIR-14); implementar offline es una feature nueva, no una reparación.
