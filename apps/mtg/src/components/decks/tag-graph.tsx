"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { COLOR_LABELS, COLOR_ORDER, MANA_SVG } from "@/lib/mtg-styles";
import { tagNodeId, type TagGraph as TagGraphData, type TagGraphNode } from "@/lib/deck-tag-graph";

type SimNode = TagGraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;
type Layout = { nodes: SimNode[]; links: SimLink[] };
type Transform = { k: number; x: number; y: number };

interface Props {
  graph: TagGraphData;
  /** The selected tag's label, highlighted with its cards. */
  selectedTag: string | null;
  onSelectTag: (label: string) => void;
  onInspect: (cardId: string) => void;
}

const HEIGHT = 520;
const CARD_RADIUS = 5;
/** A pointer that moves less than this between down and up is a click, not a drag. */
const CLICK_SLOP = 4;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const VIEW_BUTTON =
  "min-w-6 rounded-md border border-border bg-background px-1.5 py-0.5 text-label text-muted-foreground hover:border-input hover:text-foreground";

/** Tags labelled at rest, most common first; the rest show on hover or zoom. */
const LABELLED_TAGS = 15;
/** Zoomed in this far, every tag is labelled. */
const LABEL_ALL_ZOOM = 1.6;

/** Margin kept around the settled layout when it's fitted to the box. */
const FIT_PADDING = 24;

/**
 * Multicolour cards get a neutral fill; identity is in the tooltip and the
 * legend. The white and black mana fills nearly vanish on the page surfaces,
 * so every card dot keeps its edge stroke.
 */
const MULTI_SVG = { fill: "var(--muted-foreground)", edge: "var(--foreground)" };

function cardSvg(color: string) {
  return color === "multi" ? MULTI_SVG : MANA_SVG[color] ?? MANA_SVG.C;
}

function tagRadius(count: number, max: number) {
  return 6 + Math.sqrt(count / Math.max(1, max)) * 16;
}

function endpoint(end: SimLink["source"]): SimNode | null {
  return typeof end === "object" ? end : null;
}

/**
 * The breakdown's graph mode: cards linked to the Scryfall tags they carry,
 * laid out by d3-force and drawn as SVG so fills take theme tokens. Drag a
 * node to pull it, drag the background to pan, scroll to zoom.
 */
