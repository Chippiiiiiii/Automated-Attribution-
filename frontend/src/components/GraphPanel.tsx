import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api, errorMessage } from '../api/client';
import type { Chain, GraphData, GraphNodeDto, PathHop } from '../api/types';
import { btnGhost, Card, ErrorText, input, shortAddr } from './ui';

const COLORS: Record<string, string> = {
  suspect: '#ef4444', vasp: '#22c55e', mixer: '#a855f7', bridge: '#f59e0b', other: '#64748b',
};
const LEGEND: [string, string][] = [['suspect', 'Suspect wallet'], ['vasp', 'VASP / exchange'], ['mixer', 'Mixer'], ['bridge', 'Bridge'], ['other', 'Unlabelled / other']];

function kindOf(n: GraphNodeDto, root: string): string {
  if (n.key === root) return 'suspect';
  const t = `${n.intel?.type ?? ''} ${n.intel?.addressType ?? ''}`.toUpperCase();
  if (t.includes('MIXER')) return 'mixer';
  if (t.includes('BRIDGE')) return 'bridge';
  if (n.intel?.isVasp) return 'vasp';
  return 'other';
}

/** Interactive transaction graph. `path` (attribution result) is highlighted; edges carry amount / tx count. */
export function GraphPanel({ chain, address, path }: { chain: Chain; address: string; path: PathHop[] }) {
  const [maxHops, setMaxHops] = useState(3);
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [minAmount, setMinAmount] = useState('');
  const [graph, setGraph] = useState<GraphData | null>(null);
  // Bumped per load so React Flow remounts and fits the view to the newly loaded nodes.
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GraphNodeDto | null>(null);

  async function load() {
    setLoading(true); setError(''); setSelected(null);
    try {
      const params: Record<string, string | number> = { maxHops, direction };
      if (minAmount.trim()) params.minAmount = minAmount.trim();
      setGraph((await api.get<GraphData>(`/graph/${chain}/${address}`, { params })).data);
      setVersion((v) => v + 1);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chain, address]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const onPath = new Set<string>();
    for (const h of path) { onPath.add(`${h.chain ?? chain}:${h.from}`); onPath.add(`${h.chain ?? chain}:${h.to}`); }
    const pathEdges = new Set(path.map((h) => `${h.chain ?? chain}:${h.from}>${h.chain ?? chain}:${h.to}`));
    const cols = new Map<number, number>();
    const ns: Node[] = graph.nodes.map((n) => {
      const row = cols.get(n.depth) ?? 0;
      cols.set(n.depth, row + 1);
      const kind = kindOf(n, graph.root);
      const hl = onPath.has(n.key);
      return {
        id: n.key,
        position: { x: n.depth * 260, y: row * 90 },
        data: { label: `${n.intel ? `${n.intel.name}${n.intel.isDemo ? ' (DEMO)' : ''}\n` : ''}${shortAddr(n.address)}` },
        style: {
          background: '#ffffff', color: '#12212f', border: `${hl ? 3 : 1}px solid ${COLORS[kind]}`, borderRadius: 8,
          fontSize: 11, whiteSpace: 'pre-line', width: 170, boxShadow: hl ? `0 0 10px ${COLORS[kind]}` : undefined,
        },
      };
    });
    const es: Edge[] = graph.edges.map((e, i) => {
      const hl = pathEdges.has(`${e.from}>${e.to}`);
      return {
        id: `${i}`, source: e.from, target: e.to,
        label: `${Number(e.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${e.token}${e.txCount > 1 ? ` ×${e.txCount}` : ''}`,
        animated: hl, markerEnd: { type: MarkerType.ArrowClosed, color: hl ? '#c2410c' : '#94a3b8' },
        style: { stroke: hl ? '#c2410c' : '#94a3b8', strokeWidth: hl ? 3 : 1 },
        labelStyle: { fill: '#12212f', fontSize: 10 }, labelBgStyle: { fill: '#ffffff' },
      };
    });
    return { nodes: ns, edges: es };
  }, [graph, path, chain]);

  return (
    <Card title={`Transaction graph · ${chain}:${shortAddr(address)}`} actions={
      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <select className={input} value={direction} onChange={(e) => setDirection(e.target.value as 'outbound' | 'inbound')}>
          <option value="outbound">Outbound</option><option value="inbound">Inbound</option>
        </select>
        <select className={input} value={maxHops} onChange={(e) => setMaxHops(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} hops</option>)}
        </select>
        <input className={`${input} w-28`} placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        <button className={btnGhost} disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Apply'}</button>
      </span>}>
      <ErrorText>{error}</ErrorText>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        {LEGEND.map(([k, l]) => <span key={k}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />{l}</span>)}
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-orange-500 align-middle" />Attribution path</span>
      </div>
      {graph && graph.nodes.length <= 1 && <p className="text-sm text-muted">No transfers found for this wallet with these filters.</p>}
      {graph?.truncated && <p className="mb-2 text-xs text-amber-400">Graph truncated by node/transfer limits — narrow the filters.</p>}
      {graph && graph.bridgeLinks.length > 0 && (
        <p className="mb-2 text-xs text-amber-300">Cross-chain bridge deposits detected: {graph.bridgeLinks.map((b) => `${b.bridge ?? b.bridgeId} (${b.sourceChain}→${b.destChain})`).join(', ')}</p>
      )}
      <div className="h-[460px] rounded border border-line">
        <ReactFlow key={version} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }} colorMode="light" onNodeClick={(_, n) => setSelected(graph?.nodes.find((x) => x.key === n.id) ?? null)} onPaneClick={() => setSelected(null)}>
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selected && (
        <div className="mt-2 rounded bg-panel p-2 text-sm">
          <code className="break-all">{selected.address}</code>
          <div className="text-muted">
            {selected.chain} · depth {selected.depth} · in {selected.inDegree} / out {selected.outDegree}
            {selected.intel ? ` · ${selected.intel.name} (${selected.intel.type}${selected.intel.isDemo ? ', DEMO' : ''}) — label confidence ${selected.intel.confidence}` : ' · no intelligence label'}
          </div>
        </div>
      )}
    </Card>
  );
}
