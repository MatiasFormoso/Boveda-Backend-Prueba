-- Bóveda — esquema PostgreSQL
-- Ledger inmutable, saldo no negativo, operaciones atómicas con FOR UPDATE.

-- UUIDs vía gen_random_uuid(), nativo en PostgreSQL 13+.
-- En versiones anteriores: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Limpieza para reejecución idempotente del script -----------------------------
DROP TRIGGER  IF EXISTS trg_movements_immutable ON movements;
DROP FUNCTION IF EXISTS movements_prevent_mutation() CASCADE;
DROP FUNCTION IF EXISTS wallet_deposit(uuid, numeric, text, text) CASCADE;
DROP FUNCTION IF EXISTS wallet_withdraw(uuid, numeric, text, text) CASCADE;
DROP FUNCTION IF EXISTS wallet_transfer(uuid, uuid, numeric, text, text) CASCADE;
DROP TABLE    IF EXISTS movements CASCADE;
DROP TABLE    IF EXISTS wallet_operations CASCADE;
DROP TABLE    IF EXISTS accounts CASCADE;
DROP TYPE     IF EXISTS movement_type CASCADE;
DROP TYPE     IF EXISTS operation_type CASCADE;

-- ============================================================================
--  TIPOS
-- ============================================================================
CREATE TYPE operation_type AS ENUM ('deposito', 'debito', 'transferencia');

CREATE TYPE movement_type AS ENUM (
  'deposito',
  'debito',
  'transferencia_entrada',
  'transferencia_salida'
);

-- ============================================================================
--  TABLAS
-- ============================================================================

