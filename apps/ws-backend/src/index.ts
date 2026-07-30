import { WebSocket, WebSocketServer } from 'ws';
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { JWT_SECRET } from '@repo/backend-common/config';
import { prismaClient } from "@repo/db/client";

const wss = new WebSocketServer({ port: 8080 });

interface User {
  ws: WebSocket;
  rooms: string[];
  userId: string;
}

type CanvasShape = Record<string, unknown>;

const users: User[] = [];

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded == "string") {
      return null;
    }

    if (!decoded || !decoded.userId) {
      return null;
    }

    return decoded.userId;
  } catch(e) {
    return null;
  }
}

wss.on('connection', function connection(ws, request) {
  const url = request.url;
  if (!url) {
    return;
  }
  const queryParams = new URLSearchParams(url.split('?')[1]);
  const token = queryParams.get('token') || "";
  let resolvedUserId = checkUser(token);
  let guestCreatePromise: Promise<string> | null = null;

  async function ensureUserId() {
    if (resolvedUserId) {
      return resolvedUserId;
    }

    if (!guestCreatePromise) {
      guestCreatePromise = (async () => {
        const guestId = randomUUID();
        const user = await prismaClient.user.create({
          data: {
            email: `guest-${guestId}@guest.local`,
            password: guestId,
            name: "Guest",
          },
        });

        resolvedUserId = user.id;
        const existingUser = users.find(x => x.ws === ws);
        if (existingUser) {
          existingUser.userId = user.id;
        }
        return user.id;
      })();
    }

    return guestCreatePromise;
  }

  users.push({
    userId: resolvedUserId ?? "",
    rooms: [],
    ws
  })

  ws.on('message', async function message(data) {
    let parsedData;
    if (typeof data !== "string") {
      parsedData = JSON.parse(data.toString());
    } else {
      parsedData = JSON.parse(data); // {type: "join-room", roomId: 1}
    }

    if (parsedData.type === "join_room") {
      await ensureUserId();
      const user = users.find(x => x.ws === ws);
      const roomId = String(parsedData.roomId);
      if (user && !user.rooms.includes(roomId)) {
        user.rooms.push(roomId);
      }

      const latestCanvasMessage = await prismaClient.chat.findFirst({
        where: {
          roomId: Number(roomId),
        },
        orderBy: {
          id: "desc",
        },
      });

      let shapes: CanvasShape[] = [];
      if (latestCanvasMessage?.message) {
        try {
          const parsed = JSON.parse(latestCanvasMessage.message);
          if (Array.isArray(parsed)) {
            shapes = parsed as CanvasShape[];
          }
        } catch {
          shapes = [];
        }
      }

      ws.send(JSON.stringify({
        type: "canvas_sync",
        roomId: Number(roomId),
        shapes
      }));
    }

    if (parsedData.type === "leave_room") {
      const user = users.find(x => x.ws === ws);
      if (!user) {
        return;
      }
      const roomId = String(parsedData.roomId ?? parsedData.room);
      user.rooms = user.rooms.filter(x => x !== roomId);
    }

    if (parsedData.type === "canvas_update") {
      const userId = await ensureUserId();
      const roomId = Number(parsedData.roomId);
      const shapes = Array.isArray(parsedData.shapes) ? (parsedData.shapes as CanvasShape[]) : [];

      await prismaClient.chat.create({
        data: {
          roomId,
          message: JSON.stringify(shapes),
          userId,
        },
      });

      users.forEach(user => {
        if (user.rooms.includes(String(roomId))) {
          user.ws.send(JSON.stringify({
            type: "canvas_sync",
            roomId,
            shapes
          }));
        }
      });
    }

  });

});
