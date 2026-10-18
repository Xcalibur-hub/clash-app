export interface TopicNode {
  id: string;
  label: string;
  hoods: readonly string[];
}
export function constellationLayout(nodes: readonly TopicNode[], width: number, fontScale = 1) {
  const columns = width < 300 || fontScale > 1.3 ? 2 : 3;
  const cell = width / columns,
    rowHeight = Math.max(126, 100 * fontScale);
  const points = nodes.map((node, i) => ({
    ...node,
    x: cell * (i % columns + 0.5),
    y: 32 + Math.floor(i / columns) * rowHeight + (i % columns === 1 ? 30 : 0)
  }));
  const edges: [number, number][] = [];
  points.forEach((a, i) => points.slice(i + 1).forEach((b, j) => {
    if (a.hoods.some(hood => b.hoods.includes(hood))) edges.push([i, i + j + 1]);
  }));
  return {
    points,
    edges,
    cell,
    height: Math.max(260, Math.ceil(nodes.length / columns) * rowHeight + 100)
  };
}
