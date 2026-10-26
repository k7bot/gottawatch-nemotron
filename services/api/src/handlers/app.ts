import { depsFromEnv } from "../lib/deps.js";
import { makeAppHandler } from "./routes.js";
export const handler = makeAppHandler(depsFromEnv);
