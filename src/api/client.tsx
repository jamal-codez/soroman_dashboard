const ADMIN_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.ordersoroman.com/api/admin';

// Utility function to generate headers
const getHeaders = (additionalHeaders = {}) => {
  const token = localStorage.getItem('token');
  // Avoid sending `Authorization: Token null/undefined`.
  const authHeader = token ? { Authorization: `Token ${token}` } : {};

  return {
    'Content-Type': 'application/json',
    ...authHeader,
    ...additionalHeaders,
  };
};

const getHeadersfree = (additionalHeaders = {}) => ({
  'Content-Type': 'application/json',
  ...additionalHeaders,
});

/** Auth-only headers — no Content-Type (let the browser set multipart boundary) */
const getMultipartHeaders = (additionalHeaders = {}) => {
  const token = localStorage.getItem('token');
  const authHeader = token ? { Authorization: `Token ${token}` } : {};
  return { ...authHeader, ...additionalHeaders };
};

// ---------------------------------------------------------------------------
// Session-expired handler — fires once per session to avoid redirect loops.
// When any API call returns 401/403 while the user has a token, the session
// is expired: clear storage and kick back to login.
// ---------------------------------------------------------------------------
let _sessionExpiredFired = false;
const handleSessionExpired = () => {
  if (_sessionExpiredFired) return;
  _sessionExpiredFired = true;
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('fullname');
  localStorage.removeItem('label');
  window.location.href = '/login';
};
/** Reset the one-shot guard after a fresh login */
export const resetSessionExpiredGuard = () => { _sessionExpiredFired = false; };

// ---------------------------------------------------------------------------
// safeFetch — drop-in wrapper around `fetch` that auto-detects expired tokens
// ---------------------------------------------------------------------------
const safeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  // Only auto-logout on 401 (token invalid/expired).
  // 403 is not treated as session-expired since the backend has no
  // per-role permission restrictions — any valid token grants full access.
  if (response.status === 401 && localStorage.getItem('token')) {
    handleSessionExpired();
  }
  return response;
};

// Read backend error responses safely (JSON or text)
const safeReadError = async (response: Response): Promise<string> => {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data: unknown = await response.json().catch(() => null);
    const rec = (data && typeof data === 'object') ? (data as Record<string, unknown>) : null;
    return (
      (rec && typeof rec.error === 'string' && rec.error) ||
      (rec && typeof rec.detail === 'string' && rec.detail) ||
      (rec && typeof rec.message === 'string' && rec.message) ||
      `Request failed (${response.status})`
    );
  }
  const text = await response.text().catch(() => '');
  return text?.trim() ? text.trim() : `Request failed (${response.status})`;
};

