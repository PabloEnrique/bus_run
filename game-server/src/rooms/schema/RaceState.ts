import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") z: number = 0;
    @type("number") rotation: number = 0;
    @type("number") speed: number = 0;
    @type("number") torque: number = 0;
    @type("number") weight: number = 0;
}

export class RaceState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}
