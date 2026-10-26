import { findDemoTitle, searchDemoCatalog } from "./demo.js";
import type { Catalog } from "./tmdb.js";
export type { Catalog } from "./tmdb.js";

export const demoCatalog: Catalog = {
  mode: "demo",
  search: async (q) => searchDemoCatalog(q),
  get: async (id) => findDemoTitle(id),
};
