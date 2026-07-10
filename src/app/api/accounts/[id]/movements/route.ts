import { NextResponse } from "next/server";
import {
  findAccountById,
  formatMovement,
  listMovements,
  type MovementFilters,
} from "@/lib/accounts";
import { handleRouteError, jsonError } from "@/lib/api";
import {
  accountIdParamSchema,
  MOVEMENT_FILTER_MAP,
  movementQuerySchema,
} from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

function parseMovementFilters(req: Request): MovementFilters {
  const { searchParams } = new URL(req.url);
  const raw = {
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  };

  const parsed = movementQuerySchema.parse(raw);
  const filters: MovementFilters = {};

  if (parsed.startDate) {
    filters.startDate = new Date(parsed.startDate);
  }
  if (parsed.endDate) {
    filters.endDate = new Date(parsed.endDate);
  }
  if (parsed.type) {
    filters.types = [...MOVEMENT_FILTER_MAP[parsed.type]];
  }

  return filters;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = accountIdParamSchema.parse(await params);
    const account = await findAccountById(id);

    if (!account) {
      return jsonError(404, `La cuenta ${id} no existe`);
    }

    const filters = parseMovementFilters(req);
    const movements = await listMovements(id, filters);
    return NextResponse.json(movements.map(formatMovement));
  } catch (err) {
    return handleRouteError(err);
  }
}
