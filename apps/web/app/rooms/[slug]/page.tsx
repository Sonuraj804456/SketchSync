"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";

type RoomRecord = {
  id: number;
  slug: string;
  adminId: string;
  createdAt: string;
};

type Tool = "select" | "rectangle" | "diamond" | "circle" | "arrow" | "line" | "pen" | "text";
type DrawingTool = Exclude<Tool, "select" | "text">;

type Point = { x: number; y: number };
type Viewport = { x: number; y: number; scale: number };

type BaseShape = {
  id: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
};

type RectangleShape = BaseShape & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
};

type DiamondShape = BaseShape & {
  type: "diamond";
  x: number;
  y: number;
  width: number;
  height: number;
};

type CircleShape = BaseShape & {
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
};

type LineShape = BaseShape & {
  type: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type PenShape = BaseShape & {
  type: "pen";
  points: Point[];
};

type TextShape = BaseShape & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

type Shape = RectangleShape | DiamondShape | CircleShape | LineShape | PenShape | TextShape;

type Interaction =
  | { kind: "draw"; tool: DrawingTool; start: Point }
  | { kind: "move"; shapeId: string; start: Point; origin: Shape }
  | { kind: "pan"; start: Point; origin: Viewport }
  | null;

type TextEditorState = {
  shapeId: string;
  x: number;
  y: number;
  value: string;
} | null;

type RoomResponse =
  | { ok: true; room: RoomRecord | null }
  | { ok: false; message: string };

const STORAGE_PREFIX = "sketchsync-room";
const BACKEND_KEY = "/api/rooms";
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "rectangle", label: "Rect", icon: "▭" },
  { id: "diamond", label: "Diamond", icon: "◇" },
  { id: "circle", label: "Circle", icon: "◯" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "line", label: "Line", icon: "—" },
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "text", label: "Text", icon: "A" },
];

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readPoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement | SVGSVGElement | null
): Point {
  const rect = element?.getBoundingClientRect();
  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

function pointDistance(pointA: Point, pointB: Point) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(x: number, y: number, width: number, height: number) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const right = Math.max(x, x + width);
  const bottom = Math.max(y, y + height);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function formatPenPoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function diamondPoints(shape: DiamondShape) {
  const rect = normalizeRect(shape.x, shape.y, shape.width, shape.height);
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;

  return [
    `${midX},${rect.y}`,
    `${rect.x + rect.width},${midY}`,
    `${midX},${rect.y + rect.height}`,
    `${rect.x},${midY}`,
  ].join(" ");
}

function shapeBounds(shape: Shape) {
  switch (shape.type) {
    case "rectangle":
    case "diamond":
    case "circle":
      return normalizeRect(shape.x, shape.y, shape.width, shape.height);
    case "line":
    case "arrow":
      return normalizeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
    case "pen": {
      const xs = shape.points.map((point) => point.x);
      const ys = shape.points.map((point) => point.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      };
    }
    case "text":
      return {
        x: shape.x,
        y: shape.y - shape.fontSize,
        width: Math.max(40, shape.text.length * shape.fontSize * 0.62),
        height: shape.fontSize * 1.25,
      };
  }
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return pointDistance(point, start);
  }

  const lengthSquared = dx * dx + dy * dy;
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );

  return pointDistance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function moveShape(shape: Shape, deltaX: number, deltaY: number): Shape {
  switch (shape.type) {
    case "rectangle":
    case "diamond":
    case "circle":
    case "text":
      return { ...shape, x: shape.x + deltaX, y: shape.y + deltaY };
    case "line":
    case "arrow":
      return {
        ...shape,
        x1: shape.x1 + deltaX,
        y1: shape.y1 + deltaY,
        x2: shape.x2 + deltaX,
        y2: shape.y2 + deltaY,
      };
    case "pen":
      return {
        ...shape,
        points: shape.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
      };
  }
}

