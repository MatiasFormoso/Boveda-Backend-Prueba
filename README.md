# Bóveda — Backend

API REST de una billetera digital: cuentas con saldo, cargas, débitos, transferencias e historial de movimientos inmutable.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL · `pg` · Zod

---

## Requisitos

- Node.js 20+
- PostgreSQL 13+ (`gen_random_uuid()` nativo)
- Cuenta de Git y [GitHub CLI](https://cli.github.com/) (solo para clonar/contribuir al remoto)

---

## Arranque local

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/MatiasFormoso/Boveda-Backend-Prueba.git
cd Boveda-Backend-Prueba
npm install

# 2. Variables de entorno
cp .env.example .env
# Ajustar DATABASE_URL según tu instalación de PostgreSQL

# 3. Crear la base de datos
createdb boveda

# 4. Aplicar esquema y datos de prueba
npm run db:setup

# 5. Levantar el servidor
npm run dev
```

La API queda disponible en `http://localhost:3000`.  
La página de inicio muestra el estado de la conexión a PostgreSQL.

### Verificación rápida

```bash
# Listar cuentas del seed
curl http://localhost:3000/api/accounts

# Crear cuenta
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"titular": "Juan Pérez"}'
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
| `GET` | `/api/accounts/:id/movements` | Historial de movimientos |

Las operaciones que modifican saldo aceptan el header opcional `Idempotency-Key`.  
Los errores se devuelven como `{ "error": "mensaje" }` con el código HTTP correspondiente (400, 404, 409, 422, 500).

---

## Arquitectura y decisiones

### Capa de API vs lógica de negocio en PostgreSQL

La API valida entradas con **Zod** (montos positivos, UUIDs válidos, cuentas distintas en transferencias) y delega las operaciones de saldo a funciones **PL/pgSQL** definidas en `sql/boveda_schema.sql`:

- `wallet_deposit`
- `wallet_withdraw`
- `wallet_transfer`

Esa separación concentra la integridad financiera en la base de datos: aunque la capa HTTP falle o se reintente una petición, las reglas de saldo se aplican siempre en el mismo lugar.

### Concurrencia y saldo no negativo

Cada función de operación toma un **bloqueo de fila** (`SELECT … FOR UPDATE`) sobre la cuenta afectada antes de leer o modificar el saldo. Las operaciones concurrentes sobre la misma cuenta se serializan a nivel de base, evitando condiciones de carrera.

En transferencias, los locks se adquieren en **orden determinístico** (`LEAST` / `GREATEST` sobre los UUID de origen y destino) para prevenir deadlocks cuando dos transferencias cruzadas ocurren al mismo tiempo.

Como última línea de defensa, la columna `balance` tiene `CHECK (balance >= 0)`. Si por algún error de lógica se intentara dejar un saldo negativo, PostgreSQL rechaza la transacción completa.

### Ledger inmutable

Los movimientos viven en la tabla `movements` y un **trigger** impide `UPDATE` y `DELETE`. El saldo vigente en `accounts` es un derivado optimizado; el historial es la fuente auditable.

### Idempotencia

Las operaciones de saldo se agrupan en `wallet_operations`, con una columna `idempotency_key` y constraint **`UNIQUE`**.

Cuando el cliente reenvía una petición con la misma clave, la función PL/pgSQL detecta la operación existente y devuelve su ID sin volver a debitar ni acreditar. La API propaga el header `Idempotency-Key` tal cual llega en la request.

### Dinero sin pérdida de precisión

Los montos se almacenan como `NUMERIC(18,2)`. La API convierte los valores validados por Zod a string con dos decimales antes de pasarlos a PostgreSQL, evitando errores de redondeo de punto flotante.

---

## Estructura del proyecto

```
├── sql/boveda_schema.sql     Esquema, funciones PL/pgSQL, trigger y seed
├── scripts/db-setup.ts       Aplica el esquema contra DATABASE_URL
├── src/
│   ├── app/api/              Route Handlers (contrato REST)
│   └── lib/
│       ├── db.ts             Pool de conexión (pg)
│       ├── validations.ts    Esquemas Zod
│       ├── accounts.ts       Consultas y llamadas a funciones wallet_*
│       └── api.ts            Mapeo de errores HTTP
└── .env.example
```

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor en modo producción |
| `npm run db:setup` | Aplica `sql/boveda_schema.sql` + seed |
| `npm run lint` | ESLint |

> `db:setup` está pensado para desarrollo: el script hace `DROP` de objetos previos para poder reejecutarse de forma idempotente.

---

## Autor

Matías Agustín Formoso — Prueba técnica Backend, Magne Studios (2026).
