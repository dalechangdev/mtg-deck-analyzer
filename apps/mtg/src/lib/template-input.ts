import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Shared request validation for the template endpoints. POST and PATCH accept
// the same body — PATCH just treats every field as optional — so the rules live
// here rather than being half-enforced in one route and not the other.
//
// Anything this file lets through must be safe for Prisma: a bad roleId, a
// repeated role, or a string where an Int belongs all surface as an opaque 500
// from the query engine, which the client can only report as "save failed".

export type RequirementInput = {
  roleId: string;
  targetCount: number;
  minCount: number | null;
  maxCount: number | null;
  note: string | null;
};

/**
 * A validated body. Keys are present only when the request supplied them, so
 * PATCH can pass this straight to Prisma without overwriting untouched columns.
 * `description: null` is a real value — clearing the field — and is why this
 * distinguishes "absent" from "null".
 */
export type TemplateInput = {
  name?: string;
  description?: string | null;
  format?: string;
  deckSize?: number;
  requirements?: RequirementInput[];
};

export type ValidationFailure = { ok: false; error: string; status: 400 | 409 };
export type ValidationResult<T> = { ok: true; value: T } | ValidationFailure;

const MAX_NAME_LENGTH = 100;
const MAX_FORMAT_LENGTH = 40;
const MAX_COUNT = 999;
const MAX_DECK_SIZE = 1000;

function fail(error: string, status: 400 | 409 = 400): ValidationFailure {
  return { ok: false, error, status };
}

/** A whole number within range — rejects NaN, floats, and numeric strings. */
function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

/**
 * `await req.json()` throws on an empty or malformed body, which without this
 * escapes the route as a 500.
 */
export function readJsonBody(req: Request): Promise<ValidationResult<Record<string, unknown>>> {
  return parseBody(req, { required: true });
}

/**
 * The same, for endpoints whose body only carries overrides — no body at all is
 * a valid request, but a malformed one is still an error.
 */
export function readOptionalJsonBody(
  req: Request
): Promise<ValidationResult<Record<string, unknown>>> {
  return parseBody(req, { required: false });
}

async function parseBody(
  req: Request,
  { required }: { required: boolean }
): Promise<ValidationResult<Record<string, unknown>>> {
  const text = (await req.text()).trim();
  if (!text) {
    return required ? fail("Request body is not valid JSON") : { ok: true, value: {} };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("Request body is not valid JSON");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("Request body must be a JSON object");
  }
  return { ok: true, value: body as Record<string, unknown> };
}

function validateRequirements(raw: unknown): ValidationResult<RequirementInput[]> {
  if (!Array.isArray(raw)) return fail("`requirements` must be an array");
  if (raw.length === 0) return fail("At least one requirement is required");

  const requirements: RequirementInput[] = [];

  for (const [i, entry] of raw.entries()) {
    const at = `Requirement ${i + 1}`;
    if (typeof entry !== "object" || entry === null) return fail(`${at} must be an object`);

    const r = entry as Record<string, unknown>;
    const roleId = typeof r.roleId === "string" ? r.roleId.trim() : "";
    if (!roleId) return fail(`${at} is missing a role`);

    if (!isCount(r.targetCount, MAX_COUNT)) {
      return fail(`${at} (${roleId}): target must be a whole number between 0 and ${MAX_COUNT}`);
    }

    const minCount = r.minCount ?? null;
    const maxCount = r.maxCount ?? null;
    if (minCount !== null && !isCount(minCount, MAX_COUNT)) {
      return fail(`${at} (${roleId}): min must be a whole number between 0 and ${MAX_COUNT}`);
    }
    if (maxCount !== null && !isCount(maxCount, MAX_COUNT)) {
      return fail(`${at} (${roleId}): max must be a whole number between 0 and ${MAX_COUNT}`);
    }
    if (minCount !== null && maxCount !== null && minCount > maxCount) {
      return fail(`${at} (${roleId}): min ${minCount} is above max ${maxCount}`);
    }

    // A target outside its own bounds can never be met — the evaluator scores
    // against min/max, so the target would read as "under" or "over" forever.
    if (minCount !== null && r.targetCount < minCount) {
      return fail(`${at} (${roleId}): target ${r.targetCount} is below min ${minCount}`);
    }
    if (maxCount !== null && r.targetCount > maxCount) {
      return fail(`${at} (${roleId}): target ${r.targetCount} is above max ${maxCount}`);
    }

    if (r.note !== undefined && r.note !== null && typeof r.note !== "string") {
      return fail(`${at} (${roleId}): note must be a string or null`);
    }

    requirements.push({
      roleId,
      targetCount: r.targetCount,
      minCount,
      maxCount,
      note: toNullableString(r.note),
    });
  }

  // TemplateRequirement is unique on (templateId, roleId).
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { roleId } of requirements) {
    if (seen.has(roleId)) repeated.add(roleId);
    seen.add(roleId);
  }
  if (repeated.size > 0) {
    return fail(`Each role can appear only once — repeated: ${[...repeated].join(", ")}`);
  }

  return { ok: true, value: requirements };
}

/** A create body, once validated — name and requirements are guaranteed. */
export type NewTemplateInput = TemplateInput & {
  name: string;
  requirements: RequirementInput[];
};

/** POST bodies: name and requirements required, everything else defaulted. */
export async function validateNewTemplate(
  body: Record<string, unknown>,
  ownerId: string
): Promise<ValidationResult<NewTemplateInput>> {
  const result = await validate(body, "create", ownerId);
  return result.ok ? { ok: true, value: result.value as NewTemplateInput } : result;
}

