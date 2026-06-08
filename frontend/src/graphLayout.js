import dagre from 'dagre';

// Lays out the backend graph ({ nodes, edges }) for React Flow.
// Replaces the old flattenTree() — the backend now sends an explicit graph
// (with a single shared Product node), so there is nothing to flatten.

const NODE_W = 200;
const NODE_H = 90;

const EDGE_COLOR = {
  dropoff: '#dc2626',
  retention: '#ea580c',
};

export function layoutGraph(graph, ds) {
  const semNodes = (graph && graph.nodes) || [];
  const semEdges = (graph && graph.edges) || [];

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 });

  semNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  semEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const byId = Object.fromEntries(semNodes.map((n) => [n.id, n]));
  const border = (ds && ds.color && ds.color.border) || '#e4e7f0';

  const nodes = semNodes.map((n) => {
    const pos = g.node(n.id) || { x: 0, y: 0 };
    return {
      id: n.id,
      type: 'custom',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: n.label,
        type: n.type,
        messageType: n.messageType,
        phase: n.phase,
        timing: n.timing,
        shouldCampaign: n.shouldCampaign,
        // `step` keeps the right-hand panel + campaign generator working unchanged.
        step: {
          step: n.label,
          type: n.type,
          phase: n.phase,
          messageType: n.messageType,
          timing: n.timing,
          shouldCampaign: n.shouldCampaign,
        },
      },
    };
  });

  const edges = semEdges.map((e, i) => {
    const targetType = byId[e.target] && byId[e.target].type;
    return {
      id: e.id || `e${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      animated: !!(byId[e.target] && byId[e.target].shouldCampaign),
      style: {
        stroke: EDGE_COLOR[targetType] || border,
        strokeWidth: 1.5,
        strokeDasharray: targetType === 'dropoff' ? '5,3' : 'none',
      },
    };
  });

  return { nodes, edges };
}

// Stats now come from the graph node list (no tree to walk).
export function statsFromGraph(graph) {
  const a = (graph && graph.nodes) || [];
  return {
    total: a.length,
    dropoffs: a.filter((n) => n.type === 'dropoff').length,
    happy: a.filter((n) => n.type === 'happy_path').length,
    retention: a.filter((n) => n.type === 'retention').length,
  };
}
