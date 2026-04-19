import { Room, Client } from "colyseus";
import { RaceState, Player } from "./schema/RaceState";

interface JoinOptions {
    userId: string;
    torque?: number;
    weight?: number;
}

interface PositionUpdate {
    x: number;
    y: number;
    z: number;
    rotation: number;
    speed: number;
}

export class RaceRoom extends Room<{ state: RaceState }> {
    maxClients = 8;

    onCreate(): void {
        this.setState(new RaceState());

        this.onMessage("updatePosition", (client: Client, data: PositionUpdate) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            player.x = data.x ?? player.x;
            player.y = data.y ?? player.y;
            player.z = data.z ?? player.z;
            player.rotation = data.rotation ?? player.rotation;
            player.speed = data.speed ?? player.speed;
        });

        console.log(`[RaceRoom] Room ${this.roomId} created.`);
    }

    onJoin(client: Client, options: JoinOptions): void {
        const player = new Player();
        player.id = options.userId || client.sessionId;
        player.torque = options.torque ?? 0;
        player.weight = options.weight ?? 0;

        this.state.players.set(client.sessionId, player);
        console.log(`[RaceRoom] Player ${player.id} joined (session: ${client.sessionId}).`);
    }

    onLeave(client: Client): void {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            console.log(`[RaceRoom] Player ${player.id} left.`);
            this.state.players.delete(client.sessionId);
        }
    }

    onDispose(): void {
        console.log(`[RaceRoom] Room ${this.roomId} disposed.`);
    }
}
