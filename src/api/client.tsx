const ADMIN_BASE = 'https://api.ordersoroman.com/api/admin';

export const apiClient = {
  admin: {
    // Analytics
    getAnalytics: async () => {
      const response = await fetch(`${ADMIN_BASE}/analytics/`);
      return response.json();
    },

    // Product Inventory
    getProductInventory: async () => {
      const response = await fetch(`${ADMIN_BASE}/product-inventory/`);
      return response.json();
    },

    // Sales Overview
    getSalesOverview: async () => {
      const response = await fetch(`${ADMIN_BASE}/sales-overview/`);
      return response.json();
    },

    // Recent Orders
    getRecentOrders: async () => {
      const response = await fetch(`${ADMIN_BASE}/recent-orders/`);
      return response.json();
    },

    // Top Customers
    getTopCustomers: async () => {
      const response = await fetch(`${ADMIN_BASE}/top-customers/`);
      return response.json();
    },

    // All Orders (Admin View)
      getAllAdminOrders: async (params?: { page?: number; page_size?: number }) => {
        const url = new URL(`${ADMIN_BASE}/all-orders/`);
        if (params) {
          url.searchParams.append('page', params.page?.toString() || '1');
          url.searchParams.append('page_size', params.page_size?.toString() || '10');
        }
        const response = await fetch(url.toString());
        return response.json();
      },
    // Products CRUD
      adminGetProducts: async (params?: { page?: number; page_size?: number }) => {
        const url = new URL(`${ADMIN_BASE}/products/`);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value.toString());
          });
        }
        const response = await fetch(url.toString());
        return response.json();
      },
    // In client.tsx - Update the adminCreateProduct method
    adminCreateProduct: async (data: any) => {
      const response = await fetch(`${ADMIN_BASE}/products/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add authorization header if required
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create product');
      }
      
      return response.json();
    },

    adminGetProduct: async (productId: number) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`);
      return response.json();
    },

    adminUpdateProduct: async (productId: number, data: any) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
      });
      return response.json();
    },

    adminDeleteProduct: async (productId: number) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'DELETE',
      });
      return response.ok ? true : response.json();
    },

    updateProductPrice: async (productId: number, data: { unit_price: number }) => {
      const response = await fetch(`${ADMIN_BASE}/products/${productId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${localStorage.getItem('token')}` // Ensure token is included if required
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update product');
      }

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
      const response = await fetch(url.toString());
      return response.json();
    },

    adminGetCustomer: async (customerId: number) => {
      const response = await fetch(`${ADMIN_BASE}/customers/${customerId}/`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch customer');
      }
      return response.json();
    }
  }
};