function createDraftShape(tool: DrawingTool, start: Point): Shape {
  const base = {
    id: createId(),
    stroke: "#1f2937",
    fill: "rgba(255, 255, 255, 0.25)",
    strokeWidth: 2.5,
  };

  switch (tool) {
    case "rectangle":
      return { ...base, type: "rectangle", x: start.x, y: start.y, width: 0, height: 0 };
    case "diamond":
      return { ...base, type: "diamond", x: start.x, y: start.y, width: 0, height: 0 };
    case "circle":
      return { ...base, type: "circle", x: start.x, y: start.y, width: 0, height: 0 };
    case "line":
    case "arrow":
      return { ...base, type: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y };
    case "pen":
      return { ...base, type: "pen", points: [start], stroke: "#16a34a", fill: "none" };
  }
}

function updateDraftShape(shape: Shape, start: Point, current: Point): Shape {
  switch (shape.type) {
    case "rectangle":
    case "diamond":
    case "circle":
      return {
        ...shape,
        x: start.x,
        y: start.y,
        width: current.x - start.x,
        height: current.y - start.y,
      };
    case "line":
    case "arrow":
      return { ...shape, x2: current.x, y2: current.y };
    case "pen":
      return { ...shape, points: [...shape.points, current] };
    case "text":
      return shape;
  }
}

function isMeaningfulShape(shape: Shape) {
  switch (shape.type) {
    case "rectangle":
    case "diamond":
    case "circle":
      return Math.abs(shape.width) > 8 && Math.abs(shape.height) > 8;
    case "line":
    case "arrow":
      return pointDistance({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }) > 8;
    case "pen":
      return shape.points.length > 1;
    case "text":
      return Boolean(shape.text.trim());
  }
}

function isPointOnShape(shape: Shape, point: Point) {
  switch (shape.type) {
    case "rectangle": {
      const bounds = normalizeRect(shape.x, shape.y, shape.width, shape.height);
      return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    }
    case "diamond": {
      const bounds = normalizeRect(shape.x, shape.y, shape.width, shape.height);
      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;
      const dx = Math.abs(point.x - midX) / Math.max(1, bounds.width / 2);
      const dy = Math.abs(point.y - midY) / Math.max(1, bounds.height / 2);
      return dx + dy <= 1;
    }
    case "circle": {
      const bounds = normalizeRect(shape.x, shape.y, shape.width, shape.height);
      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;
      const rx = Math.max(1, bounds.width / 2);
      const ry = Math.max(1, bounds.height / 2);
      const dx = (point.x - midX) / rx;
      const dy = (point.y - midY) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case "line":
    case "arrow":
      return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }) <= 12;
    case "pen": {
      for (let index = 0; index < shape.points.length - 1; index += 1) {
        const start = shape.points[index];
        const end = shape.points[index + 1];
        if (start && end && distanceToSegment(point, start, end) <= 10) {
          return true;
        }
      }
      return false;
    }
    case "text": {
      const bounds = shapeBounds(shape);
      return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    }
  }
}

function findShapeAtPoint(shapes: Shape[], point: Point) {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index];
    if (shape && isPointOnShape(shape, point)) {
      return shape;
    }
  }
  return null;
}

