/**
 * Functional data pipeline — comparator combinators
 *
 * Source: flamingo-home-space, apps/web/helpers/groupAndSortSections.ts
 * Task:   order building sections by section type (fixed order), then by title
 *         with natural sorting ("Section 2" before "Section 10").
 *
 * Idea:   "group by type → sort each group → flatten in type order" is the same
 *         thing as ONE stable sort by a composite key (typeRank, title).
 *         Comparators are plain functions, so they compose like any other value.
 */

// ---------------------------------------------------------------------------
// BEFORE (project code)
// ---------------------------------------------------------------------------
//
// export const groupAndSortSections = (sections) => {
//   if (!sections.length) return [];
//
//   const groupedSections = sections.reduce((acc, section) => {
//     if (!acc[section.sectionType]) acc[section.sectionType] = [];
//     acc[section.sectionType].push(section);          // mutates the accumulator
//     return acc;
//   }, {} as Record<SectionTypeEnum, GetBuildingSectionDto[]>);   // cast hides missing keys
//
//   Object.values(groupedSections).forEach(group => {
//     group.sort((a, b) => a.title.localeCompare(b.title, ...));  // in-place sort
//   });
//
//   return Object.values(SectionTypeEnum).flatMap(type => groupedSections[type] || []);
// };
//
// Problems: three passes, mutation inside reduce and sort, an `as` cast,
// and sections of an unknown type disappear silently.

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

const SECTION_TYPES = [
  'apartment_building',
  'cottage_complex',
  'house_villa',
  'apartment_hotel',
  'commercial_office_building',
  'parking',
  'warehouse_production',
] as const;

type SectionType = (typeof SECTION_TYPES)[number];

type BuildingSection = {
  readonly id: string;
  readonly title: string;
  readonly sectionType: SectionType;
};

// ---------------------------------------------------------------------------
// Comparator toolkit (reusable, domain-agnostic)
// ---------------------------------------------------------------------------

type Comparator<T> = (a: T, b: T) => number;

// Lifts a comparator of keys into a comparator of items: compare people "by age".
const by =
  <T, K>(getKey: (item: T) => K, compareKeys: Comparator<K>): Comparator<T> =>
  (a, b) =>
    compareKeys(getKey(a), getKey(b));

// Comparators form a monoid: identity is `() => 0`, combining = "first non-zero wins".
const thenBy =
  <T>(...comparators: Comparator<T>[]): Comparator<T> =>
  (a, b) =>
    comparators.reduce((result, compare) => (result !== 0 ? result : compare(a, b)), 0);

const compareNumbers: Comparator<number> = (a, b) => a - b;

const NATURAL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const compareNatural: Comparator<string> = (a, b) => NATURAL_COLLATOR.compare(a, b);

const sortWith =
  <T>(compare: Comparator<T>) =>
  (items: readonly T[]): T[] =>
    [...items].sort(compare);

// ---------------------------------------------------------------------------
// AFTER
// ---------------------------------------------------------------------------

const typeRank = (section: BuildingSection): number => SECTION_TYPES.indexOf(section.sectionType);

const bySectionOrder: Comparator<BuildingSection> = thenBy(
  by(typeRank, compareNumbers),
  by((section) => section.title, compareNatural),
);

export const sortSections = sortWith(bySectionOrder);

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const sections: readonly BuildingSection[] = [
  { id: '1', title: 'Section 10', sectionType: 'apartment_building' },
  { id: '2', title: 'P-1', sectionType: 'parking' },
  { id: '3', title: 'Section 2', sectionType: 'apartment_building' },
  { id: '4', title: 'Villa A', sectionType: 'house_villa' },
];

console.log(sortSections(sections).map((section) => `${section.sectionType}: ${section.title}`));
// [
//   'apartment_building: Section 2',
//   'apartment_building: Section 10',
//   'house_villa: Villa A',
//   'parking: P-1',
// ]
console.log(sections[0].title); // 'Section 10' — the input is untouched
