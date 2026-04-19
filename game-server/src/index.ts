import { defineServer, defineRoom } from "colyseus";
import cors from "cors";
import { monitor } from "@colyseus/monitor";
import { RaceRoom } from "./rooms/RaceRoom";

const PORT = Number(process.env.GAME_PORT) || 2567;

const gameServer = defineServer({
    rooms: {
        race: defineRoom(RaceRoom),
    },

    express: (app) => {
        app.use(cors());

        // Colyseus monitor (development)
        app.use("/colyseus", monitor());
    },
});

gameServer.listen(PORT).then(() => {
    console.log(`[GameServer] Listening on ws://localhost:${PORT}`);
    console.log(`[GameServer] Monitor at http://localhost:${PORT}/colyseus`);
});
