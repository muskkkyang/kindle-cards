export type MemoType = "highlight" | "note" | "bookmark";

export type Memo = {
  id: string;
  title: string;
  author: string;
  type?: MemoType;
  quote: string;
  rawNote?: string;
  comment: string;
  tags: string[];
  locationStart: number | null;
  locationEnd: number | null;
  page: string;
  addedAtRaw: string;
  importedAt?: string;
  favorite?: boolean;
  editedFields?: string[];
};

export type Template = "quote" | "comment" | "memo";
export type Theme = "light" | "dark" | "paper" | "receipt";
export type SizePreset = "landscape" | "square" | "portrait" | "wide" | "phone";
export type FilterMode = "all" | "recent" | "untagged";
export type MobileView = "library" | "studio";
export type StatusTone = "neutral" | "working" | "success" | "error";

export type AppSettings = {
  template: Template;
  theme: Theme;
  size: SizePreset;
};

export type AppStatus = {
  tone: StatusTone;
  text: string;
};
