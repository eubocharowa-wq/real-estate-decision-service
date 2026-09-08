import type {
  CollectionTask,
  SourceAdapter,
  SourceAdapterMethod,
} from "./contracts";

export class SourceAdapterRegistry {
  private readonly adapters: readonly SourceAdapter[];

  constructor(adapters: readonly SourceAdapter[]) {
    const keys = adapters.map(
      (adapter) => `${adapter.sourceId}:${adapter.method}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new Error("Duplicate source adapter registration.");
    this.adapters = [...adapters];
  }

  find(
    task: CollectionTask,
    method: SourceAdapterMethod,
  ): SourceAdapter | null {
    return (
      this.adapters.find(
        (adapter) => adapter.method === method && adapter.canHandle(task),
      ) ?? null
    );
  }
}
