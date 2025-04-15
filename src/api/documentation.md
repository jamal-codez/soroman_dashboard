### 1. Soroman Backend API v1
**Base URL**: `/api/consumer/`

---

#### 1. Customer API
- **URL**: `/api/consumer/customer/`  
  **Method**: `POST`  
  **Description**: Create or fetch a customer based on phone number or email.  

  **Request Body**:
  ```json
  {
      "phone_number": "09012345678",
      "email": "example@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company_name": "Example Ltd"
  }
  ```

  **Response**:
  - **200 OK** (If customer exists):
    ```json
    {
        "id": 1,
        "first_name": "John",
        "last_name": "Doe",
        "company_name": "Example Ltd",
        "email": "example@example.com",
        "phone_number": "09012345678"
    }
    ```
  - **201 Created** (If customer is created):
    ```json
    {
        "id": 2,
        "first_name": "Jane",
        "last_name": "Smith",
        "company_name": "Tech Corp",
        "email": "jane@example.com",
        "phone_number": "09098765432"
    }
    ```

---

#### 2. New Order API
- **URL**: `/api/consumer/neworder/`  
  **Method**: `POST`  
  **Description**: Create a new order for a customer and optionally initialize payment.  

  **Request Body**:
  - For delivery orders:
    ```json
    {
        "customer_id": 1,
        "products": [
            {"product_id": 1, "quantity": 2},
            {"product_id": 2, "quantity": 1}
        ],
        "release_type": "delivery",
        "delivery_info": {
            "delivery_state_id": 1,
            "delivery_address": "123 Main Street",
            "delivery_date": "2023-10-01",
            "delivery_time": "10:00:00"
        },
        "channel_id": 1
    }
    ```
  - For pickup orders:
    ```json
    {
        "customer_id": 1,
        "products": [
            {"product_id": 1, "quantity": 2},
            {"product_id": 2, "quantity": 1}
        ],
        "release_type": "pickup",
        "pickup_info": {
            "depot_id": 1,
            "pickup_date": "2023-10-01",
            "pickup_time": "10:00:00"
        },
        "channel_id": 2,
        "bank_account": 1
    }
    ```

  **Response**:
  - **201 Created** (Order created successfully):
    ```json
    {
        "id": 1,
        "products": [
            {"product": 1, "quantity": 2, "price": 200.00},
            {"product": 2, "quantity": 1, "price": 100.00}
        ],
        "quantity": 3,
        "total_price": 350.00,
        "status": "pending",
        "release_status": "pending",
        "relase_type": "delivery",
        "user": 1,
        "created_at": "2023-10-01T10:00:00Z",
        "updated_at": "2023-10-01T10:00:00Z"
    }
    ```
  - **200 OK** (Payment initialized successfully):
    ```json
    {
        "id": 1,
        "order": 1,
        "payment_channel": 1,
        "reference": "PAYSTACK_REF_12345",
        "status": "PENDING"
    }
    ```

---

#### 3. States API
- **URL**: `/api/consumer/states/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all states.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {"id": 1, "name": "Lagos", "abbreviation": "LA", "price": 50.00},
        {"id": 2, "name": "Abuja", "abbreviation": "AB", "price": 70.00}
    ]
    ```

---

#### 4. Products API
- **URL**: `/api/consumer/products/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all products.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {
            "id": 1,
            "name": "Product A",
            "abbreviation": "PA",
            "description": "Description of Product A",
            "unit_price": 100.00,
            "stock_quantity": 50,
            "created_at": "2023-09-30T10:00:00Z"
        },
        {
            "id": 2,
            "name": "Product B",
            "abbreviation": "PB",
            "description": "Description of Product B",
            "unit_price": 150.00,
            "stock_quantity": 30,
            "created_at": "2023-09-30T10:00:00Z"
        }
    ]
    ```

---

#### 5. All Customers API
- **URL**: `/api/consumer/allcustomers/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all customers.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {
            "id": 1,
            "first_name": "John",
            "last_name": "Doe",
            "email": "example@example.com",
            "phone_number": "09012345678",
            "company_name": "Example Ltd"
        },
        {
            "id": 2,
            "first_name": "Jane",
            "last_name": "Smith",
            "email": "jane@example.com",
            "phone_number": "09098765432",
            "company_name": "Tech Corp"
        }
    ]
    ```

---

#### 6. All Orders API
- **URL**: `/api/consumer/allorders/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all orders.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {
            "id": 1,
            "total_price": 350.00,
            "status": "pending",
            "created_at": "2023-10-01T10:00:00Z"
        },
        {
            "id": 2,
            "total_price": 200.00,
            "status": "completed",
            "created_at": "2023-10-02T10:00:00Z"
        }
    ]
    ```

---

#### 7. Nigeria States API
- **URL**: `/api/consumer/nigeria-states/`  
  **Method**: `POST`  
  **Description**: Create a new state in Nigeria.  

  **Request Body**:
  ```json
  {
      "name": "Lagos",
      "abbreviation": "LA",
      "price": 50.00
  }
  ```

  **Response**:
  - **201 Created**:
    ```json
    {
        "id": 1,
        "name": "Lagos",
        "abbreviation": "LA",
        "price": 50.00
    }
    ```

---

#### 8. Payment Channels API
- **URL**: `/api/consumer\`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all active payment channels.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {
            "id": 1,
            "name": "Paystack",
            "public_key":"sk_jemee...",
            "status": "ACTIVE"
        },
        {
            "id": 2,
            "name": "Remita",
            "public_key":"sk_jemee...",
            "status": "ACTIVE"
        }
    ]
    ```

