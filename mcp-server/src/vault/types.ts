export interface NoteStats {
  size: number;
  created: string;
  modified: string;
}

export interface SearchResult {
  path: string;
  excerpt: string;
}

export interface BacklinkResult {
  path: string;
  context: string;
}

export interface PropertyEntry {
  value: string;
  count: number;
}

export type PropertyMap = Record<string, PropertyEntry[]>;

/** Obsidian property types from .obsidian/types.json */
export type ObsidianFieldType =
  | "text"
  | "multitext"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "tags"
  | "aliases";
