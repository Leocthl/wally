// Roving focus for radio groups and tab lists: arrows move (and wrap), Home and End jump. Returns the next index or null.
// "both": a radio group that wraps onto several rows or sits in a grid (chips, cards): Right and Down go forward, Left and Up back.
export function nextIndex(key: string, current: number, count: number, orientation: "horizontal" | "vertical" | "both" = "horizontal"): number | null {
  if (count <= 0) return null;
  const forward = orientation === "horizontal" ? ["ArrowRight"] : orientation === "vertical" ? ["ArrowDown"] : ["ArrowRight", "ArrowDown"];
  const backward = orientation === "horizontal" ? ["ArrowLeft"] : orientation === "vertical" ? ["ArrowUp"] : ["ArrowLeft", "ArrowUp"];
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (forward.includes(key)) return (current + 1) % count;
  if (backward.includes(key)) return (current - 1 + count) % count;
  return null;
}
