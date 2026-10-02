// Roving focus for radio groups and tab lists: arrows move (and wrap), Home and End jump. Returns the next index or null.
export function nextIndex(key: string, current: number, count: number, orientation: "horizontal" | "vertical" = "horizontal"): number | null {
  if (count <= 0) return null;
  const forward = orientation === "horizontal" ? ["ArrowRight"] : ["ArrowDown"];
  const backward = orientation === "horizontal" ? ["ArrowLeft"] : ["ArrowUp"];
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (forward.includes(key)) return (current + 1) % count;
  if (backward.includes(key)) return (current - 1 + count) % count;
  return null;
}
