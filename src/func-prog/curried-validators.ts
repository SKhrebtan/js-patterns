/**
 * Currying + function composition — form validators
 *
 * Source: flamingo-home-space, apps/web/hooks/useValidation.ts
 * Task:   validate numeric form fields: "integer in [min, max]",
 *         "decimal with N places in [min, max]"; an empty field is allowed.
 *
 * Idea:   a validator is just a function `value => error | null`.
 *         Small validators are built by curried factories and glued together
 *         by combinators (`all`, `optional`) instead of copy-pasted checks.
 */

// ---------------------------------------------------------------------------
// BEFORE (project code, zod-based)
// ---------------------------------------------------------------------------
//
// const integerValidation = () =>
//   optionalString().refine((val) => {
//     if (!val?.trim()) return true;          // "empty is ok" — repeated
//     if (val.endsWith('.')) return false;
//     return isIntegerString(val);
//   }, { message: translations('mustBeInteger') });
//
// const decimalPlacesValidation = (decimalPlaces) =>
//   optionalString().refine((val) => {
//     if (!val?.trim()) return true;          // ...repeated
//     if (val.endsWith('.')) return false;    // ...repeated
//     return hasValidDecimalPlaces(val, decimalPlaces);
//   }, { message: ... });
//
// const rangeValidation = (min, max) => (schema) =>
//   schema.refine((val) => {
//     if (!val?.trim()) return true;          // ...and again
//     return isNumberInRange(min, max)(val);  // partial application rebuilt on every keystroke
//   }, { message: translations('mustBeInRange', { min, max }) });
//
// const integerRangeValidation = (min, max) => rangeValidation(min, max)(integerValidation());
//
// Good: the curried `rangeValidation(min, max)(schema)` is already a higher-order function.
// Weak: the "empty is ok" rule is duplicated in every validator instead of being
// a separate, composable piece; the curried predicate is re-applied on every call.

// ---------------------------------------------------------------------------
// Core types and combinators
// ---------------------------------------------------------------------------

type Validator<T> = (value: T) => string | null;

type MessageKey = 'mustBeInteger' | 'mustHaveValidDecimalPlaces' | 'mustBeInRange';
type Translate = (key: MessageKey, params?: Record<string, number>) => string;

// Builds a validator from a predicate: the only place where "boolean → error" lives.
const rule =
  <T>(predicate: (value: T) => boolean, message: string): Validator<T> =>
  (value) =>
    predicate(value) ? null : message;

// Runs validators left to right and stops at the first error (`??` short-circuits).
const all =
  <T>(...validators: Validator<T>[]): Validator<T> =>
  (value) =>
    validators.reduce<string | null>((error, validate) => error ?? validate(value), null);

// Decorator: "empty is ok" is written once and wraps any validator.
const optional =
  (validator: Validator<string>): Validator<string | null | undefined> =>
  (value) => {
    if (value === null || value === undefined || value.trim() === '') {
      return null;
    }
    return validator(value.trim());
  };

// ---------------------------------------------------------------------------
// Curried predicates — partially applied once, reused for every value
// ---------------------------------------------------------------------------

const isInRange = (min: number, max: number) => (value: number) => value >= min && value <= max;

const hasMaxDecimalPlaces = (places: number) => {
  const pattern = new RegExp(`^-?\\d+(\\.\\d{1,${places}})?$`);
  return (value: string) => pattern.test(value);
};

const isIntegerString = (value: string) => /^-?\d+$/.test(value);

// ---------------------------------------------------------------------------
// AFTER
// ---------------------------------------------------------------------------

export const createNumberValidators = (t: Translate) => {
  const integer = rule(isIntegerString, t('mustBeInteger'));

  const decimal = (places: number) =>
    rule(hasMaxDecimalPlaces(places), t('mustHaveValidDecimalPlaces', { numberOfDecimalPlaces: places }));

  const inRange = (min: number, max: number) => {
    const inBounds = isInRange(min, max);
    return rule((value: string) => inBounds(Number(value)), t('mustBeInRange', { min, max }));
  };

  return {
    integerRange: (min: number, max: number) => optional(all(integer, inRange(min, max))),
    decimalRange: (min: number, max: number, places = 1) => optional(all(decimal(places), inRange(min, max))),
  };
};

// In the project the result plugs back into zod in one place:
//   schema.superRefine((value, ctx) => {
//     const error = validator(value);
//     if (error !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
//   });

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const MESSAGES: Record<MessageKey, string> = {
  mustBeInteger: 'Must be an integer',
  mustHaveValidDecimalPlaces: 'At most {numberOfDecimalPlaces} decimal places',
  mustBeInRange: 'Must be between {min} and {max}',
};

const translate: Translate = (key, params = {}) =>
  Object.entries(params).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    MESSAGES[key],
  );

const { integerRange, decimalRange } = createNumberValidators(translate);

const floorValidator = integerRange(1, 50);
const areaValidator = decimalRange(10, 500, 2);

console.log(floorValidator('')); //       null — empty is allowed
console.log(floorValidator('12')); //     null
console.log(floorValidator('12.')); //    'Must be an integer'
console.log(floorValidator('99')); //     'Must be between 1 and 50'
console.log(areaValidator('45.75')); //   null
console.log(areaValidator('45.755')); //  'At most 2 decimal places'