export function TagGraph({ graph, selectedTag, onSelectTag, onInspect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulation = useRef<Simulation<SimNode, SimLink> | null>(null);
  // Positions outlive a rebuild, so changing the filter nudges the layout
  // rather than scattering it.
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "node"; node: SimNode; startX: number; startY: number; moved: boolean }
    | { kind: "pan"; startX: number; startY: number; origin: Transform }
    | null
  >(null);

  const [width, setWidth] = useState(800);
  const [layout, setLayout] = useState<Layout>({ nodes: [], links: [] });
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  // Once the user zooms or pans, a settling layout stops refitting itself.
  const userMoved = useRef(false);
  const fitView = useRef<() => void>(() => {});
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const restingLabels = useMemo(
    () =>
      new Set(
        graph.nodes
          .filter((n) => n.kind === "tag")
          .slice(0, LABELLED_TAGS)
          .map((n) => n.id)
      ),
    [graph]
  );

  const maxTagCount = useMemo(
    () => Math.max(1, ...graph.nodes.map((n) => (n.kind === "tag" ? n.count : 0))),
    [graph]
  );

  useEffect(() => {
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, ...positions.current.get(n.id) }));
    const links: SimLink[] = graph.links.map((l) => ({ ...l }));
    const radius = (n: SimNode) => (n.kind === "tag" ? tagRadius(n.count, maxTagCount) : CARD_RADIUS);

    // Scale the settled layout into the box, labels included (~12px under a tag).
    const fit = () => {
      if (userMoved.current || nodes.length === 0) return;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const n of nodes) {
        const r = radius(n);
        x0 = Math.min(x0, (n.x ?? 0) - r - 40);
        x1 = Math.max(x1, (n.x ?? 0) + r + 40);
        y0 = Math.min(y0, (n.y ?? 0) - r);
        y1 = Math.max(y1, (n.y ?? 0) + r + 14);
      }
      const w = widthRef.current - FIT_PADDING * 2;
      const h = HEIGHT - FIT_PADDING * 2;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / (x1 - x0), h / (y1 - y0))));
      setTransform({ k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k });
    };

    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance(70)
          // A card on many tags would otherwise be yanked hardest; share its pull.
          .strength((l) => {
            const source = endpoint(l.source);
            return source?.kind === "card" ? 0.6 / source.degree : 0.3;
          })
      )
      // Tags push hard so hubs spread out and their labels stay apart; cards
      // barely push, so they settle between the tags they share.
      .force("charge", forceManyBody<SimNode>().strength((n) => (n.kind === "tag" ? -700 : -40)))
      // A wide box, so the horizontal pull is the weaker one.
      .force("x", forceX(0).strength(0.015))
      .force("y", forceY(0).strength(0.04))
      .force("collide", forceCollide<SimNode>((n) => (n.kind === "tag" ? radius(n) + 14 : CARD_RADIUS + 2)))
      .stop();

    // Settle before the first paint rather than animating a hairball into
    // shape: a deck graph is a few hundred nodes, a few tens of milliseconds.
    // The live simulation only runs again while a node is dragged.
    const publish = () => {
      for (const n of nodes) positions.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      setLayout({ nodes, links });
    };
    sim.tick(Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())));
    sim.on("tick", publish);

    simulation.current = sim;
    fitView.current = fit;
    // A frame later, so the state updates land outside the effect body.
    const frame = requestAnimationFrame(() => {
      publish();
      fit();
    });
    return () => {
      cancelAnimationFrame(frame);
      sim.stop();
    };
  }, [graph, maxTagCount]);

  // Wheel zoom has to preventDefault, which React's passive onWheel can't.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Plain scrolling belongs to the page; a 520px graph shouldn't trap it.
    // Trackpad pinch arrives as a wheel event with ctrlKey set.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      userMoved.current = true;
      const rect = svg.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - HEIGHT / 2;
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * Math.exp(-event.deltaY * 0.002)));
        // Keep the point under the cursor fixed.
        return { k, x: px - ((px - t.x) * k) / t.k, y: py - ((py - t.y) * k) / t.k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const refit = () => {
    userMoved.current = false;
    fitView.current();
  };

  /** Zoom about the centre of the box. */
  const zoomBy = (factor: number) => {
    userMoved.current = true;
    setTransform((t) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
      return { k, x: (t.x * k) / t.k, y: (t.y * k) / t.k };
    });
  };

  /** Client coordinates → simulation coordinates. */
  const toGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - transform.x) / transform.k,
      y: (clientY - rect.top - HEIGHT / 2 - transform.y) / transform.k,
    };
  };

  const onNodeDown = (event: React.PointerEvent, node: SimNode) => {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    gesture.current = { kind: "node", node, startX: event.clientX, startY: event.clientY, moved: false };
  };

  const onBackgroundDown = (event: React.PointerEvent) => {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    gesture.current = { kind: "pan", startX: event.clientX, startY: event.clientY, origin: transform };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (g.kind === "pan") {
      userMoved.current = true;
      setTransform({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy });
      return;
    }
    if (!g.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    if (!g.moved) {
      g.moved = true;
      simulation.current?.alphaTarget(0.3).restart();
    }
    const p = toGraph(event.clientX, event.clientY);
    g.node.fx = p.x;
    g.node.fy = p.y;
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind !== "node") return;
    if (g.moved) {
      g.node.fx = null;
      g.node.fy = null;
      simulation.current?.alphaTarget(0);
      return;
    }
    if (g.node.kind === "tag") onSelectTag(g.node.label);
    else onInspect(g.node.cardId);
  };

  // What to light up: the hovered node's neighbours, else the selected tag's.
  const focus = hovered ?? (selectedTag ? tagNodeId(selectedTag) : null);
  const neighbours = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    for (const l of graph.links) {
      if (l.source === focus) set.add(l.target);
      if (l.target === focus) set.add(l.source);
    }
    return set;
  }, [focus, graph]);

  // One screen pixel in graph units. Labels, card dots and strokes stay this
  // size at any zoom; only tag circles scale, since their area is the count.
  const px = 1 / transform.k;
  const dim = (id: string) => neighbours !== null && !neighbours.has(id);
  const hoveredNode = hovered ? layout.nodes.find((n) => n.id === hovered) : undefined;

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button type="button" onClick={() => zoomBy(1 / 1.3)} title="Zoom out" className={VIEW_BUTTON}>
          −
        </button>
        <button type="button" onClick={() => zoomBy(1.3)} title="Zoom in" className={VIEW_BUTTON}>
          +
        </button>
        <button type="button" onClick={refit} title="Fit the graph to the box" className={VIEW_BUTTON}>
          Fit
        </button>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={HEIGHT}
        viewBox={`${-width / 2} ${-HEIGHT / 2} ${width} ${HEIGHT}`}
        className="block touch-none select-none rounded-md border border-border bg-muted/10"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Graph of ${graph.nodes.filter((n) => n.kind === "card").length} cards and the tags they share`}
      >
        <rect
          x={-width / 2}
          y={-HEIGHT / 2}
          width={width}
          height={HEIGHT}
          fill="transparent"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onBackgroundDown}
        />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          <g stroke="var(--muted-foreground)" strokeWidth={px}>
            {layout.links.map((l) => {
              const s = endpoint(l.source);
              const t = endpoint(l.target);
              if (!s || !t) return null;
              const lit = focus !== null && (s.id === focus || t.id === focus);
              return (
                <line
                  key={`${s.id}>${t.id}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  strokeOpacity={lit ? 0.8 : neighbours ? 0.05 : 0.18}
                  stroke={lit ? "var(--info)" : undefined}
                />
              );
            })}
          </g>

          {layout.nodes.map((n) => {
            const faded = dim(n.id);
            const common = {
              onPointerDown: (e: React.PointerEvent) => onNodeDown(e, n),
              onPointerEnter: () => setHovered(n.id),
              onPointerLeave: () => setHovered((h) => (h === n.id ? null : h)),
              opacity: faded ? 0.2 : 1,
              className: "cursor-pointer",
            };
            if (n.kind === "card") {
              const svg = cardSvg(n.color);
              return (
                <circle
                  key={n.id}
                  cx={n.x}
                  cy={n.y}
                  r={CARD_RADIUS * px}
                  fill={svg.fill}
                  stroke={svg.edge}
                  strokeWidth={1.5 * px}
                  {...common}
                />
              );
            }
            const r = tagRadius(n.count, maxTagCount);
            const selected = n.label === selectedTag;
            const labelled =
              transform.k >= LABEL_ALL_ZOOM ||
              (neighbours ? neighbours.has(n.id) : restingLabels.has(n.id));
            return (
              <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`} {...common}>
                <circle
                  r={r}
                  fill="color-mix(in oklch, var(--info) 22%, var(--background))"
                  stroke={selected ? "var(--info)" : "var(--info-border)"}
                  strokeWidth={(selected ? 2.5 : 1.5) * px}
                />
                {labelled && (
                  <text
                    y={r + 11 * px}
                    textAnchor="middle"
                    fontSize={11 * px}
                    fill="var(--foreground)"
                    stroke="var(--background)"
                    strokeWidth={3 * px}
                    paintOrder="stroke"
                    className="pointer-events-none"
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredNode && hoveredNode.x !== undefined && hoveredNode.y !== undefined && (
        <div
          className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2 py-1 text-label text-popover-foreground shadow-md"
          style={{
            left: `calc(50% + ${hoveredNode.x * transform.k + transform.x}px)`,
            // Above the node, clear of its label underneath.
            top:
              HEIGHT / 2 +
              hoveredNode.y * transform.k +
              transform.y -
              (hoveredNode.kind === "tag" ? tagRadius(hoveredNode.count, maxTagCount) * transform.k : CARD_RADIUS) -
              6,
          }}
        >
          {hoveredNode.kind === "card" ? (
            <>
              <div className="font-medium">{hoveredNode.label}</div>
              <div className="text-muted-foreground">
                {hoveredNode.typeLine} · {hoveredNode.degree} shown tag{hoveredNode.degree === 1 ? "" : "s"}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">{hoveredNode.label}</div>
              <div className="text-muted-foreground">
                {hoveredNode.count} card{hoveredNode.count === 1 ? "" : "s"} · click to list them
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted-foreground">
        <span className="flex items-center gap-1">
          <svg width={14} height={14} aria-hidden>
            <circle
              cx={7}
              cy={7}
              r={6}
              fill="color-mix(in oklch, var(--info) 22%, var(--background))"
              stroke="var(--info-border)"
              strokeWidth={1.5}
            />
          </svg>
          Tag, sized by cards
        </span>
        {[...COLOR_ORDER, "multi", "C"].map((c) => {
          const svg = cardSvg(c);
          return (
            <span key={c} className="flex items-center gap-1">
              <svg width={10} height={10} aria-hidden>
                <circle cx={5} cy={5} r={4} fill={svg.fill} stroke={svg.edge} strokeWidth={1.5} />
              </svg>
              {c === "multi" ? "Multicolor" : c === "C" ? "Colorless" : COLOR_LABELS[c]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
