import { Client } from 'colyseus.js';

export class NetworkManager {
    constructor(serverUrl = 'ws://localhost:2567') {
        this.client = new Client(serverUrl);
        this.room = null;
        this._callbacks = { join: null, leave: null, update: null };
        this._lastSendTime = 0;
        this._sendInterval = 66; // ~15Hz
    }

    // ─── Room lifecycle ──────────────────────────────────────

    /**
     * Create a new room. The creator chooses the map.
     * @returns {{ roomCode: string, roomId: string, mapId: string }}
     */
    async createRoom({ mapId, userId, torque, weight, paintHex, busModel }) {
        this.room = await this.client.create('race', {
            mapId,
            userId: String(userId),
            torque: torque || 0,
            weight: weight || 0,
            paintHex: paintHex || '#FFB300',
            busModel: busModel || '',
        });
        this._attachListeners();

        // State may not have synced yet — read from metadata or state with fallbacks
        const code = this.room.state?.roomCode
            || this.room.metadata?.roomCode
            || '';
        const resolvedMap = this.room.state?.mapId
            || this.room.metadata?.mapId
            || mapId;
        return {
            roomCode: code,
            roomId: this.room.roomId,
            mapId: resolvedMap,
        };
    }

    /**
     * Join a room by its 4-char code.
     * Fetches available rooms, finds the matching code, then joins by ID.
     */
    async joinByCode(code, { userId, torque, weight, paintHex, busModel }) {
        const rooms = await this.client.getAvailableRooms('race');
        const target = rooms.find(
            (r) => r.metadata?.roomCode?.toUpperCase() === code.toUpperCase(),
        );
        if (!target) {
            throw new Error(`Sala "${code}" no encontrada o está llena.`);
        }
        return this.joinById(target.roomId, { userId, torque, weight, paintHex, busModel });
    }

    /**
     * Join a room by its Colyseus room ID.
     */
    async joinById(roomId, { userId, torque, weight, paintHex, busModel }) {
        this.room = await this.client.joinById(roomId, {
            userId: String(userId),
            torque: torque || 0,
            weight: weight || 0,
            paintHex: paintHex || '#FFB300',
            busModel: busModel || '',
        });
        this._attachListeners();
        return {
            roomCode: this.room.state.roomCode,
            roomId: this.room.roomId,
            mapId: this.room.state.mapId,
        };
    }

    /**
     * Quick-join: join any available room or create one (legacy/fallback).
     */
    async joinRace({ userId, torque, weight, paintHex, busModel, mapId }) {
        this.room = await this.client.joinOrCreate('race', {
            userId: String(userId),
            torque: torque || 0,
            weight: weight || 0,
            paintHex: paintHex || '#FFB300',
            busModel: busModel || '',
            mapId: mapId || 'city',
        });
        this._attachListeners();
        return this.room;
    }

    /**
     * List all available rooms with metadata.
     * @returns {Promise<Array<{ roomId, roomCode, mapId, clients, maxClients }>>}
     */
    async listRooms() {
        const rooms = await this.client.getAvailableRooms('race');
        return rooms.map((r) => ({
            roomId: r.roomId,
            roomCode: r.metadata?.roomCode || '????',
            mapId: r.metadata?.mapId || 'city',
            clients: r.clients ?? 0,
            maxClients: r.maxClients ?? 8,
        }));
    }

    // ─── State listeners (shared) ────────────────────────────

    /** @private */
    _attachListeners() {
        if (!this.room) return;

        this.room.state.players.onAdd((player, sessionId) => {
            if (sessionId === this.room.sessionId) return;
            this._callbacks.join?.(sessionId, player);

            player?.onChange(() => {
                this._callbacks.update?.(sessionId, {
                    x: player?.x ?? 0,
                    y: player?.y ?? 0,
                    z: player?.z ?? 0,
                    rotation: player?.rotation ?? 0,
                    speed: player?.speed ?? 0,
                });
            });
        });

        this.room.state.players.onRemove((_player, sessionId) => {
            this._callbacks.leave?.(sessionId);
        });
    }

    // ─── Callbacks ───────────────────────────────────────────

    onPlayerJoin(callback) {
        this._callbacks.join = callback;
    }

    onPlayerLeave(callback) {
        this._callbacks.leave = callback;
    }

    onPlayerUpdate(callback) {
        this._callbacks.update = callback;
    }

    // ─── Position sync ───────────────────────────────────────

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

    // ─── Cleanup ─────────────────────────────────────────────

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
