const ADMIN_BASE = 'https://soroman-backend.vercel.app/api/admin';

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
    getAllAdminOrders: async () => {
      const response = await fetch(`${ADMIN_BASE}/all-orders/`);
      return response.json();
    },

    // Products CRUD
    adminGetProducts: async () => {
      const response = await fetch(`${ADMIN_BASE}/products/`);
      return response.json();
    },

    adminCreateProduct: async (data: any) => {
      const response = await fetch(`${ADMIN_BASE}/products/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
      });
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

    // Customers
    adminGetAllCustomers: async () => {
      const response = await fetch(`${ADMIN_BASE}/customers/`);
      return response.json();
    },

    adminGetCustomer: async (customerId: number) => {
      const response = await fetch(`${ADMIN_BASE}/customers/${customerId}/`);
      return response.json();
    }
  }
};