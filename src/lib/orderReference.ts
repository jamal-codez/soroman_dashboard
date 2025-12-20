export type ReferenceableOrder = {
  reference?: string | null;
};

/**
 * Single source of truth for displaying an Order Reference.
 *
 * Requirement: reference must be backend-provided `Order.reference`.
 * This helper intentionally does NOT generate references client-side.
 */
export function getOrderReference(order: ReferenceableOrder | null | undefined): string {
  const ref = order?.reference;
  return typeof ref === 'string' ? ref.trim() : '';
}

// Backwards compatibility (older code went with `getOrderReferenceForOrder` naming)
export const getOrderReferenceForOrder = getOrderReference;
