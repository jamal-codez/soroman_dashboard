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
    
    toggleStateStatus: async (StatetId: String) => {
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

    updateProduct: async (productId: number, data: {
      name: string;
      abbreviation: string;
      description: string;
      unit_price: number;
      stock_quantity: number;
      initial_stock_quantity: number;
    }) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
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

    updateUser: async (userId: number, data: any) => {
      const response = await fetch(`${ADMIN_BASE}/users/${userId}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update user');
      return response.json();
    },

    adminUpdateProduct: async (productId: number, data: any) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PUT',
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
  },
};