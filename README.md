# Bóveda — Backend

API REST de una billetera digital: cuentas con saldo, cargas, débitos, transferencias e historial de movimientos inmutable.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL · `pg` · Zod · Vitest

**Repositorio:** https://github.com/MatiasFormoso/Boveda-Backend-Prueba

---

## Requisitos

- Node.js 20+
- PostgreSQL 13+ (`gen_random_uuid()` nativo)

---

## Arranque local

```bash
git clone https://github.com/MatiasFormoso/Boveda-Backend-Prueba.git
cd Boveda-Backend-Prueba
npm install

cp .env.example .env
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boveda

createdb boveda          # o: docker compose up -d
npm run db:setup
npm run dev
```

La API queda en `http://localhost:3000`. La home muestra el estado de la conexión a PostgreSQL.

### Verificación rápida

```bash
npm test                 # tests de integración (concurrencia + idempotencia)
npm run build            # compila sin errores
```

---

## API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/accounts` | Crea una cuenta (`{ titular }`) → **201** |
| `GET` | `/api/accounts` | Lista cuentas con saldo |
| `GET` | `/api/accounts/:id` | Detalle de una cuenta |
| `POST` | `/api/accounts/:id/deposit` | Acredita saldo (`{ amount }`) |
| `POST` | `/api/accounts/:id/withdraw` | Debita saldo (`{ amount }`) |
| `POST` | `/api/transfers` | Transfiere (`{ fromId, toId, amount }`) |
| `GET` | `/api/accounts/:id/movements` | Historial (filtros opcionales) |
| `GET` | `/api/accounts/:id/summary` | Resumen RF-RES-001 |

### Filtros de movimientos (RF-RES-002)

```
GET /api/accounts/:id/movements?type=WITHDRAW&startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z
```

| Parámetro | Valores | Mapeo interno en DB |
|-----------|---------|---------------------|
| `type=DEPOSIT` | acreditaciones | `deposito` |
| `type=WITHDRAW` | débitos | `debito` |
| `type=TRANSFER` | transferencias | `transferencia_entrada`, `transferencia_salida` |
| `startDate` / `endDate` | ISO 8601 | filtro sobre `movements.created_at` |

### Idempotencia

Operaciones de saldo aceptan el header opcional `Idempotency-Key`. Reintentos con la misma clave no duplican el efecto (RF-CNC-002).

### Errores

Formato uniforme: `{ "error": "mensaje descriptivo" }`

| Código | Cuándo |
|--------|--------|
| **400** | Monto inválido, cuentas iguales en transferencia |
| **404** | Cuenta inexistente |
| **409** | Saldo insuficiente |
| **422** | Validación Zod (body mal formado) |
| **500** | Error interno (sin stack trace al cliente) |

---

## Cumplimiento del DRF (módulos A–G)

| Módulo | Requisitos | Cómo se cumple |
|--------|------------|----------------|
| **A — Cuentas** | RF-CTA-001/002/003 | CRUD de cuentas; saldo inicial 0 al crear |
| **B — Cargas** | RF-CAR-001/002/003 | `deposit` + Zod + movimiento `deposito` en ledger |
| **C — Débitos** | RF-DEB-001/002/003 | `withdraw` + rechazo 409 si saldo insuficiente |
| **D — Transferencias** | RF-TRF-001–004 | `wallet_transfer` atómica; 2 movimientos vinculados por `operation_id` |
| **E — Movimientos** | RF-MOV-001–004 | Historial con `balanceAfter`; trigger anti UPDATE/DELETE |
| **F — Concurrencia** | RF-CNC-001–003 | `FOR UPDATE`, idempotencia, tests automatizados |
| **G — Resumen** *(deseable)* | RF-RES-001/002 | `/summary` + filtros en `/movements` |

---

## Validación funcional del frontend

El DRF menciona un frontend provisto que consume la API sin modificarlo. El ZIP de la consigna (`Prueba-9-7-26-main`) es un **mockup de UX**: su README indica que no persiste datos ni llama al backend; las operaciones viven en memoria (`StoreContext.tsx`).

**Decisión:** no modificar el frontend (cumpliendo la restricción del DRF). Validación realizada con:

| Herramienta | Archivo |
|-------------|---------|
| Colección Postman | `Boveda_Postman_Collection.json` |
| REST Client (editor) | `api-tests.http` |
| Tests automatizados | `npm test` |

Si disponen del cliente final conectado a la API, los endpoints están listos sin cambios.

---

## Arquitectura y decisiones de diseño

### 1. Next.js App Router + `pg` directo (sin ORM)

**Por qué:** el DRF fija PostgreSQL y sugiere ledger con funciones en base. Usar `pg` permite invocar `wallet_deposit`, `wallet_withdraw` y `wallet_transfer` directamente, sin que un ORM opaque locks, transacciones ni tipos `NUMERIC`.