/**
 * PATCH bodies: every field optional, and the template being updated is excluded
 * from the name check so a no-op rename doesn't collide with itself.
 */
export async function validateTemplateUpdate(
  body: Record<string, unknown>,
  ownerId: string,
  templateId: string
): Promise<ValidationResult<TemplateInput>> {
  return validate(body, "update", ownerId, templateId);
}

/**
 * The shared rules, including the two checks that need the database: that every
 * role exists, and that the name is free.
 */
async function validate(
  body: Record<string, unknown>,
  mode: "create" | "update",
  ownerId: string,
  templateId?: string
): Promise<ValidationResult<TemplateInput>> {
  const input: TemplateInput = {};

  if ("name" in body || mode === "create") {
    const name = validateName(body.name);
    if (!name.ok) return name;
    input.name = name.value;
  }

  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return fail("`description` must be a string or null");
    }
    input.description = toNullableString(body.description);
  }

  // Absent on a create means "take the column default", so neither needs a
  // mode check — only a supplied value has to be sane.
  if ("format" in body) {
    const format = typeof body.format === "string" ? body.format.trim() : "";
    if (!format) return fail("`format` must be a non-empty string");
    if (format.length > MAX_FORMAT_LENGTH) {
      return fail(`Format must be ${MAX_FORMAT_LENGTH} characters or fewer`);
    }
    input.format = format;
  }

  if ("deckSize" in body) {
    if (!isCount(body.deckSize, MAX_DECK_SIZE) || body.deckSize < 1) {
      return fail(`Deck size must be a whole number between 1 and ${MAX_DECK_SIZE}`);
    }
    input.deckSize = body.deckSize;
  }

  // Requirements are replaced wholesale, so an update that omits them keeps the
  // ones already stored; a create must supply them.
  if ("requirements" in body || mode === "create") {
    const result = validateRequirements(body.requirements);
    if (!result.ok) return result;
    input.requirements = result.value;
  }

  if (input.requirements) {
    const unknown = await findUnknownRoles(input.requirements.map((r) => r.roleId));
    if (unknown.length > 0) return fail(`Unknown roles: ${unknown.join(", ")}`);
  }

  if (input.name && (await nameIsTaken(input.name, ownerId, templateId))) {
    return fail("A template with that name already exists", 409);
  }

  return { ok: true, value: input };
}

/** Requirement roles must exist — the FK would otherwise fail opaquely. */
async function findUnknownRoles(roleIds: string[]): Promise<string[]> {
  const roles = await prisma.cardRole.findMany({
    where: { id: { in: roleIds } },
    select: { id: true },
  });
  const known = new Set(roles.map((r) => r.id));
  return [...new Set(roleIds.filter((id) => !known.has(id)))];
}

/** Trim and bounds-check a name. Shared with the duplicate endpoint. */
export function validateName(raw: unknown): ValidationResult<string> {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return fail("Name is required");
  if (name.length > MAX_NAME_LENGTH) {
    return fail(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return { ok: true, value: name };
}

/**
 * The first free name in the `X (copy)`, `X (copy 2)`, `X (copy 3)` sequence.
 * `taken` is every existing name, so duplicating the same template repeatedly
 * keeps working instead of colliding on the second try. The base is trimmed to
 * leave room for the suffix when the source name is already at the limit.
 */
export function nextCopyName(sourceName: string, taken: Iterable<string>): string {
  const used = new Set(taken);

  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
    const base = sourceName.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Names are unique per owner, not globally — two accounts may each keep a
 * template called "Commander Baseline". Passing the wrong ownerId here would
 * leak the existence of another account's template names through 409s.
 */
export async function nameIsTaken(
  name: string,
  ownerId: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.analysisTemplate.findUnique({
    where: { ownerId_name: { ownerId, name } },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

/**
 * The name check above races: two requests can both pass it and one then hits
 * the unique index. Catching P2002 turns that 500 into the same 409.
 *
 * `field` matters — P2002 covers every unique index on the model's write, so a
 * catch-all would report a repeated (templateId, roleId) as a name collision.
 *
 * Where the columns are reported varies:
 * - driver adapter, `constraint.fields` — quoted when camelCase;
 * - driver adapter, `constraint.index` only — e.g. `DeckVersion_deckId_name_key`,
 *   which is what the pg adapter actually returns for these composite indexes;
 * - `meta.target` — the shape without an adapter.
 */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const meta = error.meta as
    | {
        target?: string | string[];
        modelName?: string;
        driverAdapterError?: {
          cause?: { constraint?: { fields?: string[]; index?: string }; table?: string };
        };
      }
    | undefined;

  const cause = meta?.driverAdapterError?.cause;
  const target =
    cause?.constraint?.fields ??
    meta?.target ??
    fieldsFromIndexName(cause?.constraint?.index, cause?.table ?? meta?.modelName) ??
    [];
  const fields = (Array.isArray(target) ? target : [target]).map((f) => f.replace(/"/g, ""));

  return fields.includes(field);
}

/**
 * Prisma names a unique index `{Model}_{field}_{field}_key`, so the columns can
 * be read back out of the name. A custom `map:` name, or one Postgres truncated
 * at 63 bytes, won't parse — then nothing matches and the caller's 500 stands,
 * which is the safe direction to fail.
 */
function fieldsFromIndexName(index?: string, table?: string): string[] | undefined {
  if (!index || !table) return undefined;
  const prefix = `${table}_`;
  const suffix = "_key";
  if (!index.startsWith(prefix) || !index.endsWith(suffix)) return undefined;
  return index.slice(prefix.length, -suffix.length).split("_");
}

