export type ResizeConstraint = { width: number } | { height: number } | null;

export function longestEdgeResize(
  width: number,
  height: number,
  maxEdgePx: number,
): ResizeConstraint {
  if (width <= maxEdgePx && height <= maxEdgePx) {
    return null;
  }
  return width >= height ? { width: maxEdgePx } : { height: maxEdgePx };
}
