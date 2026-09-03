import { BetterAuth } from "@alchemy.run/better-auth";
import { Effect } from "effect";


export const authTemp = Effect.gen(function* () {
    return  BetterAuth({ emailAndPassword: { enabled: true } });
});