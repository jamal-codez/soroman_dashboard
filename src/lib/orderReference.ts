export type ReferenceableOrder = {
  reference?: string | null;
};

export function getOrderReference(order: ReferenceableOrder | null | undefined): string {
  const ref = order?.reference;
  return typeof ref === 'string' ? ref.trim() : '';
}

export const getOrderReferenceForOrder = getOrderReference;
