const ADMIN_BASE = 'https://api.ordersoroman.com/api/admin';
// const ADMIN_BASE = 'http://127.0.0.1:8000/api/admin';

// Utility function to generate headers
const getHeaders = (additionalHeaders = {}) => ({
  'Content-Type': 'application/json',
  Authorization: `Token ${localStorage.getItem('token')}`,
  ...additionalHeaders,
});

const getHeadersfree = (additionalHeaders = {}) => ({
  'Content-Type': 'application/json',
  ...additionalHeaders,
});

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
      const response = await fetch(`${ADMIN_BASE}/users/register/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to register user');
      return response.json();
    },

    loginUser: async (data: { email: string; password: string }) => {
      const response = await fetch(`${ADMIN_BASE}/users/login/`, {
        method: 'POST',
        headers: getHeadersfree(),
        body: JSON.stringify(data),
      });
      return response.json();
    },

    

    toggleBankSuspend: async (bankid: number) => {
      const response = await fetch(`${ADMIN_BASE}/banktoggle/${bankid}/`, {
        method: 'GET',
        headers: getHeaders(),
      });
      return response.ok ? true : response.json();
    },

    

    // Analytics
    getAnalytics: async () => {
      const response = await fetch(`${ADMIN_BASE}/analytics/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Product Inventory
    getProductInventory: async () => {
      const response = await fetch(`${ADMIN_BASE}/product-inventory/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Sales Overview
    getSalesOverview: async () => {
      const response = await fetch(`${ADMIN_BASE}/sales-overview/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Recent Orders
    getRecentOrders: async () => {
      const response = await fetch(`${ADMIN_BASE}/recent-orders/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // States
    getStates: async () => {
      const response = await fetch(`${ADMIN_BASE}/states/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    getStatesPricing: async () => {
      const response = await fetch(`${ADMIN_BASE}/productprice/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    postBankAccount: async (data: { name: string; acct_no: string; bank_name: string }) => {
      const response = await fetch(`${ADMIN_BASE}/bank-accounts/`, {
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
      const response = await fetch(`${ADMIN_BASE}/states/${id}/`, {
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

    editBankAccount: async (id: number, data: Partial<{ name: string; acct_no: string; bank_name: string }>) => {
      const response = await fetch(`${ADMIN_BASE}/banks/${id}/edit/`, {
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
    getBankAccounts: async () => {
      const response = await fetch(`${ADMIN_BASE}/bank-accounts/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    updateProductPrice: async (productId: number, data: { unit_price: number }) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
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
      const response = await fetch(`${ADMIN_BASE}/bank-accounts/`, {
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
      const response = await fetch(`${ADMIN_BASE}/bank-accounts/${bankAccountId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return response.ok ? true : response.json();
    },

    cancleOrder: async (orderID: number) => {
      const response = await fetch(`${ADMIN_BASE}/cancleorder/${orderID}/`, {
        method: 'GET',
        headers: getHeaders(),
      });
      return response.ok ? true : response.json();
    },

    releaseOrder: async (orderId: number, data?: {
      truck_number: string;
      driver_name: string;
      driver_phone: string;
      loading_datetime: string; // ISO string
    }) => {
      // Use ONLY the new endpoint so ticket details are persisted.
      // POST /api/admin/orders/<id>/release/
      const url = `${ADMIN_BASE}/orders/${orderId}/release/`;

      const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data || {}),
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

    // Top Customers
    getTopCustomers: async () => {
      const response = await fetch(`${ADMIN_BASE}/top-customers/`, {
        headers: getHeaders(),
      });
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
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
      return response.json();
    },

    // All Orders (Admin View)
    getAllAdminOrders: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/all-orders/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Agents (Admin)
    adminListAgents: async (params?: { type?: 'general' | 'location'; location_id?: number; is_active?: boolean; search?: string; page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/agents/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          url.searchParams.append(key, String(value));
        });
      }
      const response = await fetch(url.toString(), {
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
      const response = await fetch(`${ADMIN_BASE}/agents/`, {
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
      const response = await fetch(`${ADMIN_BASE}/agents/${id}/`, {
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
      const response = await fetch(`${ADMIN_BASE}/agents/${id}/`, {
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
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
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
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
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

      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
      
      return response.json();
    },


    createProduct: async (data: {
      name: string;
      abbreviation: string;
      description: string;
      unit_price: number;
      stock_quantity: number;
    }) => {
      const response = await fetch(`${ADMIN_BASE}/products/`, {
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

    adminGetProducts: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/products/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await fetch(url.toString(), {
        headers: getHeaders()
      });
      return response.json();
    },

    updateStatePrice: async (updatedState: {
      id: number;
      products: { id: number; price: number }[];
    }) => {
      const response = await fetch(`${ADMIN_BASE}/states/${updatedState.id}/update-prices/`, {
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
      const response = await fetch(`${ADMIN_BASE}/state/${StatetId}/togglestatus/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    getProductById: async (productId: number) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        headers: getHeaders(),
      });
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
    //   const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
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

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      return response.json();
    },


    deleteProduct: async (productId: number) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return response.ok ? true : response.json();
    },

    // Customers
    getAllCustomers: async (params?: { page?: number; page_size?: number }) => {
      const url = new URL(`${ADMIN_BASE}/customers/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value.toString());
        });
      }
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
      return response.json();
    },

    getCustomerById: async (customerId: number) => {
      const response = await fetch(`${ADMIN_BASE}/customers/${customerId}/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    getFullCustomerDetails: async () => {
      const response = await fetch(`${ADMIN_BASE}/customers/full-details/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Payment Orders
    getPaymentOrders: async () => {
      const response = await fetch(`${ADMIN_BASE}/payment-orders/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    getBanks: async () => {
      const response = await fetch(`${ADMIN_BASE}/bank-accounts/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Order Status
    updateOrderStatus: async (data: { id: number; status: string }) => {
      const response = await fetch(`${ADMIN_BASE}/update-order-status/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update order status');
      }
      return response.json();
    },

    // Verify Orders
    getVerifyOrders: async (params?: { 
      search?: string; 
      page?: number; 
      page_size?: number 
    }) => {
      const url = new URL(`${ADMIN_BASE}/verify-orders/`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) url.searchParams.append(key, value.toString());
        });
      }
      const response = await fetch(url.toString(), {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Finance Overview
    getFinanceOverview: async () => {
      const response = await fetch(`${ADMIN_BASE}/finance-overview/`, {
        headers: getHeaders(),
      });
      return response.json();
    },

    // Notifications
    sendNotification: async (data: {
      emails: string[];
      type: string;
      project: { name: string };
    }) => {
      const response = await fetch(`${ADMIN_BASE}/send-notification/`, {
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
      const response = await fetch(`${ADMIN_BASE}/users/`, { headers: getHeaders() });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },

    updateUser: async (userId: number, data: Record<string, unknown>) => {
      const response = await fetch(`${ADMIN_BASE}/users/${userId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update user');
      return response.json();
    },

    adminUpdateProduct: async (productId: number, data: Record<string, unknown>) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      return response.json();
    },

    deleteUser: async (userId: number) => {
      const response = await fetch(`${ADMIN_BASE}/users/${userId}/`, {
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
      const response = await fetch(`${ADMIN_BASE}/offline-sales/`, {
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
      const response = await fetch(`${ADMIN_BASE}/offline-sales/`, {
        headers: getHeaders(),
      });
      return response.json();
    },
    
    deleteOfflineSale: async (id: string) => {
      const response = await fetch(`${ADMIN_BASE}/offline-sales/${id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      return response.ok ? true : response.json();
    },
    
  },
};
