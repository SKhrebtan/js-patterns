type SortDirection = 'asc' | 'desc';

type SortStrategy<T> = (items: T[]) => T[];

type User = {
  id: number;
  name: string;
  age: number;
};

const users: User[] = [
  { id: 1, name: 'John', age: 30 },
  { id: 2, name: 'Alice', age: 25 },
  { id: 3, name: 'Bob', age: 35 },
];

/**
 * Strategy factory
 */
const createSortStrategy = <T, TValue extends string | number>(selector: (item: T) => TValue, direction: SortDirection,): SortStrategy<T> => items => [...items].sort((a, b) => {
      const left = selector(a);
      const right = selector(b);

      const result = typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right);

      return direction === 'asc' ? result : -result;
    });

/**
 * Context
 */
const sortItems = <T>(
  items: T[],
  strategy: SortStrategy<T>,
): T[] => strategy(items);

/**
 * Concrete Strategies
 */
export const sortByNameAsc = createSortStrategy<User, string>(
  user => user.name,
  'asc',
);

export const sortByAgeDesc = createSortStrategy<User, number>(
  user => user.age,
  'desc',
);

/**
 * Client code
 */
console.log(sortItems(users, sortByNameAsc));
console.log(sortItems(users, sortByAgeDesc));