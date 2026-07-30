"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
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

type Tool =
  | "pan"
  | "select"
  | "rectangle"
  | "diamond"
  | "circle"
  | "arrow"
  | "line"
  | "pen"
  | "eraser"
  | "text"
  | "image";
type DrawingTool = Exclude<Tool, "pan" | "select" | "eraser" | "text">;
type BoardBackground = "paper" | "mint" | "warm" | "ink";
type ShapeColorId = "slate" | "indigo" | "emerald" | "amber" | "rose";
type MenuActionId =
  | "open"
  | "image"
  | "save"
  | "export"
  | "collaboration"
  | "palette"
  | "find"
  | "help"
  | "reset";

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

type ImageShape = BaseShape & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
};

type Shape = RectangleShape | DiamondShape | CircleShape | LineShape | PenShape | TextShape | ImageShape;

type Interaction =
  | { kind: "draw"; tool: DrawingTool; start: Point }
  | { kind: "move"; shapeId: string; start: Point; origin: Shape }
  | { kind: "erase" }
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

type ChatRecord = {
  id: number;
  roomId: number;
  message: string;
  userId: string;
};

type ChatsResponse =
  | { ok?: boolean; messages?: ChatRecord[] }
  | { message?: string };

const BACKEND_KEY = "/api/rooms";
const WS_BACKEND_URL =
  process.env.NEXT_PUBLIC_WS_BACKEND_URL ?? "ws://127.0.0.1:8080";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;
const BOARD_BACKGROUND_STORAGE_KEY = "sketchsync-board-background";
const SHAPE_COLOR_STORAGE_KEY = "sketchsync-shape-color";
const SHAPE_COLORS: Array<{
  id: ShapeColorId;
  label: string;
  stroke: string;
  fill: string;
}> = [
  { id: "slate", label: "Slate", stroke: "#1f2937", fill: "rgba(31, 41, 55, 0.12)" },
  { id: "indigo", label: "Indigo", stroke: "#4f46e5", fill: "rgba(79, 70, 229, 0.14)" },
  { id: "emerald", label: "Emerald", stroke: "#16a34a", fill: "rgba(22, 163, 74, 0.14)" },
  { id: "amber", label: "Amber", stroke: "#d97706", fill: "rgba(217, 119, 6, 0.16)" },
  { id: "rose", label: "Rose", stroke: "#e11d48", fill: "rgba(225, 29, 72, 0.14)" },
];
const BOARD_BACKGROUNDS: Record<
  BoardBackground,
  {
    page: CSSProperties;
    stage: CSSProperties;
  }
> = {
  paper: {
    page: {
      backgroundColor: "#f4f6fb",
      backgroundImage:
        "radial-gradient(circle at 20% 10%, rgba(99, 102, 241, 0.08), transparent 24%), radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.06), transparent 20%), linear-gradient(180deg, #fbfbfd 0%, #f4f6fb 100%)",
    },
    stage: {
      backgroundColor: "#fafafa",
      backgroundImage:
        "linear-gradient(rgba(15, 23, 42, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.03) 1px, transparent 1px), #fafafa",
      backgroundSize: "48px 48px",
    },
  },
  mint: {
    page: {
      backgroundColor: "#eefcf4",
      backgroundImage:
        "radial-gradient(circle at 20% 10%, rgba(34, 197, 94, 0.12), transparent 24%), radial-gradient(circle at 80% 20%, rgba(14, 165, 233, 0.08), transparent 20%), linear-gradient(180deg, #f7fffb 0%, #eefcf4 100%)",
    },
    stage: {
      backgroundColor: "#f8fffb",
      backgroundImage:
        "linear-gradient(rgba(15, 23, 42, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.025) 1px, transparent 1px), #f8fffb",
      backgroundSize: "48px 48px",
    },
  },
  warm: {
    page: {
      backgroundColor: "#fff4eb",
      backgroundImage:
        "radial-gradient(circle at 20% 10%, rgba(251, 146, 60, 0.12), transparent 24%), radial-gradient(circle at 80% 20%, rgba(244, 114, 182, 0.08), transparent 20%), linear-gradient(180deg, #fffaf7 0%, #fff4eb 100%)",
    },
    stage: {
      backgroundColor: "#fffaf5",
      backgroundImage:
        "linear-gradient(rgba(15, 23, 42, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.025) 1px, transparent 1px), #fffaf5",
      backgroundSize: "48px 48px",
    },
  },
  ink: {
    page: {
      backgroundColor: "#e2e8f0",
      backgroundImage:
        "radial-gradient(circle at 20% 10%, rgba(59, 130, 246, 0.1), transparent 24%), radial-gradient(circle at 80% 20%, rgba(148, 163, 184, 0.12), transparent 20%), linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
    },
    stage: {
      backgroundColor: "#f1f5f9",
      backgroundImage:
        "linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px), #f1f5f9",
      backgroundSize: "48px 48px",
    },
  },
};

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: "pan", label: "Pan", icon: "✋" },
  { id: "select", label: "Select", icon: "↖" },
  { id: "rectangle", label: "Rect", icon: "▭" },
  { id: "diamond", label: "Diamond", icon: "◇" },
  { id: "circle", label: "Circle", icon: "◯" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "line", label: "Line", icon: "—" },
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "eraser", label: "Eraser", icon: "⌫" },
  { id: "text", label: "Text", icon: "A" },
];

