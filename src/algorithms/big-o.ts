// O(1) — Constant // 
//The execution time remains constant regardless of the array size. Accessing an element by its index always takes one operation.
const users = ["John", "Kate", "Mike", "Alex"];

function getUser(index: number) {
  return users[index];
}

getUser(2);

// O(log n) — Binary Search // 
//Each iteration cuts the search space in half, so the number of operations grows logarithmically.
function binarySearch(arr: number[], target: number) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] === target) return mid;

    if (arr[mid] < target)
      left = mid + 1;
    else
      right = mid - 1;
  }

  return -1;
}

// O(n) — Linear Search // 
//In the worst case, every element must be checked before finding the target (or determining it does not exist).
function findUser(users: string[], name: string) {
  for (const user of users) {
    if (user === name) {
      return user;
    }
  }

  return null;
}

// O(n²) // 
//Nested loops
//Each element is compared with the remaining elements, resulting in approximately n × n comparisons
for (let i = 0; i < arr.length; i++) {
  for (let j = i + 1; j < arr.length; j++) {
    if (arr[i] === arr[j]) {
      return true;
    }
  }
}

//Bubble Sort
//Each pass compares adjacent elements, and multiple passes are required to move every element into its correct position.
function bubbleSort(arr: number[]) {
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }

  return arr;
}

// O(n log n) //
// Quicksort
function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;

  const pivot = arr[arr.length - 1];

  const left = arr.filter(x => x < pivot);
  const right = arr.filter(x => x > pivot);

  return [...quickSort(left), pivot, ...quickSort(right)];
}
//The array is recursively divided into smaller partitions (log n levels), and each level processes all n elements.

// Merge Sort
function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;

  const middle = Math.floor(arr.length / 2);

  const left = mergeSort(arr.slice(0, middle));
  const right = mergeSort(arr.slice(middle));

  return merge(left, right);
}

function merge(left: number[], right: number[]) {
  const result: number[] = [];

  while (left.length && right.length) {
    if (left[0] < right[0]) {
      result.push(left.shift()!);
    } else {
      result.push(right.shift()!);
    }
  }

  return [...result, ...left, ...right];
}
//The array is repeatedly divided into two halves (log n levels), and merging the sorted halves requires processing all n elements at each level.