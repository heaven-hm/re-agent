import { expect, it } from "vitest";
import { reconstructMemoryLifetimes } from "../../../src/domain/reconstruction/MemoryLifetimes.js";

it("models allocation/write/free and address reuse as distinct lifetimes", () => {
  const values = reconstructMemoryLifetimes([
    {kind:"alloc",sequence:1,address:0x100n,size:16n,allocationId:"one"},
    {kind:"write",sequence:2,address:0x104n,bytes:4,allocationId:"one"},
    {kind:"free",sequence:3,address:0x100n,allocationId:"one"},
    {kind:"alloc",sequence:4,address:0x100n,size:8n,allocationId:"two"},
  ]);
  expect(values[0]?.writes[0]?.offset).toBe(4n);
  expect(values[0]?.freedAt).toBe(3);
  expect(values[1]?.allocatedAt).toBe(4);
});
it("rejects out-of-bounds and after-free writes", () => {
  const alloc = {kind:"alloc" as const,sequence:1,address:100n,size:4n,allocationId:"one"};
  expect(() => reconstructMemoryLifetimes([alloc,{kind:"write",sequence:2,address:103n,bytes:2,allocationId:"one"}])).toThrow(/Out-of-bounds/u);
  expect(() => reconstructMemoryLifetimes([alloc,{kind:"free",sequence:2,address:100n,allocationId:"one"},{kind:"write",sequence:3,address:100n,bytes:1,allocationId:"one"}])).toThrow(/freed/u);
});

it("handles a large single-allocation write history without quadratic copying", () => {
  const events = [{kind:"alloc" as const,sequence:1,address:100n,size:4n,allocationId:"one"},
    ...Array.from({length:10000}, (_, i) => ({kind:"write" as const,sequence:i+2,address:100n,bytes:1,allocationId:"one"}))];
  expect(reconstructMemoryLifetimes(events)[0]?.writes).toHaveLength(10000);
});
it("rejects an unknown event kind at the runtime boundary", () => {
  const invalid = {kind:"corrupt",sequence:1,address:100n,allocationId:"x"};
  expect(() => reconstructMemoryLifetimes([invalid as never])).toThrow(/Unknown memory event kind/u);
});