const MENU_ACTIONS: Array<{
  id: MenuActionId;
  label: string;
  shortcut?: string;
  accent?: boolean;
}> = [
  { id: "open", label: "Open", shortcut: "Cmd+O" },
  { id: "image", label: "Insert image..." },
  { id: "save", label: "Save to..." },
  { id: "export", label: "Export image...", shortcut: "Cmd+Shift+E" },
  { id: "collaboration", label: "Live collaboration..." },
  { id: "palette", label: "Command palette", shortcut: "Cmd+/", accent: true },
  { id: "find", label: "Find on canvas", shortcut: "Cmd+F" },
  { id: "help", label: "Help", shortcut: "?" },
  { id: "reset", label: "Reset the canvas" },
];

function getShapeColor(colorId: ShapeColorId): (typeof SHAPE_COLORS)[number] {
  const fallbackColor = SHAPE_COLORS[0];
  return SHAPE_COLORS.find((color) => color.id === colorId) ?? fallbackColor!;
}

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
    case "image":
      return normalizeRect(shape.x, shape.y, shape.width, shape.height);
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
    case "image":
      return { ...shape, x: shape.x + deltaX, y: shape.y + deltaY };
  }
}

function createDraftShape(tool: DrawingTool, start: Point, color: { stroke: string; fill: string }): Shape {
  const base = {
    id: createId(),
    stroke: color.stroke,
    fill: color.fill,
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
      return { ...base, type: "pen", points: [start], fill: "none" };
    case "image":
      return {
        ...base,
        type: "image",
        x: start.x,
        y: start.y,
        width: 1,
        height: 1,
        src: "",
        name: "",
        naturalWidth: 1,
        naturalHeight: 1,
      };
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
    case "image":
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
    case "image":
      return Boolean(shape.src);
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
    case "image": {
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

function removeShapeAtPoint(shapes: Shape[], point: Point) {
  const target = findShapeAtPoint(shapes, point);
  if (!target) {
    return { shapes, removedShape: null };
  }

  return {
    shapes: shapes.filter((shape) => shape.id !== target.id),
    removedShape: target,
  };
}

function serializeBoard(roomSlug: string, shapes: Shape[], viewport: Viewport) {
  return JSON.stringify(
    {
      version: 2,
      roomSlug,
      shapes,
      viewport,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function centerViewportOnShape(shape: Shape, viewport: Viewport, stageWidth: number, stageHeight: number) {
  const bounds = shapeBounds(shape);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    ...viewport,
    x: stageWidth / 2 - centerX * viewport.scale,
    y: stageHeight / 2 - centerY * viewport.scale,
  };
}

function findMatchingShapes(shapes: Shape[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return shapes.filter((shape) => {
    if (shape.type === "text") {
      return shape.text.toLowerCase().includes(normalizedQuery);
    }
    if (shape.type === "image") {
      return [shape.type, shape.name].some((value) => value.toLowerCase().includes(normalizedQuery));
    }
    return shape.type.toLowerCase().includes(normalizedQuery);
  });
}

type LoadedImageAsset = {
  src: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
};

function fitImageSize(naturalWidth: number, naturalHeight: number, maxWidth = 420, maxHeight = 320) {
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createImageShape(asset: LoadedImageAsset, center: Point): ImageShape {
  const size = fitImageSize(asset.naturalWidth, asset.naturalHeight);
  return {
    id: createId(),
    type: "image",
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    src: asset.src,
    name: asset.name,
    naturalWidth: asset.naturalWidth,
    naturalHeight: asset.naturalHeight,
    stroke: "transparent",
    fill: "transparent",
    strokeWidth: 0,
  };
}

async function loadImageAsset(file: File): Promise<LoadedImageAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read that image."));
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = src;
  });

  return {
    src,
    name: file.name || "Image",
    naturalWidth: dimensions.width,
    naturalHeight: dimensions.height,
  };
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

function getInviteOrigin() {
  if (typeof window === "undefined") {
    return "";
  }

  if (APP_URL) {
    return APP_URL.replace(/\/$/, "");
  }

  const { hostname, port } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `http://127.0.0.1${port ? `:${port}` : ""}`;
  }

  return window.location.origin;
}

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageRef = useRef<LoadedImageAsset | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [hint, setHint] = useState("Click on the board to start drawing.");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [boardBackground, setBoardBackground] = useState<BoardBackground>("paper");
  const [shapeColorId, setShapeColorId] = useState<ShapeColorId>("slate");
  const [authToken, setAuthToken] = useState<string>("");
  const activeTextShapeId = textEditor?.shapeId;
  const canvasHydratedRef = useRef(false);
  const suppressCanvasBroadcastRef = useRef(false);
  const lastAppliedCanvasMessageRef = useRef("");

  useEffect(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) {
      setViewport((current) =>
        current.x === 0 && current.y === 0 ? { x: rect.width / 2, y: rect.height / 2, scale: 1 } : current
      );
    }
  }, []);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("sketchsync-token");
    if (storedToken) {
      setAuthToken(storedToken);
    }
  }, []);

  useEffect(() => {
    const savedBackground = window.localStorage.getItem(BOARD_BACKGROUND_STORAGE_KEY) as BoardBackground | null;
    if (savedBackground && savedBackground in BOARD_BACKGROUNDS) {
      setBoardBackground(savedBackground);
    }
  }, []);

  useEffect(() => {
    const savedColor = window.localStorage.getItem(SHAPE_COLOR_STORAGE_KEY) as ShapeColorId | null;
    if (savedColor && SHAPE_COLORS.some((color) => color.id === savedColor)) {
      setShapeColorId(savedColor);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BOARD_BACKGROUND_STORAGE_KEY, boardBackground);
  }, [boardBackground]);

  useEffect(() => {
    window.localStorage.setItem(SHAPE_COLOR_STORAGE_KEY, shapeColorId);
  }, [shapeColorId]);

  useEffect(() => {
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Node | null;
      const menuContains = target && ((menuRef.current && menuRef.current.contains(target)) || (menuButtonRef.current && menuButtonRef.current.contains(target)));
      if (isMenuOpen && target && !menuContains) {
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

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
    const roomId = room?.id;
    if (!roomId) {
      canvasHydratedRef.current = false;
      lastAppliedCanvasMessageRef.current = "";
      return;
    }

    canvasHydratedRef.current = false;
    lastAppliedCanvasMessageRef.current = "";
    return undefined;
  }, [room?.id]);

  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) {
      return;
    }

    const socket = new WebSocket(`${WS_BACKEND_URL}/?token=${encodeURIComponent(authToken)}`);
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join_room", roomId }));
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          roomId?: number;
          shapes?: Shape[];
        };

        if (payload.type === "canvas_sync" && payload.roomId === roomId) {
          suppressCanvasBroadcastRef.current = true;
          canvasHydratedRef.current = true;
          lastAppliedCanvasMessageRef.current = JSON.stringify(payload.shapes ?? []);
          setShapes(Array.isArray(payload.shapes) ? payload.shapes : []);
          setHint("Canvas synced.");
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.addEventListener("close", () => {
      setHint("Canvas disconnected.");
    });

    socket.addEventListener("error", () => {
      setHint("Canvas connection failed.");
    });

    return () => {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "leave_room", room: roomId }));
        }
      } catch {
        // Ignore cleanup errors.
      }

      socket.close();
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };
  }, [room?.id, authToken]);

  useEffect(() => {
    const roomId = room?.id;
    const socket = wsRef.current;

    if (!roomId || !socket || socket.readyState !== WebSocket.OPEN || !canvasHydratedRef.current) {
      return;
    }

    if (suppressCanvasBroadcastRef.current) {
      suppressCanvasBroadcastRef.current = false;
      return;
    }

    socket.send(
      JSON.stringify({
        type: "canvas_update",
        roomId,
        shapes,
      })
    );
  }, [room?.id, shapes]);

  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) {
      return;
    }

    let cancelled = false;

    async function syncFromHistory() {
      try {
        const response = await fetch(`/api/chats/${roomId}`);
        const result = (await response.json()) as ChatsResponse;

        if (cancelled || !response.ok || !result || typeof result !== "object" || !("messages" in result)) {
          return;
        }

        const latestMessage = result.messages?.[0];
        if (!latestMessage?.message || latestMessage.message === lastAppliedCanvasMessageRef.current) {
          return;
        }

        let parsed: unknown = null;
        try {
          parsed = JSON.parse(latestMessage.message);
        } catch {
          return;
        }

        if (!Array.isArray(parsed)) {
          return;
        }

        lastAppliedCanvasMessageRef.current = latestMessage.message;
        suppressCanvasBroadcastRef.current = true;
        canvasHydratedRef.current = true;
        setShapes(parsed as Shape[]);
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          setHint("Canvas synced from history.");
        }
      } catch {
        // Ignore polling errors; websocket remains the primary path.
      }
    }

    void syncFromHistory();
    const interval = window.setInterval(syncFromHistory, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [room?.id]);

  useEffect(() => {
    if (activeTextShapeId) {
      const frame = window.requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        editor.focus();
        const length = editor.value.length;
        editor.setSelectionRange(length, length);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [activeTextShapeId]);

  const handleExportImage = useCallback(async () => {
    const svgNode = svgRef.current;
    const stageNode = stageRef.current;
    if (!svgNode || !stageNode) {
      setHint("Nothing to export yet.");
      return;
    }

    const rect = stageNode.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const cloned = svgNode.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    cloned.setAttribute("width", String(width));
    cloned.setAttribute("height", String(height));

    const serialized = new XMLSerializer().serializeToString(cloned);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    try {
      const image = new Image();
      image.decoding = "async";
      const pngBlob = await new Promise<Blob | null>((resolve, reject) => {
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Canvas rendering is not available."));
            return;
          }

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob((result) => resolve(result), "image/png");
        };
        image.onerror = () => reject(new Error("Could not render the image."));
        image.src = url;
      });

      if (!pngBlob) {
        throw new Error("Could not export the canvas.");
      }

      const pngUrl = URL.createObjectURL(pngBlob);
      const anchor = document.createElement("a");
      anchor.href = pngUrl;
      anchor.download = `${room?.slug ?? "sketchsync"}.png`;
      anchor.click();
      URL.revokeObjectURL(pngUrl);
      setHint("Image exported.");
      setIsMenuOpen(false);
    } catch {
      downloadTextFile(`${room?.slug ?? "sketchsync"}.svg`, serialized, "image/svg+xml;charset=utf-8");
      setHint("Exported as SVG instead.");
      setIsMenuOpen(false);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [room?.slug]);

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      commandInputRef.current?.focus();
      commandInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    if (!isFindOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isFindOpen]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const isShortcut = event.metaKey || event.ctrlKey;

      if (isShortcut && event.key.toLowerCase() === "o") {
        event.preventDefault();
        handleOpenFile();
        return;
      }

      if (isShortcut && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        void handleExportImage();
        return;
      }

      if (isShortcut && event.key === "/") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
        setIsMenuOpen(false);
        return;
      }

      if (isShortcut && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsFindOpen(true);
        setIsMenuOpen(false);
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setIsHelpOpen(true);
        setIsMenuOpen(false);
        return;
      }

      if (event.key === "Escape") {
        if (tool === "image" && pendingImageRef.current) {
          pendingImageRef.current = null;
          setTool("select");
          setHint("Image placement cancelled.");
          return;
        }
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          return;
        }
        if (isFindOpen) {
          setIsFindOpen(false);
          setFindQuery("");
          return;
        }
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
        if (isMenuOpen) {
          setIsMenuOpen(false);
          return;
        }
      }

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

      const hotkey = event.key === "0" ? 10 : Number(event.key);
      if (hotkey >= 1 && hotkey <= TOOLS.length) {
        const nextTool = TOOLS[hotkey - 1]?.id;
        const nextLabel = TOOLS[hotkey - 1]?.label;
        if (nextTool) {
          setTool(nextTool);
          setHint(`Switched to ${nextLabel?.toLowerCase() ?? nextTool}.`);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, textEditor, isMenuOpen, isCommandPaletteOpen, isFindOpen, isHelpOpen, handleExportImage, tool]);

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

  function insertImageAsset(asset: LoadedImageAsset, center: Point) {
    const shape = createImageShape(asset, center);
    setShapes((current) => [...current, shape]);
    setSelectedId(shape.id);
    setInteraction(null);
    setDraftShape(null);
    draftShapeRef.current = null;
    setTextEditor(null);
    setHint(`Placed ${asset.name}.`);
  }

  function getViewportCenterWorldPoint() {
    const stage = stageRef.current;
    if (!stage) {
      return { x: 0, y: 0 };
    }

    const rect = stage.getBoundingClientRect();
    return screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, viewport);
  }

  function openImagePicker() {
    imageInputRef.current?.click();
    setTool("image");
    setHint("Choose an image to place on the board.");
    setIsMenuOpen(false);
  }

  async function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const asset = await loadImageAsset(file);
      pendingImageRef.current = asset;
      setTool("image");
      setHint("Click on the canvas to place the image.");
    } catch (imageError) {
      setHint(imageError instanceof Error ? imageError.message : "Could not load that image.");
    }
  }

  async function handleImageFiles(files: FileList | File[], center: Point) {
    const file = Array.isArray(files) ? files[0] : files.item(0);
    if (!file) {
      return;
    }

    try {
      const asset = await loadImageAsset(file);
      insertImageAsset(asset, center);
    } catch (imageError) {
      setHint(imageError instanceof Error ? imageError.message : "Could not load that image.");
    }
  }

  function handleStageDragOver(event: DragEvent<SVGSVGElement>) {
    event.preventDefault();
    if (Array.from(event.dataTransfer.files).some((file) => file.type.startsWith("image/"))) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleStageDrop(event: DragEvent<SVGSVGElement>) {
    const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!imageFile) {
      return;
    }

    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const screenPoint = readPoint(event, stage);
    const worldPoint = screenToWorld(screenPoint, viewport);
    void handleImageFiles([imageFile], worldPoint);
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const pastedImage = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      if (!pastedImage) {
        return;
      }

      const file = pastedImage.getAsFile();
      if (!file) {
        return;
      }

      event.preventDefault();
      void (async () => {
        try {
          const asset = await loadImageAsset(file);
          insertImageAsset(asset, getViewportCenterWorldPoint());
        } catch (imageError) {
          setHint(imageError instanceof Error ? imageError.message : "Could not load that image.");
        }
      })();
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [viewport]);

  function handleStagePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;

    const stage = stageRef.current;
    if (!stage) return;

    const screenPoint = readPoint(event, stage);
    const worldPoint = screenToWorld(screenPoint, viewport);
    const svg = event.currentTarget;
    const shapeColor = getShapeColor(shapeColorId);

    if (tool === "image") {
      event.preventDefault();
      event.stopPropagation();

      if (!pendingImageRef.current) {
        setHint("Choose an image first.");
        return;
      }

      svg.setPointerCapture(event.pointerId);
      insertImageAsset(pendingImageRef.current, worldPoint);
      setHint("Image placed. Click again to place another copy or upload a new file.");
      return;
    }

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
        stroke: shapeColor.stroke,
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

    if (tool === "eraser") {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      setSelectedId(null);
      setInteraction({ kind: "erase" });

      setShapes((current) => {
        const next = removeShapeAtPoint(current, worldPoint);
        if (!next.removedShape) {
          return current;
        }

        if (textEditor?.shapeId === next.removedShape.id) {
          setTextEditor(null);
        }

        setHint(`Erased ${next.removedShape.type}.`);
        return next.shapes;
      });

      return;
    }

    svg.setPointerCapture(event.pointerId);

    if (tool === "pan" || tool === "select") {
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

    const draft = createDraftShape(tool as DrawingTool, worldPoint, shapeColor);
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

    if (interaction.kind === "erase") {
      setShapes((current) => {
        const next = removeShapeAtPoint(current, worldPoint);
        if (!next.removedShape) {
          return current;
        }

        if (textEditor?.shapeId === next.removedShape.id) {
          setTextEditor(null);
        }

        setHint(`Erased ${next.removedShape.type}.`);
        return next.shapes;
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

  async function copyShareLink(url: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }

    const tempInput = document.createElement("input");
    tempInput.value = url;
    tempInput.setAttribute("readonly", "true");
    tempInput.style.position = "absolute";
    tempInput.style.left = "-9999px";
    document.body.appendChild(tempInput);
    tempInput.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(tempInput);
    return copied;
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
      case "image": {
        const bounds = shapeBounds(shape);
        return (
          <g key={shape.id}>
            <image
              href={shape.src}
              x={bounds.x}
              y={bounds.y}
              width={bounds.width}
              height={bounds.height}
              preserveAspectRatio="xMidYMid meet"
            />
            {isSelected ? <rect x={bounds.x - 8} y={bounds.y - 8} width={bounds.width + 16} height={bounds.height + 16} rx="12" fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      }
      case "text": {
        const bounds = shapeBounds(shape);
        return (
          <g key={shape.id}>
            <text x={shape.x} y={shape.y} fill={shape.stroke} fontFamily="Comic Sans MS, Segoe Print, Bradley Hand, cursive" fontSize={shape.fontSize} fontWeight="600" dominantBaseline="hanging">
              {shape.text}
            </text>
            {isSelected ? <rect x={bounds.x - 8} y={bounds.y - 8} width={bounds.width + 16} height={bounds.height + 16} rx="12" fill="none" stroke="#4f46e5" strokeDasharray="8 8" strokeWidth="2" pointerEvents="none" /> : null}
          </g>
        );
      }
    }
  }

  async function handleShare() {
    if (!room?.slug) {
      setHint("Open a room first to share it.");
      return;
    }

    const shareUrl = new URL(`/rooms/${encodeURIComponent(room.slug)}`, getInviteOrigin()).toString();
    const shareData = {
      title: "SketchSync room",
      text: `Join my SketchSync room: ${room.slug}`,
      url: shareUrl,
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setHint("Share sheet opened.");
        return;
      }

      const copied = await copyShareLink(shareUrl);
      setHint(copied ? "Room link copied." : "Could not copy link.");
    } catch {
      try {
        const copied = await copyShareLink(shareUrl);
        setHint(copied ? "Room link copied." : "Could not copy link.");
      } catch {
        setHint("Could not share this room right now.");
      }
    }
  }

  function handleOpenFile() {
    fileInputRef.current?.click();
    setIsMenuOpen(false);
  }

  function handleSaveBoard() {
    if (!room?.slug) {
      setHint("Open a room first to save it.");
      return;
    }

    downloadTextFile(
      `${room.slug}-sketchsync.json`,
      serializeBoard(room.slug, shapes, viewport),
      "application/json;charset=utf-8"
    );
    setHint("Board saved.");
    setIsMenuOpen(false);
  }

  function handleResetCanvas() {
    const shouldReset = window.confirm("Reset the canvas and delete every shape?");
    if (!shouldReset) {
      return;
    }

    setShapes([]);
    setSelectedId(null);
    setInteraction(null);
    setDraftShape(null);
    draftShapeRef.current = null;
    setTextEditor(null);
    setHint("Canvas reset.");
    setIsMenuOpen(false);
  }

  function handleOpenLiveCollaboration() {
    void handleShare();
    setIsMenuOpen(false);
  }

  function handleOpenCommandPalette() {
    setCommandQuery("");
    setIsCommandPaletteOpen(true);
    setIsMenuOpen(false);
  }

  function handleOpenFind() {
    setFindQuery("");
    setIsFindOpen(true);
    setIsMenuOpen(false);
  }

  function handleOpenHelp() {
    setIsHelpOpen(true);
    setIsMenuOpen(false);
  }

  function runMenuAction(actionId: MenuActionId) {
    setIsCommandPaletteOpen(false);
    setIsFindOpen(false);
    setIsHelpOpen(false);
    switch (actionId) {
      case "open":
        handleOpenFile();
        return;
      case "image":
        openImagePicker();
        return;
      case "save":
        handleSaveBoard();
        return;
      case "export":
        void handleExportImage();
        return;
      case "collaboration":
        handleOpenLiveCollaboration();
        return;
      case "palette":
        handleOpenCommandPalette();
        return;
      case "find":
        handleOpenFind();
        return;
      case "help":
        handleOpenHelp();
        return;
      case "reset":
        handleResetCanvas();
        return;
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    void (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as {
          shapes?: Shape[];
          viewport?: Viewport;
          roomSlug?: string;
        };

        if (Array.isArray(parsed.shapes)) {
          setShapes(parsed.shapes);
        }
        if (parsed.viewport && typeof parsed.viewport === "object") {
          setViewport(parsed.viewport);
        }
        setSelectedId(null);
        setInteraction(null);
        setDraftShape(null);
        draftShapeRef.current = null;
        setTextEditor(null);
        setHint("Board opened.");
        setIsMenuOpen(false);
      } catch {
        setHint("Could not open that file.");
      }
    })();
  }

  function jumpToShape(shape: Shape) {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    setSelectedId(shape.id);
    setViewport((current) => centerViewportOnShape(shape, current, rect.width, rect.height));
    setHint(`Focused ${shape.type}.`);
  }

  const findMatches = findMatchingShapes(shapes, findQuery);
  const commandResults = MENU_ACTIONS.filter((action) =>
    action.label.toLowerCase().includes(commandQuery.trim().toLowerCase())
  );
  const boardStyles = BOARD_BACKGROUNDS[boardBackground];
  const selectedShapeColor = getShapeColor(shapeColorId);

  const zoomPercent = Math.round(viewport.scale * 100);

  return (
    <main className={styles.page} style={boardStyles.page}>
      <div className={styles.stage} ref={stageRef} onWheel={handleWheel} style={boardStyles.stage}>
        <div className={styles.topChrome}>
          <button
            ref={menuButtonRef}
            className={styles.menuButton}
            type="button"
            aria-label="Menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
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
                <span className={styles.toolHotkey}>{index === 9 ? 0 : index + 1}</span>
              </button>
            ))}
            <button
              type="button"
              className={tool === "image" ? styles.toolButtonActive : styles.toolButton}
              onClick={openImagePicker}
              aria-label="Insert image"
              title="Insert image"
            >
              <span className={styles.toolIcon}>🖼</span>
              <span className={styles.toolHotkey}>+</span>
            </button>
          </div>

          <div className={styles.rightChrome}>
            <span className={styles.roomPill}>{room ? room.slug : slug}</span>
            <button className={styles.shareButton} type="button" onClick={handleShare}>
              Share
            </button>
          </div>
        </div>

        <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept="application/json" onChange={handleFileInputChange} />
        <input ref={imageInputRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={handleImageInputChange} />

        {isMenuOpen ? (
          <div className={styles.overlayBackdrop} onClick={() => setIsMenuOpen(false)}>
            <div ref={menuRef} className={styles.menuPanel} onClick={(event) => event.stopPropagation()}>
              <div className={styles.menuSection}>
                {MENU_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={action.accent ? styles.menuActionAccent : styles.menuAction}
                    onClick={() => runMenuAction(action.id)}
                  >
                    <span>{action.label}</span>
                    {action.shortcut ? <span className={styles.menuShortcut}>{action.shortcut}</span> : null}
                  </button>
                ))}
              </div>

              <div className={styles.menuDivider} />

              <div className={styles.menuSection}>
                <div className={styles.menuLabel}>Preferences</div>
                <div className={styles.preferenceRow}>
                  {(Object.keys(BOARD_BACKGROUNDS) as BoardBackground[]).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      className={boardBackground === theme ? styles.swatchActive : styles.swatch}
                      onClick={() => setBoardBackground(theme)}
                      title={theme}
                    >
                      <span className={styles.swatchDot} data-theme={theme} />
                    </button>
                  ))}
                </div>
                <p className={styles.menuHint}>Choose a board background and keep drawing.</p>
              </div>

              <div className={styles.menuDivider} />

              <div className={styles.menuSection}>
                <div className={styles.menuLabel}>Shape color</div>
                <div className={styles.preferenceRow}>
                  {SHAPE_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      className={shapeColorId === color.id ? styles.swatchActive : styles.swatch}
                      onClick={() => setShapeColorId(color.id)}
                      title={color.label}
                      aria-label={color.label}
                    >
                      <span className={styles.shapeSwatchDot} style={{ background: color.stroke }} />
                    </button>
                  ))}
                </div>
                <p className={styles.menuHint}>New shapes use this color until you change it again.</p>
              </div>
            </div>
          </div>
        ) : null}

        {isCommandPaletteOpen ? (
          <div className={styles.dialogBackdrop} onClick={() => setIsCommandPaletteOpen(false)}>
            <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
              <div className={styles.dialogHeader}>
                <strong>Command palette</strong>
                <span>Cmd+/</span>
              </div>
              <input
                ref={commandInputRef}
                className={styles.dialogInput}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search actions"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const firstAction = commandResults[0];
                    if (firstAction) {
                      runMenuAction(firstAction.id);
                    }
                  }
                }}
              />
              <div className={styles.dialogList}>
                {commandResults.length ? (
                  commandResults.map((action) => (
                    <button key={action.id} type="button" className={styles.dialogItem} onClick={() => runMenuAction(action.id)}>
                      <span>{action.label}</span>
                      {action.shortcut ? <span className={styles.menuShortcut}>{action.shortcut}</span> : null}
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <strong>No actions found</strong>
                    <span>Try a different keyword.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isFindOpen ? (
          <div className={styles.dialogBackdrop} onClick={() => setIsFindOpen(false)}>
            <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
              <div className={styles.dialogHeader}>
                <strong>Find on canvas</strong>
                <span>Cmd+F</span>
              </div>
              <input
                ref={findInputRef}
                className={styles.dialogInput}
                value={findQuery}
                onChange={(event) => setFindQuery(event.target.value)}
                placeholder="Search text or shape type"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const firstMatch = findMatches[0];
                    if (firstMatch) {
                      jumpToShape(firstMatch);
                      setIsFindOpen(false);
                    } else {
                      setHint("No matching shape found.");
                    }
                  }
                }}
              />
              <div className={styles.dialogList}>
                {findMatches.length ? (
                  findMatches.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      className={styles.dialogItem}
                      onClick={() => {
                        jumpToShape(shape);
                        setIsFindOpen(false);
                      }}
                    >
                      <span>
                        {shape.type}
                        {shape.type === "text" ? `: ${shape.text.slice(0, 28)}` : ""}
                      </span>
                      <span className={styles.menuShortcut}>#{shape.id.slice(0, 4)}</span>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <strong>No matches yet</strong>
                    <span>Search by text content or shape type.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isHelpOpen ? (
          <div className={styles.dialogBackdrop} onClick={() => setIsHelpOpen(false)}>
            <div className={styles.helpPanel} onClick={(event) => event.stopPropagation()}>
              <div className={styles.dialogHeader}>
                <strong>Help</strong>
                <span>Shortcuts</span>
              </div>
              <div className={styles.helpGrid}>
                <div>
                  <strong>Tools</strong>
                  <p>1-0 select toolbar tools in order, including eraser.</p>
                </div>
                <div>
                  <strong>Canvas</strong>
                  <p>Cmd+F to search, Cmd+O to open, Cmd+Shift+E to export, or paste and drop images onto the board.</p>
                </div>
                <div>
                  <strong>Menu</strong>
                  <p>Use the menu for save, reset, preferences, and collaboration.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
          onDragOver={handleStageDragOver}
          onDrop={handleStageDrop}
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
              color: selectedShapeColor.stroke,
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
