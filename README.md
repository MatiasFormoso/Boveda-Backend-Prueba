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

createdb boveda          # o docker compose up -d
npm run db:setup
npm run dev
```

La API queda en `http://localhost:3000`.

### PostgreSQL con Docker (opcional)

```bash
docker compose up -d
npm run db:setup
```

---

## API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/accounts` | Crea una cuenta (`{ titular }`) |
| `GET` | `/api/accounts` | Lista cuentas con saldo |
| `GET` | `/api/accounts/:id` | Detalle de una cuenta |
| `POST` | `/api/accounts/:id/deposit` | Acredita saldo (`{ amount }`) |
| `POST` | `/api/accounts/:id/withdraw` | Debita saldo (`{ amount }`) |
| `POST` | `/api/transfers` | Transfiere (`{ fromId, toId, amount }`) |
| `GET` | `/api/accounts/:id/movements` | Historial (filtros opcionales) |
| `GET` | `/api/accounts/:id/summary` | Resumen RF-RES-001 |

### Filtros de movimientos (RF-RES-002)

`GET /api/accounts/:id/movements?type=DEPOSIT&startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z`

| Parámetro | Valores |
|-----------|---------|
| `type` | `DEPOSIT`, `WITHDRAW`, `TRANSFER` |
| `startDate` / `endDate` | ISO 8601 |

Operaciones de saldo: header opcional `Idempotency-Key`.  
Errores: `{ "error": "mensaje" }` — 400, 404, 409, 422, 500.

---

## Validación funcional

El DRF indica un frontend provisto que consume la API sin modificarlo. El ZIP de la consigna incluye el **mockup de UX** (`Prueba-9-7-26-main`), cuyo README aclara que no persiste datos ni llama al backend: las operaciones de saldo se resuelven en memoria vía `StoreContext.tsx`.

Ante esa restricción, **no se modificó el frontend**. La validación del backend se realizó con:

- **`Boveda_Postman_Collection.json`** — todos los endpoints, casos de error e idempotencia
- **`npm test`** — tests de integración: concurrencia (50 retiros simultáneos) e idempotencia (deposit, withdraw, transfer)

Si disponen del cliente final conectado a la API, los endpoints están listos para consumirlo sin cambios.

---

## Arquitectura y decisiones

### API + PL/pgSQL

Zod valida entradas; las operaciones de saldo delegan a `wallet_deposit`, `wallet_withdraw` y `wallet_transfer` en `sql/boveda_schema.sql`.

### Concurrencia y saldo no negativo

`SELECT … FOR UPDATE` serializa operaciones por cuenta. Transferencias: locks en orden determinístico (`LEAST`/`GREATEST` de UUIDs). `CHECK (balance >= 0)` como última defensa.

### Ledger inmutable

Trigger que bloquea `UPDATE`/`DELETE` en `movements`.

### Idempotencia

`idempotency_key UNIQUE` en `wallet_operations`. Reintentos con la misma clave no duplican efecto.

### Dinero exacto

`NUMERIC(18,2)` en PostgreSQL; la API pasa montos como string con dos decimales.

---

## Estructura

```
├── Boveda_Postman_Collection.json
├── sql/boveda_schema.sql
├── scripts/db-setup.ts
├── tests/
│   ├── concurrency.test.ts
│   └── idempotency.test.ts
├── docker-compose.yml
└── src/app/api/          Route Handlers
```

---

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo |
| `npm run build` | Build producción |
| `npm run db:setup` | Esquema + seed |
| `npm test` | Tests de integración |
| `npm run lint` | ESLint |

---

## Autor

Matías Agustín Formoso — Prueba técnica Backend, Magne Studios (2026).
