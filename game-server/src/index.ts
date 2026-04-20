import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import cors from "cors";
import express from "express";
import { RaceRoom } from "./rooms/RaceRoom";

const PORT = Number(process.env.GAME_PORT) || 2567;

const app = express();
app.use(cors());
app.use("/colyseus", monitor());

const gameServer = new Server({
    transport: new WebSocketTransport({ server: app.listen(PORT) }),
});

gameServer.define("race", RaceRoom);

console.log(`[GameServer] Listening on ws://localhost:${PORT}`);
console.log(`[GameServer] Monitor at http://localhost:${PORT}/colyseus`);
