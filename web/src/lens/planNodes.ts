/** One plain-English sentence for the plan node types that show up most often. */
const NODES: Record<string, string> = {
  "Seq Scan": "Reads every row of the table and keeps the ones that match.",
  "Index Scan": "Walks an index to find matching rows, then fetches each one from the table.",
  "Index Only Scan": "Answers from the index alone, without visiting the table.",
  "Bitmap Index Scan":
    "Collects the locations of matching rows from an index, for a bitmap heap scan to read.",
  "Bitmap Heap Scan":
    "Reads the table pages a bitmap index scan found, in page order, and rechecks each row.",
  "Nested Loop": "For each row from the first input, looks up matching rows in the second.",
  "Hash Join": "Builds a hash table from one input, then probes it with each row of the other.",
  "Merge Join": "Joins two inputs that are already sorted on the join key, in a single pass.",
  Hash: "Builds the in-memory hash table that a hash join probes.",
  Sort: "Sorts its input, in memory or spilling to disk if it doesn't fit.",
  "Incremental Sort": "Finishes sorting input that is already sorted on a leading column.",
  Aggregate: "Computes aggregates such as count() or sum(), overall or per group.",
  WindowAgg: "Computes window functions such as row_number() or rank() over ordered rows.",
  Limit: "Stops after the first rows it needs, so the steps below can finish early.",
  Memoize: "Caches the inner side of a nested loop, so repeated lookups are answered from memory.",
  Materialize: "Keeps its input's rows in memory so they can be read more than once.",
  Append: "Concatenates several inputs, such as the partitions of a partitioned table.",
  "Function Scan": "Reads the rows returned by a set-returning function.",
  "Subquery Scan": "Reads the rows of a subquery that couldn't be merged into the main query.",
  "CTE Scan": "Reads the rows of a WITH query that was computed once.",
  Result: "Computes a value without reading a table, or applies a one-time filter.",
  Unique: "Drops consecutive duplicate rows from sorted input.",
  Gather: "Combines rows from parallel worker processes.",
};

/** The explanation for a plan node type, or undefined for types not in the list. */
export function explainNode(type: string): string | undefined {
  return NODES[type] ?? NODES[type.replace(/^Parallel /, "")];
}