async function readRoom(response: Response): Promise<RoomResponse> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return {
      ok: true,
      room:
        payload && typeof payload === "object" && "room" in payload
          ? ((payload as { room?: RoomRecord | null }).room ?? null)
          : null,
    };
  }

  return {
    ok: false,
    message:
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "Room lookup failed")
        : "Room lookup failed",
  };
}

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState>(null);
  const [readyToPersist, setReadyToPersist] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [hint, setHint] = useState("Click on the board to start drawing.");

  useEffect(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) {
      setViewport((current) =>
        current.x === 0 && current.y === 0 ? { x: rect.width / 2, y: rect.height / 2, scale: 1 } : current
      );
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      setError("Missing room slug.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRoom() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${BACKEND_KEY}/${encodeURIComponent(slug)}`);
        const result = await readRoom(response);
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setError(result.message);
          setRoom(null);
          return;
        }
        if (!result.room) {
          setError("That room does not exist yet.");
          setRoom(null);
          return;
        }
        setRoom(result.room);
      } catch (roomError) {
        if (!cancelled) {
          setError(roomError instanceof Error ? roomError.message : "Unable to load this room.");
          setRoom(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRoom();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const key = `${STORAGE_PREFIX}:${slug}`;
    const stored = window.localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Shape[];
        if (Array.isArray(parsed)) {
          setShapes(parsed);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
    setReadyToPersist(true);
  }, [slug]);

  useEffect(() => {
    if (!slug || !readyToPersist) return;
    window.localStorage.setItem(`${STORAGE_PREFIX}:${slug}`, JSON.stringify(shapes));
  }, [shapes, slug, readyToPersist]);

  useEffect(() => {
    if (textEditor) {
      const frame = window.requestAnimationFrame(() => {
        editorRef.current?.focus();
        editorRef.current?.setSelectionRange(textEditor.value.length, textEditor.value.length);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [textEditor?.shapeId]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (textEditor) {
        if (event.key === "Escape") {
          event.preventDefault();
          setShapes((current) => current.filter((shape) => shape.id !== textEditor.shapeId));
          setTextEditor(null);
          setHint("Text cancelled.");
        }
        return;
      }

      if (event.key === "Escape") {
        setSelectedId(null);
        setInteraction(null);
        setDraftShape(null);
        setHint("Selection cleared.");
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        setShapes((current) => current.filter((shape) => shape.id !== selectedId));
        setSelectedId(null);
        setHint("Shape deleted.");
      }

      const hotkey = Number(event.key);
      if (hotkey >= 1 && hotkey <= 8) {
        const nextTool = TOOLS[hotkey - 1]?.id;
        if (nextTool) {
          setTool(nextTool);
          setHint(`Switched to ${nextTool}.`);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, textEditor]);

  function zoomAt(anchor: Point, nextScale: number) {
    const boundedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    setViewport((current) => {
      const worldPoint = {
        x: (anchor.x - current.x) / current.scale,
        y: (anchor.y - current.y) / current.scale,
      };
      return {
        scale: boundedScale,
        x: anchor.x - worldPoint.x * boundedScale,
        y: anchor.y - worldPoint.y * boundedScale,
      };
    });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const point = readPoint(event, stage);
    const delta = event.deltaY < 0 ? 1.08 : 0.92;
    zoomAt(point, viewport.scale * delta);
  }

  function handleStagePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;

    const stage = stageRef.current;
    if (!stage) return;

    const screenPoint = readPoint(event, stage);
    const worldPoint = screenToWorld(screenPoint, viewport);
    const svg = event.currentTarget;

    if (tool === "text") {
      event.preventDefault();
      event.stopPropagation();

      const shape: TextShape = {
        id: createId(),
        type: "text",
        x: worldPoint.x,
        y: worldPoint.y,
        text: "",
        fontSize: 56,
        stroke: "#16a34a",
        fill: "transparent",
        strokeWidth: 0,
      };

      setShapes((current) => [...current, shape]);
      setSelectedId(shape.id);
      setTextEditor({
        shapeId: shape.id,
        x: worldPoint.x,
        y: worldPoint.y,
        value: "",
      });
      setHint("Type to place text.");
      return;
    }

    svg.setPointerCapture(event.pointerId);

    if (tool === "select") {
      const hitShape = findShapeAtPoint(shapes, worldPoint);
      if (hitShape) {
        setSelectedId(hitShape.id);
        setInteraction({ kind: "move", shapeId: hitShape.id, start: worldPoint, origin: hitShape });
        setHint(`Moving ${hitShape.type}.`);
        return;
      }

      setSelectedId(null);
      setInteraction({ kind: "pan", start: screenPoint, origin: viewport });
      setHint("Drag to pan the canvas.");
      return;
    }

    const draft = createDraftShape(tool as DrawingTool, worldPoint);
    setSelectedId(draft.id);
    draftShapeRef.current = draft;
    setDraftShape(draft);
    setInteraction({ kind: "draw", tool: tool as DrawingTool, start: worldPoint });
    setHint(`Drawing ${tool}.`);
  }

  function handleStagePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!interaction) return;

    const stage = stageRef.current;
    if (!stage) return;

    const screenPoint = readPoint(event, stage);
    const worldPoint = screenToWorld(screenPoint, viewport);

    if (interaction.kind === "draw") {
      setDraftShape((current) => {
        const updated = current ? updateDraftShape(current, interaction.start, worldPoint) : current;
        draftShapeRef.current = updated;
        return updated;
      });
      return;
    }

    if (interaction.kind === "pan") {
      setViewport({
        x: interaction.origin.x + (screenPoint.x - interaction.start.x),
        y: interaction.origin.y + (screenPoint.y - interaction.start.y),
        scale: interaction.origin.scale,
      });
      return;
    }

    const deltaX = worldPoint.x - interaction.start.x;
    const deltaY = worldPoint.y - interaction.start.y;
    setShapes((current) =>
      current.map((shape) => (shape.id === interaction.shapeId ? moveShape(interaction.origin, deltaX, deltaY) : shape))
    );
  }

  function handleStagePointerUp(event: PointerEvent<SVGSVGElement>) {
    const finalDraft = draftShapeRef.current;
    if (interaction?.kind === "draw" && finalDraft && isMeaningfulShape(finalDraft)) {
      setShapes((current) => [...current, finalDraft]);
      setHint(`${finalDraft.type} added.`);
    } else if (interaction?.kind === "draw") {
      setHint("Shape discarded.");
    }

    setInteraction(null);
    setDraftShape(null);
    draftShapeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    if (!textEditor) return;
    const value = (event.target as HTMLTextAreaElement).value;
    setTextEditor((current) => (current ? { ...current, value } : current));
    setShapes((current) =>
      current.map((shape) =>
        shape.id === textEditor.shapeId && shape.type === "text" ? { ...shape, text: value } : shape
      )
    );
  }

  function commitText() {
    if (!textEditor) return;
    const value = textEditor.value.trim();

    if (!value) {
      setShapes((current) => current.filter((shape) => shape.id !== textEditor.shapeId));
      setTextEditor(null);
      setHint("Text cancelled.");
      return;
    }

    setShapes((current) =>
      current.map((shape) =>
        shape.id === textEditor.shapeId && shape.type === "text" ? { ...shape, text: value } : shape
      )
    );
    setTextEditor(null);
    setHint("Text added.");
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitText();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setShapes((current) => current.filter((shape) => shape.id !== textEditor?.shapeId));
      setTextEditor(null);
      setHint("Text cancelled.");
    }
  }

  function renderShape(shape: Shape) {
    const isSelected = shape.id === selectedId;
    const selectedStroke = isSelected ? "#4f46e5" : shape.stroke;

    switch (shape.type) {
      case "rectangle": {
        const rect = normalizeRect(shape.x, shape.y, shape.width, shape.height);
        return (
          <g key={shape.id}>
            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="18" fill={shape.fill} stroke={selectedStroke} strokeWidth={shape.strokeWidth} />
            {isSelected ? <rect x={rect.x - 6} y={rect.y - 6} width={rect.width + 12} height={rect.height + 12} rx="20" fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      }
      case "diamond":
        return (
          <g key={shape.id}>
            <polygon points={diamondPoints(shape)} fill={shape.fill} stroke={selectedStroke} strokeWidth={shape.strokeWidth} />
            {isSelected ? <polygon points={diamondPoints({ ...shape, x: shape.x - 6, y: shape.y - 6, width: shape.width + 12, height: shape.height + 12 })} fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      case "circle": {
        const rect = normalizeRect(shape.x, shape.y, shape.width, shape.height);
        return (
          <g key={shape.id}>
            <ellipse cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} rx={Math.max(8, rect.width / 2)} ry={Math.max(8, rect.height / 2)} fill={shape.fill} stroke={selectedStroke} strokeWidth={shape.strokeWidth} />
            {isSelected ? <ellipse cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} rx={Math.max(8, rect.width / 2) + 8} ry={Math.max(8, rect.height / 2) + 8} fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      }
      case "line":
      case "arrow":
        return (
          <g key={shape.id}>
            <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={selectedStroke} strokeWidth={shape.strokeWidth} strokeLinecap="round" markerEnd={shape.type === "arrow" ? "url(#arrowhead)" : undefined} />
            {isSelected ? <rect x={shapeBounds(shape).x - 8} y={shapeBounds(shape).y - 8} width={shapeBounds(shape).width + 16} height={shapeBounds(shape).height + 16} fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      case "pen":
        return (
          <g key={shape.id}>
            <polyline points={formatPenPoints(shape.points)} fill="none" stroke={selectedStroke} strokeWidth={shape.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            {isSelected ? <rect x={shapeBounds(shape).x - 8} y={shapeBounds(shape).y - 8} width={shapeBounds(shape).width + 16} height={shapeBounds(shape).height + 16} fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      case "text": {
        const bounds = shapeBounds(shape);
        return (
          <g key={shape.id}>
            <text x={shape.x} y={shape.y} fill="#16a34a" fontFamily="Comic Sans MS, Segoe Print, Bradley Hand, cursive" fontSize={shape.fontSize} fontWeight="600" dominantBaseline="hanging">
              {shape.text}
            </text>
            {isSelected ? <rect x={bounds.x - 8} y={bounds.y - 8} width={bounds.width + 16} height={bounds.height + 16} rx="12" fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      }
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setHint("Room link copied.");
    } catch {
      setHint("Could not copy link.");
    }
  }

  const zoomPercent = Math.round(viewport.scale * 100);

  return (
    <main className={styles.page}>
      <div className={styles.stage} ref={stageRef} onWheel={handleWheel}>
        <div className={styles.topChrome}>
          <button className={styles.menuButton} type="button" aria-label="Menu">
            ☰
          </button>

          <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
            {TOOLS.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={tool === entry.id ? styles.toolButtonActive : styles.toolButton}
                onClick={() => {
                  setTool(entry.id);
                  setTextEditor(null);
                  setInteraction(null);
                  setDraftShape(null);
                  setHint(`Switched to ${entry.label.toLowerCase()}.`);
                }}
                aria-label={entry.label}
                title={entry.label}
              >
                <span className={styles.toolIcon}>{entry.icon}</span>
                <span className={styles.toolHotkey}>{index + 1}</span>
              </button>
            ))}
          </div>

          <div className={styles.rightChrome}>
            <span className={styles.roomPill}>{room ? room.slug : slug}</span>
            <button className={styles.shareButton} type="button" onClick={handleShare}>
              Share
            </button>
          </div>
        </div>

        <p className={styles.hint}>{loading ? "Loading room..." : error || hint}</p>

        <svg
          ref={svgRef}
          className={styles.canvas}
          viewBox={`0 0 ${stageRef.current?.clientWidth ?? 1600} ${stageRef.current?.clientHeight ?? 900}`}
          preserveAspectRatio="none"
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerLeave={handleStagePointerUp}
        >
          <defs>
            <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="1" />
            </pattern>
            <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 12 6 L 0 12 z" fill="#1f2937" />
            </marker>
          </defs>

          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid)" />
            {shapes.map(renderShape)}
            {draftShape ? renderShape(draftShape) : null}
          </g>
        </svg>

        {textEditor ? (
          <textarea
            ref={editorRef}
            autoFocus
            className={styles.textEditor}
            value={textEditor.value}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            onBlur={commitText}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: `${worldToScreen({ x: textEditor.x, y: textEditor.y }, viewport).x}px`,
              top: `${worldToScreen({ x: textEditor.x, y: textEditor.y }, viewport).y}px`,
            }}
            placeholder="Type text"
            rows={1}
          />
        ) : null}

        <div className={styles.zoomDock}>
          <button
            type="button"
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const rect = stage.getBoundingClientRect();
              zoomAt({ x: rect.width / 2, y: rect.height / 2 }, viewport.scale / 1.12);
            }}
          >
            −
          </button>
          <span>{zoomPercent}%</span>
          <button
            type="button"
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const rect = stage.getBoundingClientRect();
              zoomAt({ x: rect.width / 2, y: rect.height / 2 }, viewport.scale * 1.12);
            }}
          >
            +
          </button>
        </div>

        <div className={styles.statusPill}>
          {room ? `Room #${room.id}` : "Room not found"}
        </div>
      </div>
    </main>
  );
}
