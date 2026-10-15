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

export const reconstructMemoryLifetimes = (
  events: readonly MemoryEvent[],
  maxEvents = 100_000,
): MemoryLifetime[] => {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || events.length > maxEvents)
    throw new Error("Memory trace exceeds event budget");
  const byId = new Map<string, MemoryLifetime>();
  const live = new Map<string, MemoryLifetime>();
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
      const end = event.address + event.size;
      for (const current of live.values())
        if (event.address < current.address + current.size && current.address < end)
          throw new Error("Overlapping live allocations");
      const item: MemoryLifetime = {
        allocationId: event.allocationId, address: event.address, size: event.size,
        allocatedAt: event.sequence, writes: [],
      };
      byId.set(event.allocationId, item);
      live.set(event.allocationId, item);
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
