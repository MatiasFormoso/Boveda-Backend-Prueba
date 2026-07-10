# Bóveda API

Backend REST de la billetera digital (prueba técnica Magne Studios).

Stack: Next.js 15 (App Router), TypeScript, PostgreSQL con `pg`.

## Requisitos

- Node.js 20+
- PostgreSQL 13+ (usa `gen_random_uuid()` nativo)

## Arranque local

```bash
# 1. Variables de entorno
cp .env.example .env
# Editar DATABASE_URL si hace falta

# 2. Crear la base (ejemplo)
createdb boveda

# 3. Dependencias
npm install

# 4. Esquema + datos de prueba
npm run db:setup

# 5. Servidor de desarrollo
npm run dev
```

La API queda en `http://localhost:3000`. La home muestra el estado de la conexión a PostgreSQL.

## Base de datos

El esquema completo está en `sql/boveda_schema.sql`. Incluye:

- Tablas `accounts`, `wallet_operations`, `movements`
- Trigger de inmutabilidad sobre el ledger
- Funciones `wallet_deposit`, `wallet_withdraw`, `wallet_transfer` con locks `FOR UPDATE`, idempotencia y orden determinístico en transferencias
- Vista `account_summary`
- Seed con tres cuentas de ejemplo

`npm run db:setup` ejecuta ese script contra `DATABASE_URL`. Está pensado para desarrollo: al inicio hace `DROP` de los objetos para poder reejecutarlo sin residuos.

## Próximos pasos

- Endpoints REST bajo `/api` según contrato del DRF
- Validación de payloads con Zod
- Header `Idempotency-Key` en operaciones de saldo
