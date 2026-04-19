import { Client } from 'colyseus.js';

export class NetworkManager {
    constructor(serverUrl = 'ws://localhost:2567') {
        this.client = new Client(serverUrl);
        this.room = null;
        this._callbacks = { join: null, leave: null, update: null };
        this._lastSendTime = 0;
        this._sendInterval = 66; // ~15Hz
    }

    async joinRace({ userId, torque, weight }) {
        this.room = await this.client.joinOrCreate('race', {
            userId: String(userId),
            torque: torque || 0,
            weight: weight || 0,
        });

        this.room.state.players.onAdd((player, sessionId) => {
            if (sessionId === this.room.sessionId) return;
            if (this._callbacks.join) {
                this._callbacks.join(sessionId, player);
            }

            player.onChange(() => {
                if (this._callbacks.update) {
                    this._callbacks.update(sessionId, {
                        x: player.x,
                        y: player.y,
                        z: player.z,
                        rotation: player.rotation,
                        speed: player.speed,
                    });
                }
            });
        });

        this.room.state.players.onRemove((_player, sessionId) => {
            if (this._callbacks.leave) {
                this._callbacks.leave(sessionId);
            }
        });

        return this.room;
    }

    onPlayerJoin(callback) {
        this._callbacks.join = callback;
    }

    onPlayerLeave(callback) {
        this._callbacks.leave = callback;
    }

    onPlayerUpdate(callback) {
        this._callbacks.update = callback;
    }

    sendPosition(position) {
        if (!this.room) return;

        const now = performance.now();
        if (now - this._lastSendTime < this._sendInterval) return;
        this._lastSendTime = now;

        this.room.send('updatePosition', {
            x: position.x,
            y: position.y,
            z: position.z,
            rotation: position.rotation,
            speed: position.speed,
        });
    }

    async leave() {
        if (this.room) {
            await this.room.leave();
            this.room = null;
        }
    }

    dispose() {
        this.leave();
        this._callbacks = { join: null, leave: null, update: null };
    }
}