export const apiClient = {
  admin: {
    // Authentication
    registerUser: async (data: {
      email: string;
      password: string;
      full_name: string;
      phone_number: string;
      role?: number;
      suspended?: boolean;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/users/register/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to register user');
      return response.json();
    },

    // Login intentionally uses raw `fetch` — unauthenticated calls should
    // never trigger the 401 auto-logout flow.
    loginUser: async (data: { email: string; password: string }) => {
      const response = await fetch(`${ADMIN_BASE}/users/login/`, {
        method: 'POST',
        headers: getHeadersfree(),
        body: JSON.stringify(data),
      });
      return response.json();
    },

    /** POST /api/admin/users/logout/ — deletes the auth token */
    logoutUser: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/users/logout/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** GET /api/admin/export-orders/?status=&from=&to= — returns CSV download */
    exportOrders: async (params?: { status?: string; from?: string; to?: string }) => {
      const url = new URL(`${ADMIN_BASE}/export-orders/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.blob();
    },

    /** GET /api/admin/security/orders/<id>/ — security view of a released order */
    getSecurityOrder: async (orderId: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/security/orders/${orderId}/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/orders/<id>/security-exit/ — mark security clearance */
    securityExit: async (orderId: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/security-exit/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    toggleBankSuspend: async (bankid: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/banktoggle/${bankid}/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    

    // Analytics
    getAnalytics: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/analytics/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Product Inventory
    getProductInventory: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/product-inventory/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Sales Overview
    getSalesOverview: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/sales-overview/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Recent Orders
    getRecentOrders: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/recent-orders/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // States
    getStates: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/states/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getStatesPricing: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/productprice/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    postBankAccount: async (data: { name: string; acct_no: string; bank_name: string }) => {
      const response = await safeFetch(`${ADMIN_BASE}/bank-accounts/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add bank account');
      }

      return response.json();
    },

    patchStatePrice: async (id: number, data: { price: number }) => {
      const response = await safeFetch(`${ADMIN_BASE}/states/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update state price');
      }

      return response.json();
    },

    editBankAccount: async (
      id: number,
      data: Partial<{ name: string; acct_no: string; bank_name: string; location_id?: number | null; is_active?: boolean; suspended?: boolean }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/banks/${id}/edit/`, {
        method: 'PATCH',
        headers: getHeaders(), // assumes it returns Content-Type and Authorization headers
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update bank account');
      }

      return response.json();
    },
    

    // Bank Accounts
    getBankAccounts: async (params?: {
      location_id?: number | string;
      state?: number | string;
      location?: string;
      state_name?: string;
      active?: boolean | string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/bank-accounts/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          url.searchParams.append(key, String(value));
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      return response.json();
    },

    updateProductPrice: async (productId: number, data: { unit_price: number }) => {
      const response = await safeFetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PATCH',
        headers:getHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update product');
      }

      return response.json();
    },

    createBankAccount: async (data: { name: string; acct_no: string; bank_name: string }) => {
      const response = await safeFetch(`${ADMIN_BASE}/bank-accounts/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create bank account');
      }
      return response.json();
    },

    deleteBankAccount: async (bankAccountId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/bank-accounts/${bankAccountId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    cancleOrder: async (orderID: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/cancleorder/${orderID}/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    releaseOrder: async (
      id: number,
      payload: {
        truck_number: string;
        driver_name: string;
        driver_phone: string;
        loading_datetime: string;
        pfi_id?: number;
        delivery_address?: string;
        nmdrpa_number?: string;
        compartment_details?: string;
        comp1_qty?: string;
        comp1_ullage?: string;
        comp2_qty?: string;
        comp2_ullage?: string;
        comp3_qty?: string;
        comp3_ullage?: string;
        comp4_qty?: string;
        comp4_ullage?: string;
        comp5_qty?: string;
        comp5_ullage?: string;
        loader_name?: string;
        loader_phone?: string;
      }
    ) => {
      // Use ONLY the new endpoint so ticket details are persisted.
      // POST /api/admin/orders/<id>/release/
      const url = `${ADMIN_BASE}/orders/${id}/release/`;

      const response = await safeFetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload || {}),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          'Failed to release order';
        throw new Error(message);
      }

      return response.json();
    },

    confirmTruckExit: async (orderId: string | number) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/exit-truck/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Failed to confirm truck exit (${response.status}): ${msg}`);
      }
      return response.json();
    },

    // Confirm payment & release order (requires CanConfirmPayments permission)
    confirmPayment: async (orderId: number | string, payload?: { narration?: string }) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/confirm-payment/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload || {}),
      });
    
      if (!response.ok) {
        // Surface backend status on 409 so we can see what Order.status really is.
        const payload = (await response
          .json()
          .catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
    
        const baseMsg =
          (typeof payload.error === 'string' && payload.error) ||
          (typeof payload.detail === 'string' && payload.detail) ||
          (await safeReadError(response));
    
        const actualStatus = typeof payload.status === 'string' ? payload.status : undefined;
        const suffix = actualStatus ? ` (order status: ${actualStatus})` : '';
    
        throw new Error(`Confirm payment failed (${response.status}): ${baseMsg}${suffix}`);
      }
    
      return response.json();
    },

    // Confirmed Payments (paid + released orders)
    getConfirmedPayments: async (params?: {
      search?: string;
      pfi?: number | string;
      page?: number;
      page_size?: number;
    }) => {
      const url = new URL(`${ADMIN_BASE}/confirmed-payments/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          const s = String(value);
          if (!s.trim()) return;
          url.searchParams.set(key, s);
        });
      }

      const response = await safeFetch(url.toString(), {
        method: 'GET',
        headers: getHeaders(),
      });

      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Failed to fetch confirmed payments (${response.status}): ${msg}`);
      }

      return response.json();
    },

    // Top Customers
    getTopCustomers: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/top-customers/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Customers
    adminGetAllCustomers: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/customers/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // All Orders (Admin View)
    getAllAdminOrders: async (params?: { page?: number; page_size?: number; status?: string }) => {
      const url = new URL(`${ADMIN_BASE}/all-orders/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (String(value).trim() === '') return;
          url.searchParams.append(key, String(value));
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          `Failed to fetch orders (${response.status})`;
        throw new Error(message);
      }
      return response.json();
    },

    // Permanently delete an order (irreversible)
    deleteOrder: async (orderId: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Failed to delete order (${response.status}): ${msg}`);
      }

      // Most DELETE endpoints return 204 No Content.
      return true;
    },

    // Agents (Admin)
    adminListAgents: async (params?: { type?: 'general' | 'location'; location_id?: number; is_active?: boolean; search?: string; page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/agents/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (String(value).trim() === '') return;
          url.searchParams.append(key, String(value));
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          'Failed to fetch agents';
        throw new Error(message);
      }
      return response.json();
    },

    adminCreateAgent: async (data: { name: string; phone: string; type: 'general' | 'location'; location?: number | null; is_active: boolean }) => {
      const response = await safeFetch(`${ADMIN_BASE}/agents/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          'Failed to create agent';
        throw new Error(message);
      }
      return response.json();
    },

    adminUpdateAgent: async (id: number, data: Partial<{ name: string; phone: string; type: 'general' | 'location'; location: number | null; is_active: boolean }>) => {
      const response = await safeFetch(`${ADMIN_BASE}/agents/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          'Failed to update agent';
        throw new Error(message);
      }
      return response.json();
    },

    // Soft-delete on backend (sets is_active=false, returns 204)
    adminDeactivateAgent: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/agents/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) {
        const error = (await response.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        const message =
          (typeof error.error === 'string' && error.error) ||
          (typeof error.detail === 'string' && error.detail) ||
          'Failed to deactivate agent';
        throw new Error(message);
      }
      return true;
    },

    getPickupOrders: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/pickup-orders/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },


    

    // Products CRUD
    getProducts: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/products/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getProductsInventory: async (params?: { page?: number; page_size?: number; state_id?: number }) => {
      const url = new URL(`${ADMIN_BASE}/inventory_products/`);
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, value.toString());
          }
        });
      }

      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },


    createProduct: async (data: {
      name: string;
      abbreviation: string;
      description: string;
      unit_price: number;
      stock_quantity: number;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/products/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create product');
      }
      return response.json();
    },

    /** @deprecated Use getProducts() instead — this alias is kept for backward compat. */
    adminGetProducts: async (params?: { page?: number; page_size?: number }) => {
      // Delegate to getProducts to avoid duplicated code
      return apiClient.admin.getProducts(params);
    },

    updateStatePrice: async (updatedState: {
      id: number;
      products: { id: number; price: number }[];
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/states/${updatedState.id}/update-prices/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(updatedState),
      });
    
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update state prices');
      }
    
      return response.json();
    },
    
    toggleStateStatus: async (StatetId: string) => {
      const response = await safeFetch(`${ADMIN_BASE}/state/${StatetId}/togglestatus/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getProductById: async (productId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/products/${productId}/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // updateProduct: async (productId: number, data: {
    //   name: string;
    //   abbreviation: string;
    //   description: string;
    //   unit_price: number;
    //   stock_quantity: number;
    //   initial_stock_quantity: number;
    // }) => {
    //   const response = await safeFetch(`${ADMIN_BASE}/products/${productId}/`, {
    //     method: 'PUT',
    //     headers: getHeaders(),
    //     body: JSON.stringify(data),
    //   });
    //   return response.json();
    // },

    updateProduct: async (
      productId: number,
      data: {
        name: string;
        abbreviation: string;
        description: string;
        unit_price: number;
        stock_quantity: number;
        initial_stock_quantity: number;
      },
      state_id: number // pass state_id separately
    ) => {
      const url = new URL(`${ADMIN_BASE}/products/${productId}/`);
      url.searchParams.append('state_id', state_id.toString());

      const response = await safeFetch(url.toString(), {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },


    deleteProduct: async (productId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    // Customers
    getAllCustomers: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/customers/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getCustomerById: async (customerId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/customers/${customerId}/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getFullCustomerDetails: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/customers/full-details/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Payment Orders
    getPaymentOrders: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/payment-orders/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    getBanks: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/bank-accounts/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // DEPRECATED: /api/admin/update-order-status/ returns 410 Gone.
    // Use confirmPayment() or releaseOrder() instead.

    // Verify Orders
    getVerifyOrders: async (params?: {
      search?: string;
      status?: string;
      pfi?: number | string;
      page?: number;
      page_size?: number;
    }) => {
      // List endpoint: use GET with query params (DRF ListAPIView pagination)
      const url = new URL(`${ADMIN_BASE}/verify-orders/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          const s = String(value);
          if (!s.trim()) return;
          url.searchParams.set(key, s);
        });
      }

      const response = await safeFetch(url.toString(), {
        method: 'GET',
        headers: getHeaders(),
      });

      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Failed to fetch verify orders (${response.status}): ${msg}`);
      }

      return response.json();
    },

    // Finance Overview
    getFinanceOverview: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/finance-overview/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // Notifications
    sendNotification: async (data: {
      emails: string[];
      type: string;
      project: { name: string };
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/send-notification/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }
      return response.json();
    },

    // User Management
    getUsers: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/users/`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },

    updateUser: async (userId: number, data: Record<string, unknown>) => {
      const response = await safeFetch(`${ADMIN_BASE}/users/${userId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update user');
      return response.json();
    },

    adminUpdateProduct: async (productId: number, data: Record<string, unknown>) => {
      const response = await safeFetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    deleteUser: async (userId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/users/${userId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete user');
      }
      return response.ok;
    },

    createOfflineSale: async (data: {
      state: number;
      trucks: string[];
      status: 'pending' | 'paid';
      items: Array<{ product: number; quantity: number }>;
      notes?: string;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/offline-sales/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create offline sale');
      }
  
      return response.json();
    },
  
    getOfflineSales: async () => {
      const response = await safeFetch(`${ADMIN_BASE}/offline-sales/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },
    
    deleteOfflineSale: async (id: string) => {
      const response = await safeFetch(`${ADMIN_BASE}/offline-sales/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    getOrderAudit: async (params?: {
      page?: number;
      page_size?: number;
      q?: string;
      action?: string;
      from?: string;
      to?: string;
      location?: string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/order-audit/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v);
          if (s.trim().length === 0) return;
          url.searchParams.append(k, s);
        });
      }
      const response = await safeFetch(url.toString(), {
        method: 'GET',
        headers: getHeaders(),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Order audit request failed (${response.status}): ${msg}`);
      }
      return response.json();
    },

    getOrderAuditEvents: async (orderId: number | string, params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/orders/${orderId}/audit-events/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v);
          if (s.trim().length === 0) return;
          url.searchParams.append(k, s);
        });
      }
      const response = await safeFetch(url.toString(), {
        method: 'GET',
        headers: getHeaders(),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(`Order audit events request failed (${response.status}): ${msg}`);
      }
      return response.json();
    },

    getPfis: async (params?: { status?: string; location?: number | string; product?: number | string; page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/pfis/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (String(value).trim() === '') return;
          url.searchParams.append(key, String(value));
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    createPfi: async (data: {
      pfi_number: string;
      location: number;
      product: number;
      starting_qty_litres: string;
      notes?: string;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/pfis/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...data,
          status: 'active',
        }),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        // Include status code for the UI (400/409 handling)
        throw new Error(`${response.status}: ${msg}`);
      }
      return response.json();
    },

    finishPfi: async (id: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/pfis/${id}/finish/`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    assignOrdersToPfi: async (data: { order_ids: number[]; pfi_id: number }) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/assign-pfi/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    // ── Truck Tickets ──────────────────────────────────────────────────

    /** GET /api/admin/orders/<id>/truck-tickets/ — list all tickets for an order */
    getOrderTickets: async (orderId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/truck-tickets/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json() as Promise<
        Array<{
          id: number;
          order: number;
          truck_number: number;
          quantity_litres: string;
          driver_name: string | null;
          driver_phone: string | null;
          plate_number: string | null;
          ticket_status: string;
          created_at: string;
          updated_at: string;
        }>
      >;
    },

    /**
     * POST /api/admin/orders/<id>/generate-tickets/
     * Accepts an array of truck allocations. The backend creates one ticket
     * per entry. All quantities must sum to the order total.
     *
     * Body: { trucks: [{ quantity_litres, driver_name?, driver_phone?, plate_number? }, …] }
     */
    generateOrderTickets: async (
      orderId: number,
      trucks: Array<{
        quantity_litres: number;
        driver_name?: string;
        driver_phone?: string;
        plate_number?: string;
      }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/generate-tickets/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ trucks }),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(msg);
      }
      return response.json();
    },

    /** PATCH /api/admin/truck-tickets/<id>/ — update a single ticket */
    updateTicket: async (
      ticketId: number,
      payload: {
        driver_name?: string;
        driver_phone?: string;
        plate_number?: string;
        ticket_status?: string;
        quantity_litres?: number;
      }
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/truck-tickets/${ticketId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** GET /api/admin/truck-tickets/<id>/print/ — full print-ready data */
    getTicketPrintData: async (ticketId: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/truck-tickets/${ticketId}/print/`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json() as Promise<{
        ticket_id: number;
        order_reference: string;
        company_name: string;
        customer_name: string;
        customer_phone: string;
        product_name: string;
        truck_number: number;
        quantity_litres: string;
        driver_name: string | null;
        driver_phone: string | null;
        plate_number: string | null;
        ticket_status: string;
        location: string;
        total_trucks: number;
        loading_datetime: string | null;
      }>;
    },

    // ── In-House Orders (Consignment / Dispatch) ────────────────────────

    /**
     * POST /api/admin/orders/in-house/
     * Creates an in-house (consignment) order with amount=0, status=paid so it
     * bypasses payment confirmation and goes straight to pickup processing.
     */
    createInHouseOrder: async (data: {
      product_id: number;
      quantity: number;
      state_id: number;
      destination_state?: string;
      destination_town?: string;
      driver_name: string;
      driver_phone?: string;
      truck_number: string;
      supervised_by?: string;
      loading_date?: string;
      customer_name?: string;
      customer_phone?: string;
      notes?: string;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/in-house/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(msg);
      }
      return response.json();
    },

    /**
     * GET /api/admin/orders/in-house/
     * Lists all in-house orders. Supports pagination and filtering.
     */
    getInHouseOrders: async (params?: {
      page?: number;
      page_size?: number;
      search?: string;
      status?: string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/orders/in-house/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          const s = String(value);
          if (!s.trim()) return;
          url.searchParams.set(key, s);
        });
      }
      const response = await safeFetch(url.toString(), {
        headers: getHeaders(),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(msg);
      }
      return response.json();
    },

    /**
     * PATCH /api/admin/orders/<id>/update-price/
     * Updates the unit price and total amount for an in-house order after
     * the agent has sold the product.
     */
    updateInHouseOrderPrice: async (
      orderId: number,
      data: { unit_price: number; total_price?: number }
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/update-price/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(msg);
      }
      return response.json();
    },

    /**
     * PATCH /api/admin/orders/<id>/record-sale/
     * Records the sale of an in-house order — buyer details, delivery address,
     * unit price, and marks the order as "sold".
     */
    recordInHouseOrderSale: async (
      orderId: number,
      data: {
        sold_to_name: string;
        sold_to_phone: string;
        delivery_address: string;
        unit_price: number;
        total_price?: number;
      }
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/orders/${orderId}/record-sale/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const msg = await safeReadError(response);
        throw new Error(msg);
      }
      return response.json();
    },

    // ── Fleet Ledger (Trucks + Expenses / Income) ───────────────────

    /** GET /api/admin/fleet/trucks/ */
    getFleetTrucks: async (params?: { search?: string; page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/fleet/trucks/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/fleet/trucks/ */
    createFleetTruck: async (data: {
      plate_number: string;
      driver_name: string;
      driver_phone?: string;
      max_capacity?: number | null;
      notes?: string;
      [key: string]: unknown;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/fleet/trucks/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/fleet/trucks/<id>/ */
    updateFleetTruck: async (
      id: number,
      data: Partial<{ plate_number: string; driver_name: string; driver_phone: string; max_capacity: number | null; notes: string; is_active: boolean; [key: string]: unknown }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/fleet/trucks/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/fleet/trucks/<id>/ */
    deleteFleetTruck: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/fleet/trucks/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    /** GET /api/admin/fleet/ledger/ */
    getFleetLedger: async (params?: {
      truck_id?: number;
      entry_type?: 'expense' | 'income';
      category?: string;
      from?: string;
      to?: string;
      search?: string;
      page?: number;
      page_size?: number;
    }) => {
      const url = new URL(`${ADMIN_BASE}/fleet/ledger/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/fleet/ledger/ */
    createFleetLedgerEntry: async (data: {
      truck_id: number;
      entry_type: 'expense' | 'income';
      category: string;
      amount: number;
      date: string;
      description?: string;
      entered_by?: string;
    }) => {
      // Backend serializer expects `truck` (FK), not `truck_id`
      const { truck_id, ...rest } = data;
      const response = await safeFetch(`${ADMIN_BASE}/fleet/ledger/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ truck: truck_id, ...rest }),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/fleet/ledger/<id>/ */
    updateFleetLedgerEntry: async (
      id: number,
      data: Partial<{
        truck_id: number;
        entry_type: 'expense' | 'income';
        category: string;
        amount: number;
        date: string;
        description: string;
        entered_by: string;
      }>
    ) => {
      // Backend serializer expects `truck` (FK), not `truck_id`
      const { truck_id, ...rest } = data;
      const payload = truck_id !== undefined ? { truck: truck_id, ...rest } : rest;
      const response = await safeFetch(`${ADMIN_BASE}/fleet/ledger/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/fleet/ledger/<id>/ */
    deleteFleetLedgerEntry: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/fleet/ledger/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    // =====================================================================
    // Delivery Inventory (PFI Allocations to Delivery)
    // =====================================================================

    /** GET /api/admin/delivery/inventory/ */
    getDeliveryInventory: async (params?: {
      search?: string;
      pfi?: number;
      status?: string;
      page?: number;
      page_size?: number;
      ordering?: string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/delivery/inventory/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/delivery/inventory/ */
    createDeliveryInventory: async (data: {
      pfi?: number | null;
      depot?: string;
      location?: string;
      quantity_allocated: number;
      date_allocated?: string;
      notes?: string;
      // Truck-loading fields (omitted for PFI-only allocations)
      truck?: number | null;
      truck_number?: string;
      customer?: number | null;
      customer_name?: string;
      loading_status?: 'loaded' | 'offloaded' | 'empty' | string;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/inventory/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/delivery/inventory/<id>/ */
    updateDeliveryInventory: async (
      id: number,
      data: Partial<{
        pfi: number | null;
        depot: string;
        location: string;
        quantity_allocated: number;
        date_allocated: string;
        notes: string;
        // Truck-loading fields
        truck: number | null;
        truck_number: string;
        customer: number | null;
        customer_name: string;
        loading_status: string;
        date_offloaded: string;
      }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/inventory/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/delivery/inventory/<id>/ */
    deleteDeliveryInventory: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/inventory/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    // =====================================================================
    // Delivery Customers Database
    // =====================================================================

    /** GET /api/admin/delivery/customers/ */
    getDeliveryCustomers: async (params?: {
      search?: string;
      status?: string;
      page?: number;
      page_size?: number;
      ordering?: string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/delivery/customers/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/delivery/customers/ */
    createDeliveryCustomer: async (data: {
      customer_name: string;
      phone_number?: string;
      status?: string;
      assigned_trucks?: number[];
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/customers/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/delivery/customers/<id>/ */
    updateDeliveryCustomer: async (
      id: number,
      data: Partial<{
        customer_name: string;
        phone_number: string;
        status: string;
        assigned_trucks: number[];
      }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/customers/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/delivery/customers/<id>/ */
    deleteDeliveryCustomer: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/customers/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    // =====================================================================
    // Delivery Sales Ledger
    // =====================================================================

    /** GET /api/admin/delivery/sales/ */
    getDeliverySales: async (params?: {
      search?: string;
      customer?: number;
      date_from?: string;
      date_to?: string;
      page?: number;
      page_size?: number;
      ordering?: string;
    }) => {
      const url = new URL(`${ADMIN_BASE}/delivery/sales/`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const s = String(v); if (!s.trim()) return;
          url.searchParams.set(k, s);
        });
      }
      const response = await safeFetch(url.toString(), { headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/delivery/sales/ */
    createDeliverySale: async (data: {
      truck_number: string;
      date_loaded: string;
      depot_loaded?: string;
      customer: number;
      location?: string;
      quantity?: number;
      rate?: number;
      sales_value?: number;
      payment_amount?: number;
      payer_name?: string;
      bank?: string;
      date_of_payment?: string;
      phone_number?: string;
      remarks?: string;
    }) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/sales/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/delivery/sales/<id>/ */
    updateDeliverySale: async (
      id: number,
      data: Partial<{
        truck_number: string;
        date_loaded: string;
        depot_loaded: string;
        customer: number;
        location: string;
        quantity: number;
        rate: number;
        sales_value: number;
        payment_amount: number;
        payer_name: string;
        bank: string;
        date_of_payment: string;
        phone_number: string;
        remarks: string;
      }>
    ) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/sales/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/delivery/sales/<id>/ */
    deleteDeliverySale: async (id: number) => {
      const response = await safeFetch(`${ADMIN_BASE}/delivery/sales/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    // =====================================================================
    // Records  (POST multipart/form-data, GET / PATCH / DELETE JSON)
    // =====================================================================

    /** GET /api/admin/records/?category=&status= */
    getRecords: async (params?: { category?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.status) qs.set('status', params.status);
      const url = `${ADMIN_BASE}/records/${qs.toString() ? `?${qs}` : ''}`;
      const response = await safeFetch(url, { method: 'GET', headers: getHeaders() });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json(); // { results: [...], count, next, previous } or array
    },

    /** GET /api/admin/records/<id>/ */
    getRecord: async (id: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/records/${id}/`, {
        method: 'GET',
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** POST /api/admin/records/ — multipart/form-data for file upload */
    createRecord: async (data: {
      category: string;
      title: string;
      description?: string;
      amount?: string;
      extra?: Record<string, unknown>;
      pfi_id?: number;
      pfi_number?: string;
      file?: File | null;
    }) => {
      const fd = new FormData();
      fd.append('category', data.category);
      fd.append('title', data.title);
      if (data.description) fd.append('description', data.description);
      if (data.amount) fd.append('amount', data.amount);
      if (data.extra) fd.append('extra', JSON.stringify(data.extra));
      if (data.pfi_id) fd.append('pfi_id', String(data.pfi_id));
      if (data.pfi_number) fd.append('pfi_number', data.pfi_number);
      if (data.file) fd.append('file', data.file);

      const response = await safeFetch(`${ADMIN_BASE}/records/`, {
        method: 'POST',
        headers: getMultipartHeaders(),
        body: fd,
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/records/<id>/ */
    updateRecord: async (id: number | string, data: Record<string, unknown>) => {
      const response = await safeFetch(`${ADMIN_BASE}/records/${id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** DELETE /api/admin/records/<id>/ */
    deleteRecord: async (id: number | string) => {
      const response = await safeFetch(`${ADMIN_BASE}/records/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 204) return true;
      if (!response.ok) throw new Error(await safeReadError(response));
      return true;
    },

    /** PATCH /api/admin/records/<id>/approve/ */
    approveRecord: async (id: number | string, note?: string) => {
      const response = await safeFetch(`${ADMIN_BASE}/records/${id}/approve/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status_note: note || '' }),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },

    /** PATCH /api/admin/records/<id>/decline/ */
    declineRecord: async (id: number | string, note?: string) => {
      const response = await safeFetch(`${ADMIN_BASE}/records/${id}/decline/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status_note: note || '' }),
      });
      if (!response.ok) throw new Error(await safeReadError(response));
      return response.json();
    },
  },
};
