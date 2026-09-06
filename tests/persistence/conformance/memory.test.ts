import { createInMemoryRepositorySet } from "../../../src/persistence";
import { describeRepositoryConformance } from "./suite";

/**
 * The in-memory backend. Always runs — it is what the default suite and local
 * development use.
 */
describeRepositoryConformance("in-memory", async () => {
  let set = createInMemoryRepositorySet();
  return {
    get set() {
      return set;
    },
    reset: async () => {
      // A fresh set is the in-memory equivalent of truncating the tables.
      set = createInMemoryRepositorySet();
    },
  };
});
