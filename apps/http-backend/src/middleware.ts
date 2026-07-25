import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";

export function middleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // @ts-ignore: TODO: Fix this???
    req.userId = (decoded as jwt.JwtPayload).userId;
    next();
  } catch {
    res.status(403).json({
      message: "Unauthorized",
    });
  }
}
