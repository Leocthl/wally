// Allocation ledger: how much of each parent's budget is reserved for sealed children. In memory, per parent id, shared
// by every orchestrator that seals a child of the same parent. Immutable maps: each change builds a new one.

export interface AllocationLedger {
  /** Total reserved under `parentId`, leaving out `exceptChildId` (a child that is being replaced or re-sealed). */
  allocated(parentId: string, exceptChildId?: string): number;
  /** Reserves `amountMinor` for `childId` (a later call for the same child replaces its amount). */
  reserve(parentId: string, childId: string, amountMinor: number): void;
  /** Gives the child's reservation back; returns the amount released (0 when there was none). */
  release(parentId: string, childId: string): number;
}

type Reservations = ReadonlyMap<string, number>;

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

export function createAllocationLedger(): AllocationLedger {
  let byParent: ReadonlyMap<string, Reservations> = new Map();
  const of = (parentId: string): Reservations => byParent.get(parentId) ?? new Map();
  const put = (parentId: string, next: Reservations): void => {
    byParent = new Map([...byParent, [parentId, next]]);
  };
  return {
    allocated(parentId, exceptChildId) {
      let total = 0;
      for (const [child, amount] of of(parentId)) if (child !== exceptChildId) total += amount;
      return total;
    },
    reserve(parentId, childId, amountMinor) {
      if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new AllocationError("an allocation is a whole number of minor units, zero or more");
      put(parentId, new Map([...of(parentId), [childId, amountMinor]]));
    },
    release(parentId, childId) {
      const current = of(parentId);
      const amount = current.get(childId) ?? 0;
      if (current.has(childId)) put(parentId, new Map([...current].filter(([child]) => child !== childId)));
      return amount;
    },
  };
}
