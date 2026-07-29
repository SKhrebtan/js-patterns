# Algorithms & Data Structures Cheat Sheet

---

# 1. What is time complexity, and why is it important? Explain Big O notation with examples.

## Time Complexity

Time complexity describes **how the number of operations performed by an algorithm grows as the input size (`n`) increases**.

It helps compare algorithms independently of hardware and choose the most efficient solution for large datasets.

## Big O Notation

Big O describes the algorithm's growth rate in the **worst-case scenario**.

| Complexity | Description | Example |
|------------|-------------|---------|
| **O(1)** | Constant | Access an array element by index |
| **O(log n)** | Logarithmic | Binary Search |
| **O(n)** | Linear | Linear Search |
| **O(n log n)** | Linearithmic | Quicksort, Merge Sort |
| **O(n²)** | Quadratic | Bubble Sort, Nested Loops |

---

# 2. Describe the Quicksort algorithm. What is its average and worst-case time complexity?

## Quicksort

Quicksort is a **divide-and-conquer** sorting algorithm.

### Steps

1. Choose a **pivot** element.
2. Partition the array into:
   - elements smaller than the pivot;
   - the pivot;
   - elements greater than the pivot.
3. Recursively sort the left and right partitions.
4. Combine the sorted results.

### Time Complexity

| Case | Complexity |
|------|------------|
| **Average** | **O(n log n)** |
| **Worst** | **O(n²)** |

### Why?

**Average case (O(n log n))**

- The pivot usually creates balanced partitions.
- The recursion tree has about `log n` levels.
- Each level processes all `n` elements.

**Worst case (O(n²))**

- Happens when the pivot repeatedly creates highly unbalanced partitions.
- Example: always choosing the last element as the pivot for an already sorted array.

---

# 3. How does Binary Search work? Under what conditions can it be used?

## Binary Search

Binary Search repeatedly compares the target with the **middle element**.

- If the target is smaller → search the left half.
- If the target is larger → search the right half.
- Repeat until the element is found or the search space is empty.

### Time Complexity

**O(log n)**

### Requirement

Binary Search **only works on sorted data**, because each comparison eliminates half of the remaining elements.

---

# 4. How to implement data structures: arrays, linked lists, stacks, queues?

## Array

Stores elements in contiguous memory.

### Characteristics

- Fast random access by index.
- Dynamic size (in JavaScript).

### Complexity

| Operation | Complexity |
|-----------|------------|
| Access | **O(1)** |
| Search | **O(n)** |
| Insert/Delete at end | **O(1)** (amortized) |

```ts
const arr = [1, 2, 3];
```

---

## Linked List

Each node stores:

- a value;
- a reference to the next node.

```text
10 → 20 → 30 → null
```

### Advantages

- Efficient insertion and deletion when the node is known.

### Disadvantages

- No direct access by index.
- Searching requires traversing the list.

---

## Stack (LIFO)

**Last In, First Out**

The last inserted element is removed first.

### Operations

- `push()`
- `pop()`
- `peek()`

### Example

```text
Push:

1
2
3

Pop:

3
2
1
```

### Typical Use Cases

- Function call stack
- Undo / Redo
- Depth-First Search (DFS)

---

## Queue (FIFO)

**First In, First Out**

The first inserted element is removed first.

### Operations

- `enqueue()`
- `dequeue()`
- `front()`

### Example

```text
Enqueue:

1
2
3

Dequeue:

1
2
3
```

### Typical Use Cases

- Task queues
- Request processing
- Breadth-First Search (BFS)

---

# Quick Summary

| Topic | Key Point |
|-------|-----------|
| **Time Complexity** | Measures how operations grow as input size increases. |
| **Big O** | Describes algorithm growth (usually worst-case). |
| **Quicksort** | Divide-and-conquer sorting using a pivot. Average **O(n log n)**, Worst **O(n²)**. |
| **Binary Search** | Works only on **sorted** data. Complexity **O(log n)**. |
| **Array** | Fast index access (**O(1)**). |
| **Linked List** | Fast insert/delete, slow indexed access. |
| **Stack** | LIFO. |
| **Queue** | FIFO. |