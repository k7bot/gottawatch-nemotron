import { depsFromEnv } from "../lib/deps.js";
import { makeTonightHandler } from "./routes.js";
export const handler = makeTonightHandler(depsFromEnv);
