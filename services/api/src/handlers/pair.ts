import { depsFromEnv } from "../lib/deps.js";
import { makePairHandler } from "./routes.js";
export const handler = makePairHandler(depsFromEnv);
