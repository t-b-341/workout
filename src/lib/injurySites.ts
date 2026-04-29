/** Canonical site keys for injury rows (one open episode per key at a time). */
export const INJURY_SITE_KEYS = [
  'wrist-L',
  'wrist-R',
  'elbow-L',
  'elbow-R',
  'shoulder-L',
  'shoulder-R',
  'knee-L',
  'knee-R',
  'back-low',
  'back-mid',
  'back-upper',
  'hip-flexors',
  'neck',
  'ankle-L',
  'ankle-R',
  'foot-L',
  'foot-R',
  'hand-L',
  'hand-R',
] as const;

export type InjurySiteKey = (typeof INJURY_SITE_KEYS)[number];

export type InjurySiteGroup = {
  area: string;
  items: { siteKey: InjurySiteKey; label: string }[];
};

export const INJURY_SITE_GROUPS: InjurySiteGroup[] = [
  {
    area: 'Wrists',
    items: [
      { siteKey: 'wrist-L', label: 'L' },
      { siteKey: 'wrist-R', label: 'R' },
    ],
  },
  {
    area: 'Elbows',
    items: [
      { siteKey: 'elbow-L', label: 'L' },
      { siteKey: 'elbow-R', label: 'R' },
    ],
  },
  {
    area: 'Shoulders',
    items: [
      { siteKey: 'shoulder-L', label: 'L' },
      { siteKey: 'shoulder-R', label: 'R' },
    ],
  },
  {
    area: 'Knees',
    items: [
      { siteKey: 'knee-L', label: 'L' },
      { siteKey: 'knee-R', label: 'R' },
    ],
  },
  {
    area: 'Back',
    items: [
      { siteKey: 'back-low', label: 'Low' },
      { siteKey: 'back-mid', label: 'Mid' },
      { siteKey: 'back-upper', label: 'Upper' },
    ],
  },
  {
    area: 'Hip flexors',
    items: [{ siteKey: 'hip-flexors', label: '—' }],
  },
  {
    area: 'Neck',
    items: [{ siteKey: 'neck', label: '—' }],
  },
  {
    area: 'Ankles',
    items: [
      { siteKey: 'ankle-L', label: 'L' },
      { siteKey: 'ankle-R', label: 'R' },
    ],
  },
  {
    area: 'Feet',
    items: [
      { siteKey: 'foot-L', label: 'L' },
      { siteKey: 'foot-R', label: 'R' },
    ],
  },
  {
    area: 'Hands',
    items: [
      { siteKey: 'hand-L', label: 'L' },
      { siteKey: 'hand-R', label: 'R' },
    ],
  },
];

export function labelForSiteKey(siteKey: InjurySiteKey): string {
  for (const g of INJURY_SITE_GROUPS) {
    const it = g.items.find((i) => i.siteKey === siteKey);
    if (it) {
      if (it.label === '—') return g.area;
      return `${g.area} (${it.label})`;
    }
  }
  return siteKey;
}