---

#### 9. Bank Accounts API
- **URL**: `/api/consumer/bank-accounts/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all bank accounts.  

  **Response**:
  - **200 OK**:
    ```json
    [
        {
            "id": 1,
            "bank_name": "First Bank",
            "acct_no": "1234567890",
            "status": "ACTIVE"
        },
        {
            "id": 2,
            "bank_name": "GTBank",
            "acct_no": "0987654321",
            "status": "ACTIVE"
        }
    ]
    ```

---

### Administration API Endpoints

#### 1. Analytics API
- **URL**: `/api/admin/analytics/`  
  **Method**: `GET`  
  **Description**: Retrieve analytics data for orders, sales, and customers.  

  **Response**:
  ```json
  {
      "orders": 100,
      "orders_change": 10.0,
      "sales_revenue": 5000.00,
      "sales_revenue_change": 5.0,
      "quantity_sold": [
          {"product_name": "Product A", "current_quantity": 50, "change": 10.0}
      ],
      "active_customers": 20,
      "active_customers_change": 5.0
  }
  ```

---

#### 2. Product Inventory API
- **URL**: `/api/admin/product-inventory/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all products in inventory.  

  **Response**:
  ```json
  [
      {
          "id": 1,
          "name": "Product A",
          "unit_price": 100.00,
          "stock_quantity": 50
      },
      {
          "id": 2,
          "name": "Product B",
          "unit_price": 150.00,
          "stock_quantity": 30
      }
  ]
  ```

---

#### 3. Sales Overview API
- **URL**: `/api/admin/sales-overview/`  
  **Method**: `GET`  
  **Description**: Retrieve total sales for each product grouped by month.  

  **Response**:
  ```json
  {
      "Product A": {
          "1": 2000.00,
          "2": 1000.00,
          "3": 0
      },
      "Product B": {
          "1": 3000.00,
          "2": 2500.00,
          "3": 0
      }
  }
  ```

---

#### 4. Recent Orders API
- **URL**: `/api/admin/recent-orders/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of orders created in the last 30 days.  

  **Response**:
  ```json
  [
      {
          "id": 1,
          "total_price": 350.00,
          "status": "pending",
          "created_at": "2023-10-01T10:00:00Z"
      },
      {
          "id": 2,
          "total_price": 200.00,
          "status": "completed",
          "created_at": "2023-10-02T10:00:00Z"
      }
  ]
  ```

---

#### 5. Top Customers API
- **URL**: `/api/admin/top-customers/`  
  **Method**: `GET`  
  **Description**: Retrieve the top 10 customers based on the highest number of paid orders.  

  **Response**:
  ```json
  [
      {
          "id": 1,
          "first_name": "John",
          "last_name": "Doe",
          "email": "example@example.com",
          "paid_orders_count": 15
      },
      {
          "id": 2,
          "first_name": "Jane",
          "last_name": "Smith",
          "email": "jane@example.com",
          "paid_orders_count": 10
      }
  ]
  ```

---

#### 6. All Orders API
- **URL**: `/api/admin/all-orders/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all orders.  

  **Response**:
  ```json
  [
      {
          "id": 1,
          "total_price": 350.00,
          "status": "pending",
          "created_at": "2023-10-01T10:00:00Z"
      },
      {
          "id": 2,
          "total_price": 200.00,
          "status": "completed",
          "created_at": "2023-10-02T10:00:00Z"
      }
  ]
  ```

---

#### 7. Products API
- **URL**: `/api/admin/products/`  
  **Method**: `GET`, `POST`  
  **Description**: Retrieve a list of all products or create a new product.  

  **Request Body (for POST)**:
  ```json
  {
      "name": "Product A",
      "abbreviation": "PA",
      "description": "Description of Product A",
      "unit_price": 100.00,
      "stock_quantity": 50
  }
  ```

  **Response (for GET)**:
  ```json
  [
      {
          "id": 1,
          "name": "Product A",
          "abbreviation": "PA",
          "description": "Description of Product A",
          "unit_price": 100.00,
          "stock_quantity": 50,
          "created_at": "2023-09-30T10:00:00Z"
      },
      {
          "id": 2,
          "name": "Product B",
          "abbreviation": "PB",
          "description": "Description of Product B",
          "unit_price": 150.00,
          "stock_quantity": 30,
          "created_at": "2023-09-30T10:00:00Z"
      }
  ]
  ```

  **Response (for POST)**:
  ```json
  {
      "id": 1,
      "name": "Product A",
      "abbreviation": "PA",
      "description": "Description of Product A",
      "unit_price": 100.00,
      "stock_quantity": 50
  }
  ```

- **URL**: `/api/admin/products/<int:pk>/`  
  **Method**: `GET`, `PUT`, `DELETE`  
  **Description**: Retrieve, update, or delete a product by ID.  

---

#### 8. Customers API
- **URL**: `/api/admin/customers/`  
  **Method**: `GET`  
  **Description**: Retrieve a list of all customers.  

  **Response**:
  ```json
  [
      {
          "id": 1,
          "first_name": "John",
          "last_name": "Doe",
          "email": "example@example.com",
          "phone_number": "09012345678"
      },
      {
          "id": 2,
          "first_name": "Jane",
          "last_name": "Smith",
          "email": "jane@example.com",
          "phone_number": "09098765432"
      }
  ]
  ```

- **URL**: `/api/admin/customers/<int:pk>/`  
  **Method**: `GET`  
  **Description**: Retrieve a specific customer by ID.  

  **Response**:
  ```json
  {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "example@example.com",
      "phone_number": "09012345678"
  }
  ```