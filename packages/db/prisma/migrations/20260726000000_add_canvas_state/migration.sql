-- CreateTable
CREATE TABLE "CanvasState" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasState_roomId_key" ON "CanvasState"("roomId");

-- AddForeignKey
ALTER TABLE "CanvasState" ADD CONSTRAINT "CanvasState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
