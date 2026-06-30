// ---------------------------------------------------------------------------
// Global prefetch hook — fires key API queries after login in staggered waves
// to avoid 429 rate-limiting. Duplicate endpoints are fetched ONCE and seeded
// into every cache key that needs them. No artificial caps — fetch ALL data.
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, fetchAllPages } from '@/api/client';

const STALE = 30_000;
const GC = 5 * 60_000;
const BIG = 500; // backend max page_size — use fetchAllPages for >500 records
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePrefetchAll() {
  const qc = useQueryClient();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!localStorage.getItem('token')) return;
    fired.current = true;

    /** Seed one response into multiple cache keys */
    const seed = (keys: string[][], data: unknown) => {
      for (const k of keys) qc.setQueryData(k, data, { updatedAt: Date.now() });
    };

    const pf = (key: string[], fn: () => Promise<unknown>, stale = STALE) =>
      qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: stale, gcTime: GC }).catch(() => {});

    // shaped() no longer needed — fetchAllPages returns { count, results } directly

    (async () => {
      // ── Wave 1 (4 requests): All order endpoints ──────────────────
      const [allR, paidR, relR, verR, loadedR] = await Promise.allSettled([
        fetchAllPages((p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size })).catch(() => null),
        fetchAllPages((p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'paid' })).catch(() => null),
        fetchAllPages((p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'released' })).catch(() => null),
        fetchAllPages((p) => apiClient.admin.getVerifyOrders({ status: 'pending', page: p.page, page_size: p.page_size })).catch(() => null),
        fetchAllPages((p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size, status: 'loaded' })).catch(() => null),
      ]);

      const allVal = allR.status === 'fulfilled' ? allR.value : null;
      if (allVal) seed([['all-orders'], ['all-orders', 'shared'], ['all-orders', 'counts'], ['all-orders', 'security']], allVal);

      const paidVal = paidR.status === 'fulfilled' ? paidR.value : null;
      if (paidVal) seed([['all-orders', 'paid']], paidVal.results as unknown[]);

      const relVal = relR.status === 'fulfilled' ? relR.value : null;
      const loadedVal = loadedR.status === 'fulfilled' ? loadedR.value : null;
      // Merge released + loaded for PickupProcessing (Loading Tickets page)
      const relResults = [...(relVal?.results ?? []), ...(loadedVal?.results ?? [])];
      const relMerged = { count: relResults.length, results: relResults };
      seed([['all-orders', 'released']], relMerged);

      const verVal = verR.status === 'fulfilled' ? verR.value : null;
      if (verVal) seed([['verify-orders', 'all']], verVal);

      // ── Wave 2 (5 requests): Analytics, customers, PFIs, products, states
      await wait(400);
      await Promise.allSettled([
        pf(['analytics'], () => apiClient.admin.getAnalytics(), 60_000),
        pf(['customers'], () => apiClient.admin.adminGetAllCustomers()),
        pf(['pfis', 'active'], () => apiClient.admin.getPfis({ status: 'active', page: 1, page_size: BIG }), 60_000),
        pf(['products'], () => apiClient.admin.getProducts({ page: 1, page_size: BIG })),
        pf(['states'], () => apiClient.admin.getStates()),
      ]);
      const cd = qc.getQueryData(['customers']);
      if (cd) seed([['customers', 'from-orders']], cd);

      // ── Wave 3 (5 requests): Finance, fleet, state-prices ─────────
      await wait(400);
      const [bankR] = await Promise.allSettled([
        apiClient.admin.getBankAccounts({ active: true }).catch(() => null),
        pf(['finance-overview'], () => apiClient.admin.getFinanceOverview()),
        pf(['state-prices'], () => apiClient.admin.getStatesPricing()),
        pf(['fleet-trucks'], () => apiClient.admin.getFleetTrucks({ page: 1, page_size: BIG })),
        pf(['fleet-ledger'], () => apiClient.admin.getFleetLedger({ page: 1, page_size: BIG })),
      ]);
      if (bankR.status === 'fulfilled' && bankR.value) {
        seed([['bank-accounts'], ['bank-accounts', 'verify-payment-fallback']], bankR.value);
      }

      // ── Wave 4 (5 requests): Delivery module ──────────────────────
      await wait(400);
      const [invR, dcR] = await Promise.allSettled([
        apiClient.admin.getDeliveryInventory({ page: 1, page_size: BIG }).catch(() => null),
        apiClient.admin.getDeliveryCustomers({ page: 1, page_size: BIG }).catch(() => null),
        pf(['delivery-sales'], () => apiClient.admin.getDeliverySales({ page: 1, page_size: BIG })),
        pf(['pfis-for-delivery'], () => apiClient.admin.getPfis({ page: 1, page_size: BIG })),
        pf(['in-house-orders'], () => apiClient.admin.getInHouseOrders({ page: 1, page_size: BIG })),
      ]);
      if (invR.status === 'fulfilled' && invR.value) {
        seed([['delivery-inventory-all'], ['delivery-inventory']], invR.value);
      }
      if (dcR.status === 'fulfilled' && dcR.value) {
        seed([['delivery-customers'], ['delivery-customers-list']], dcR.value);
      }
    })();
  }, [qc]);
}
