/** Offline bounded semantic reconstruction; accepts caller-owned trace events only. */
export type MemoryEvent =
  | { kind: "alloc"; sequence: number; address: bigint; size: bigint; allocationId: string }
  | { kind: "free"; sequence: number; address: bigint; allocationId: string }
  | { kind: "write"; sequence: number; address: bigint; bytes: number; allocationId: string };

export interface MemoryLifetime {
  allocationId: string;
  address: bigint;
  size: bigint;
  allocatedAt: number;
  freedAt?: number;
  writes: readonly { sequence: number; offset: bigint; bytes: number }[];
}

export interface MemoryCaptureContext {
  readonly processId: number;
  readonly binarySha256: string;
  readonly addressSpaceId: string;
  readonly complete: boolean;
  readonly droppedEvents: number;
}

/** Lossy captures cannot justify definitive lifetime conclusions. */
export const reconstructMemoryCapture = (
  events: readonly MemoryEvent[],
  context: MemoryCaptureContext,
  maxEvents = 100_000,
) => {
  if (!Number.isSafeInteger(context.processId) || context.processId <= 0 ||
      !/^[a-f0-9]{64}$/u.test(context.binarySha256) || !context.addressSpaceId ||
      !Number.isSafeInteger(context.droppedEvents) || context.droppedEvents < 0)
    throw new Error("Invalid memory capture provenance");
  if (!context.complete || context.droppedEvents !== 0)
    return { status: "INCOMPLETE" as const, reason: "Partial or dropped memory observations", lifetimes: [] as MemoryLifetime[], context };
  return { status: "COMPLETE" as const, lifetimes: reconstructMemoryLifetimes(events, maxEvents), context };
};

export const reconstructMemoryLifetimes = (
  events: readonly MemoryEvent[],
  maxEvents = 100_000,
): MemoryLifetime[] => {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || events.length > maxEvents)
    throw new Error("Memory trace exceeds event budget");
  const byId = new Map<string, MemoryLifetime>();
  const live = new Map<string, MemoryLifetime>();
  // Limit concurrently live intervals so insertion/lookup work is bounded.
  // The sorted index permits O(log n) overlap checks at neighboring intervals.
  const MAX_LIVE_ALLOCATIONS = 2048;
  const liveSorted: MemoryLifetime[] = [];
  let previous = -1;
  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= previous)
      throw new Error("Memory trace must have strictly increasing sequence numbers");
    previous = event.sequence;
    if (typeof event.allocationId !== "string" || !event.allocationId || typeof event.address !== "bigint" || event.address < 0n)
      throw new Error("Invalid allocation identity or address");
    if (event.kind === "alloc") {
      if (typeof event.size !== "bigint" || event.size <= 0n || byId.has(event.allocationId))
        throw new Error("Invalid or reused allocation identity");
      if (liveSorted.length >= MAX_LIVE_ALLOCATIONS)
        throw new Error("Memory trace exceeds live allocation budget");
      const end = event.address + event.size;
      let low = 0, high = liveSorted.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (liveSorted[middle]!.address < event.address) low = middle + 1;
        else high = middle;
      }
      const prior = liveSorted[low - 1];
      const following = liveSorted[low];
      if ((prior && prior.address + prior.size > event.address) ||
          (following && end > following.address))
        throw new Error("Overlapping live allocations");
      const item: MemoryLifetime = {
        allocationId: event.allocationId, address: event.address, size: event.size,
        allocatedAt: event.sequence, writes: [],
      };
      byId.set(event.allocationId, item);
      live.set(event.allocationId, item);
      liveSorted.splice(low, 0, item);
      continue;
    }
    if (event.kind !== "free" && event.kind !== "write")
      throw new Error("Unknown memory event kind");
    const item = live.get(event.allocationId);
    if (!item) throw new Error("Unknown or freed allocation");
    if (event.kind === "free") {
      if (event.address !== item.address) throw new Error("Free address mismatch");
      item.freedAt = event.sequence;
      live.delete(event.allocationId);
      const position = liveSorted.indexOf(item);
      if (position < 0) throw new Error("Live allocation index inconsistent");
      liveSorted.splice(position, 1);
    } else if (event.kind === "write") {
      if (!Number.isSafeInteger(event.bytes) || event.bytes <= 0 ||
          event.address < item.address || event.address + BigInt(event.bytes) > item.address + item.size)
        throw new Error("Out-of-bounds allocation write");
      (item.writes as { sequence: number; offset: bigint; bytes: number }[]).push({
        sequence: event.sequence, offset: event.address - item.address, bytes: event.bytes,
      });
    } else {
      throw new Error("Unknown memory event kind");
    }
  }
  return [...byId.values()];
};
