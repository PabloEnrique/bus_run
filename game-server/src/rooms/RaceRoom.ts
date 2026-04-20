import { Room, Client } from "colyseus";
import { RaceState, Player } from "./schema/RaceState";

interface JoinOptions {
    userId: string;
    mapId?: string;
    torque?: number;
    weight?: number;
    paintHex?: string;
    busModel?: string;
}

interface PositionUpdate {
    x: number;
    y: number;
    z: number;
    rotation: number;
    speed: number;
}

/**
 * Generate a 4-character uppercase alphanumeric room code.
 */
function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export class RaceRoom extends Room<{ state: RaceState }> {
    maxClients = 8;

    onCreate(options: JoinOptions): void {
        const state = new RaceState();

        // Room code + map set by the creator
        state.roomCode = generateRoomCode();
        state.mapId = options.mapId || "city";
        state.hostId = options.userId || "";

        this.setState(state);

        // Publish metadata so getAvailableRooms() can list this room
        this.setMetadata({
            roomCode: state.roomCode,
            mapId: state.mapId,
            hostId: state.hostId,
            clients: 0,
        });

        this.onMessage("updatePosition", (client: Client, data: PositionUpdate) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            player.x = data.x ?? player.x;
            player.y = data.y ?? player.y;
            player.z = data.z ?? player.z;
            player.rotation = data.rotation ?? player.rotation;
            player.speed = data.speed ?? player.speed;
        });

        console.log(`[RaceRoom] Room ${this.roomId} created — code: ${state.roomCode}, map: ${state.mapId}`);
    }

    onJoin(client: Client, options: JoinOptions): void {
        const player = new Player();
        player.id = options.userId || client.sessionId;
        player.torque = options.torque ?? 0;
        player.weight = options.weight ?? 0;
        player.paintHex = options.paintHex || "#4488ff";
        player.busModel = options.busModel || "";

        this.state.players.set(client.sessionId, player);

        // Update metadata with current player count
        this.setMetadata({
            ...this.metadata,
            clients: this.clients.length,
        });

        console.log(`[RaceRoom] Player ${player.id} joined (session: ${client.sessionId}, bus: ${player.busModel}).`);
    }

    onLeave(client: Client): void {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            console.log(`[RaceRoom] Player ${player.id} left.`);
            this.state.players.delete(client.sessionId);
        }

        // Update metadata with current player count
        this.setMetadata({
            ...this.metadata,
            clients: this.clients.length,
        });
    }

    onDispose(): void {
        console.log(`[RaceRoom] Room ${this.roomId} (${this.state?.roomCode}) disposed.`);
    }
}
