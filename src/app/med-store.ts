import { normalizeMedication } from "../core/medications.ts";
import type { Medication } from "../core/medications.ts";

/** كل الأدوية بما فيها المحذوفة (tombstones) — لازم تتحفظ تاني عشان المزامنة تنقل الحذف */
export function readAllMedications(): Medication[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("hm.medications") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMedication).filter((med): med is Medication => med !== null);
  } catch { return []; }
}
export function readMedications(): Medication[] { return readAllMedications().filter((med) => !med.deleted); }
