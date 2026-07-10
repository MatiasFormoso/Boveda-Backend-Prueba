import { z } from "zod";

const uuid = z.string().uuid("Identificador de cuenta inválido");

export const createAccountSchema = z.object({
  titular: z
    .string({ required_error: "El titular es requerido" })
    .trim()
    .min(1, "El titular es requerido"),
});

export const amountSchema = z
  .number({
    required_error: "El monto es requerido",
    invalid_type_error: "El monto debe ser un número",
  })
  .finite("El monto debe ser un número válido")
  .positive("El monto debe ser mayor a cero");

export const depositSchema = z.object({
  amount: amountSchema,
});

export const withdrawSchema = z.object({
  amount: amountSchema,
});

export const transferSchema = z
  .object({
    fromId: uuid,
    toId: uuid,
    amount: amountSchema,
  })
  .refine((data) => data.fromId !== data.toId, {
    message: "La cuenta origen y destino no pueden ser la misma",
    path: ["toId"],
  });

export const accountIdParamSchema = z.object({
  id: uuid,
});

export const movementFilterTypeSchema = z.enum([
  "DEPOSIT",
  "WITHDRAW",
  "TRANSFER",
]);

export const movementQuerySchema = z.object({
  startDate: z
    .string()
    .datetime({ message: "startDate debe ser una fecha ISO válida" })
    .optional(),
  endDate: z
    .string()
    .datetime({ message: "endDate debe ser una fecha ISO válida" })
    .optional(),
  type: movementFilterTypeSchema.optional(),
});

export const MOVEMENT_FILTER_MAP: Record<
  z.infer<typeof movementFilterTypeSchema>,
  string[]
> = {
  DEPOSIT: ["deposito"],
  WITHDRAW: ["debito"],
  TRANSFER: ["transferencia_entrada", "transferencia_salida"],
};

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
