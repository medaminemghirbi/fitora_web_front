import { SessionFormat } from "./activity.model";

export type ActivityFamily = "fitness" | "wellness" | "combat" | "tech" | "aquatic" | "dance" | "outdoor";

/** The order the catalogue is shown in — mirrors ActivityTemplate::FAMILIES. */
export const ACTIVITY_FAMILIES: ActivityFamily[] = ["fitness", "wellness", "combat", "tech", "aquatic", "dance", "outdoor"];

/**
 * One discipline in the platform's catalogue. Picking it gives the gym its
 * OWN activity, copied from these defaults and editable afterwards.
 */
export interface ActivityTemplate {
  id: string;
  key: string;
  family: ActivityFamily;
  emoji: string | null;
  /** Every language the catalogue has — fr is always there. */
  names: Partial<Record<"fr" | "en" | "ar", string>>;
  session_format: SessionFormat;
  duration: number;
  capacity: number;
}

/** An activity the gym names itself, for a discipline the catalogue lacks. */
export interface CustomActivity {
  name: string;
  emoji: string | null;
}

/** The template's name in `lang`, else in French. */
export function templateName(template: ActivityTemplate, lang: string | null | undefined): string {
  const names = template.names as Record<string, string | undefined>;
  return names[lang ?? ""] || template.names.fr || template.key;
}