**Capas:**
- `src/app/api/` — Route Handlers (contrato HTTP, códigos de estado)
- `src/lib/validations.ts` — Zod (validación de entrada antes de tocar la DB)
- `src/lib/accounts.ts` — consultas y llamadas a funciones PL/pgSQL
- `src/lib/api.ts` — mapeo de errores PostgreSQL → HTTP
- `sql/boveda_schema.sql` — esquema, triggers, funciones, seed

### 2. Lógica financiera en PL/pgSQL

**Por qué:** la integridad del saldo es el núcleo de la evaluación (módulo F). Centralizar en la base garantiza que las reglas se apliquen igual vía API, tests o reintentos, sin depender solo de la capa Node.

**Funciones:**
- `wallet_deposit` — acredita con lock `FOR UPDATE`
- `wallet_withdraw` — debita; valida saldo antes de modificar
- `wallet_transfer` — atómica; debita origen y acredita destino en la misma transacción

### 3. Concurrencia: `FOR UPDATE` + orden determinístico

**Por qué (RF-CNC-001):** múltiples operaciones simultáneas sobre la misma cuenta deben serializarse. `SELECT … FOR UPDATE` bloquea la fila hasta fin de transacción.

**Transferencias:** locks en orden `LEAST(id)` / `GREATEST(id)` para evitar deadlocks cuando A→B y B→A ocurren al mismo tiempo.

**Última defensa:** `CHECK (balance >= 0)` en `accounts` — aunque fallara la lógica, PostgreSQL rechaza saldos negativos.

### 4. Ledger inmutable

**Por qué (RF-MOV-003):** trigger `trg_movements_immutable` impide `UPDATE` y `DELETE` en `movements`. El saldo en `accounts` es un derivado optimizado; el historial es la fuente auditable.

### 5. Idempotencia

**Por qué (RF-CNC-002):** `wallet_operations.idempotency_key` con constraint `UNIQUE`. Si la clave ya existe, la función devuelve el `operation_id` existente sin re-ejecutar. La API propaga el header `Idempotency-Key`.

### 6. Dinero sin floats

**Por qué:** `NUMERIC(18,2)` en PostgreSQL. La API valida con Zod (`amount > 0`) y convierte a string con dos decimales antes de pasar a la función.

### 7. Validación en dos capas

| Capa | Responsabilidad |
|------|-----------------|
| **Zod** (API) | Formato, tipos, montos > 0, UUIDs válidos, cuentas distintas |
| **PL/pgSQL** (DB) | Saldo suficiente, existencia de cuenta, reglas de negocio bajo concurrencia |

### 8. Migraciones y seed

`npm run db:setup` ejecuta `sql/boveda_schema.sql` completo. El script hace `DROP` previo de objetos para ser reejecutable en desarrollo. El seed crea 3 cuentas de ejemplo usando las funciones `wallet_*` (saldo e historial consistentes).

---

## Tests automatizados

```bash
npm test
```

| Archivo | Qué prueba | RF |
|---------|------------|-----|
| `tests/concurrency.test.ts` | 50 retiros de $10 en paralelo sobre $100 → 10 éxitos, 40 rechazos, saldo $0 | RF-CNC-001 |
| `tests/idempotency.test.ts` | Reintento con misma clave en deposit, withdraw y transfer | RF-CNC-002 |

Los tests atacan la base directamente (funciones PL/pgSQL), no solo la capa HTTP.

---

## Estructura del proyecto

```
├── api-tests.http                  Pruebas REST Client (un clic desde el editor)
├── Boveda_Postman_Collection.json  Colección Postman completa
├── sql/boveda_schema.sql           Esquema, funciones, trigger, vista, seed
├── scripts/db-setup.ts             npm run db:setup
├── tests/
│   ├── concurrency.test.ts
│   ├── idempotency.test.ts
│   └── teardown.ts
├── docker-compose.yml              PostgreSQL local (opcional)
├── src/
│   ├── app/api/                    Route Handlers
│   └── lib/                        db, validations, accounts, api
└── .env.example
```

---

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (`:3000`) |
| `npm run build` | Build de producción |
| `npm run start` | Servidor en modo producción |
| `npm run db:setup` | Aplica esquema + seed |
| `npm test` | Tests de integración |
| `npm run lint` | ESLint |

---

## Supuestos

- Sin autenticación de usuarios (el DRF no lo requiere).
- Moneda única; montos en la misma unidad.
- `db:setup` con `DROP` previo es aceptable para desarrollo y evaluación local.
- El frontend del ZIP es mockup UX; la validación end-to-end se hizo por API.

---

## Autor

Matías Agustín Formoso — Prueba técnica Backend, Magne Studios (2026).