CREATE TABLE accounts (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  titular     text          NOT NULL CHECK (length(trim(titular)) > 0),
  balance     numeric(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE wallet_operations (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  op_type          operation_type NOT NULL,
  idempotency_key  text           UNIQUE,
  created_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE TABLE movements (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid          NOT NULL REFERENCES wallet_operations(id),
  account_id    uuid          NOT NULL REFERENCES accounts(id),
  type          movement_type NOT NULL,
  amount        numeric(18,2) NOT NULL CHECK (amount > 0),
  balance_after numeric(18,2) NOT NULL CHECK (balance_after >= 0),
  description   text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_movements_account_created ON movements (account_id, created_at DESC);
CREATE INDEX idx_movements_operation       ON movements (operation_id);

-- ============================================================================
--  INMUTABILIDAD DEL LEDGER
-- ============================================================================
CREATE OR REPLACE FUNCTION movements_prevent_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos son inmutables: no se permite % sobre la tabla movements', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movements_immutable
  BEFORE UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION movements_prevent_mutation();

-- ============================================================================
--  FUNCIONES DE OPERACIÓN
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet_deposit(
  p_account_id uuid,
  p_amount     numeric,
  p_idem       text DEFAULT NULL,
  p_desc       text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_op_id      uuid;
  v_new_balance numeric(18,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto a acreditar debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;

  IF p_idem IS NOT NULL THEN
    SELECT id INTO v_op_id FROM wallet_operations WHERE idempotency_key = p_idem;
    IF FOUND THEN
      RETURN v_op_id;
    END IF;
  END IF;

  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_account_id USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO wallet_operations (op_type, idempotency_key)
  VALUES ('deposito', p_idem)
  RETURNING id INTO v_op_id;

  UPDATE accounts
     SET balance = balance + p_amount, updated_at = now()
   WHERE id = p_account_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO movements (operation_id, account_id, type, amount, balance_after, description)
  VALUES (v_op_id, p_account_id, 'deposito', p_amount, v_new_balance, p_desc);

  RETURN v_op_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wallet_withdraw(
  p_account_id uuid,
  p_amount     numeric,
  p_idem       text DEFAULT NULL,
  p_desc       text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_op_id       uuid;
  v_balance     numeric(18,2);
  v_new_balance numeric(18,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto a debitar debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;

  IF p_idem IS NOT NULL THEN
    SELECT id INTO v_op_id FROM wallet_operations WHERE idempotency_key = p_idem;
    IF FOUND THEN
      RETURN v_op_id;
    END IF;
  END IF;

  SELECT balance INTO v_balance FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_account_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente: disponible %, solicitado %', v_balance, p_amount
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO wallet_operations (op_type, idempotency_key)
  VALUES ('debito', p_idem)
  RETURNING id INTO v_op_id;

  UPDATE accounts
     SET balance = balance - p_amount, updated_at = now()
   WHERE id = p_account_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO movements (operation_id, account_id, type, amount, balance_after, description)
  VALUES (v_op_id, p_account_id, 'debito', p_amount, v_new_balance, p_desc);

  RETURN v_op_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wallet_transfer(
  p_from_id uuid,
  p_to_id   uuid,
  p_amount  numeric,
  p_idem    text DEFAULT NULL,
  p_desc    text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_op_id       uuid;
  v_from_balance numeric(18,2);
  v_to_balance   numeric(18,2);
  v_first  uuid;
  v_second uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto a transferir debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'La cuenta origen y destino no pueden ser la misma' USING ERRCODE = '22023';
  END IF;

  IF p_idem IS NOT NULL THEN
    SELECT id INTO v_op_id FROM wallet_operations WHERE idempotency_key = p_idem;
    IF FOUND THEN
      RETURN v_op_id;
    END IF;
  END IF;

  v_first  := LEAST(p_from_id, p_to_id);
  v_second := GREATEST(p_from_id, p_to_id);
  PERFORM 1 FROM accounts WHERE id = v_first  FOR UPDATE;
  PERFORM 1 FROM accounts WHERE id = v_second FOR UPDATE;

  SELECT balance INTO v_from_balance FROM accounts WHERE id = p_from_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta origen % no existe', p_from_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT balance INTO v_to_balance FROM accounts WHERE id = p_to_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta destino % no existe', p_to_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente en origen: disponible %, solicitado %', v_from_balance, p_amount
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO wallet_operations (op_type, idempotency_key)
  VALUES ('transferencia', p_idem)
  RETURNING id INTO v_op_id;

  UPDATE accounts SET balance = balance - p_amount, updated_at = now()
   WHERE id = p_from_id RETURNING balance INTO v_from_balance;
  INSERT INTO movements (operation_id, account_id, type, amount, balance_after, description)
  VALUES (v_op_id, p_from_id, 'transferencia_salida', p_amount, v_from_balance,
          COALESCE(p_desc, 'Transferencia enviada'));

  UPDATE accounts SET balance = balance + p_amount, updated_at = now()
   WHERE id = p_to_id RETURNING balance INTO v_to_balance;
  INSERT INTO movements (operation_id, account_id, type, amount, balance_after, description)
  VALUES (v_op_id, p_to_id, 'transferencia_entrada', p_amount, v_to_balance,
          COALESCE(p_desc, 'Transferencia recibida'));

  RETURN v_op_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW account_summary AS
SELECT
  a.id,
  a.titular,
  a.balance,
  COALESCE(SUM(m.amount) FILTER (WHERE m.type IN ('deposito','transferencia_entrada')), 0) AS total_acreditado,
  COALESCE(SUM(m.amount) FILTER (WHERE m.type IN ('debito','transferencia_salida')), 0)    AS total_debitado,
  COUNT(m.id) AS cantidad_movimientos
FROM accounts a
LEFT JOIN movements m ON m.account_id = a.id
GROUP BY a.id, a.titular, a.balance;

-- SEED
DO $$
DECLARE
  v_ariel  uuid;
  v_mica   uuid;
  v_negoc  uuid;
BEGIN
  INSERT INTO accounts (titular) VALUES ('Ariel Gómez')      RETURNING id INTO v_ariel;
  INSERT INTO accounts (titular) VALUES ('Micaela Fernández') RETURNING id INTO v_mica;
  INSERT INTO accounts (titular) VALUES ('Kiosco El Sol')     RETURNING id INTO v_negoc;

  PERFORM wallet_deposit(v_ariel, 150000.00, NULL, 'Carga inicial');
  PERFORM wallet_deposit(v_mica,   80000.00, NULL, 'Carga inicial');
  PERFORM wallet_deposit(v_negoc,  25000.00, NULL, 'Carga inicial');

  PERFORM wallet_withdraw(v_ariel, 12000.00, NULL, 'Pago de servicio');
  PERFORM wallet_transfer(v_ariel, v_negoc, 8500.00, NULL, 'Compra en kiosco');
  PERFORM wallet_transfer(v_mica,  v_ariel, 15000.00, NULL, 'Devolución de préstamo');
  PERFORM wallet_withdraw(v_negoc,  5000.00, NULL, 'Retiro de caja');
END $$;
