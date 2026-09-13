import type { ValidationResult } from "@/lib/template-input";

// Request validation for the version endpoints. Same result shape as the
// template endpoints, so routes unwrap both the same way.

export const MAX_VERSION_NAME_LENGTH = 60;
const MAX_NOTES_LENGTH = 5000;

export function parseVersionName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Version name required", status: 400 };
  }
  const name = raw.trim();
  if (name.length > MAX_VERSION_NAME_LENGTH) {
    return {
      ok: false,
      error: `Version name must be ${MAX_VERSION_NAME_LENGTH} characters or fewer`,
      status: 400,
    };
  }
  return { ok: true, value: name };
}

/** Absent/null/blank all mean "no notes". */
export function parseVersionNotes(raw: unknown): ValidationResult<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "notes must be a string", status: 400 };
  if (raw.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer`, status: 400 };
  }
  return { ok: true, value: raw.trim() || null };
}

export const VERSION_NAME_TAKEN = "This deck already has a version with that name";
