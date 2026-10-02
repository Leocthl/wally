// EN first, zh-HK on the second line (docs/04 Microcopy). zh-HK strings still need a native read (C-12).
export interface LabelPair {
  readonly en: string;
  readonly zh: string;
}

export function label(en: string, zh: string): LabelPair {
  return { en, zh };
}
