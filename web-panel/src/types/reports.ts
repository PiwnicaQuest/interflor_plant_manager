// Extended Report Types for PlantManager

// Employee Reports
export interface EmployeeSales {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  ordersCount: number;
  totalGross: number;
  totalNet: number;
  avgOrderValue: number;
  percentShare: number;
}

export interface EmployeeDailySales {
  date: string;
  userId: number;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalGross: number;
}

// Customer Reports
export interface CustomerSales {
  customerId: number;
  companyName: string;
  firstName: string;
  lastName: string;
  city: string;
  ordersCount: number;
  totalGross: number;
  totalNet: number;
  avgOrderValue: number;
  lastOrderDate: string;
}

export interface CustomerStats {
  newCustomers: number;
  returningCustomers: number;
  totalCustomers: number;
}

// Document Type Reports
export interface DocumentTypeStats {
  documentType: string;
  count: number;
  totalGross: number;
  totalNet: number;
  totalVat: number;
}

export interface DocumentDailyStats {
  date: string;
  invoices: number;
  invoicesTotal: number;
  proformas: number;
  proformasTotal: number;
  receipts: number;
  receiptsTotal: number;
}

// Payment Reports
export interface PaymentStats {
  status: string;
  count: number;
  totalAmount: number;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  totalAmount: number;
}

export interface PaymentMethodStats {
  method: string;
  count: number;
  totalAmount: number;
}

export interface OverdueInvoice {
  id: number;
  invoiceNumber: string;
  issueDate: string;
  paymentDeadline: string;
  totalGross: number;
  paidAmount: number;
  amountDue: number;
  daysOverdue: number;
  customerName: string;
  customerId: number;
}

// Product Category Reports
export interface CategorySales {
  category: string;
  productsCount: number;
  quantitySold: number;
  totalGross: number;
  totalNet: number;
}

export interface MonthlySalesTrend {
  month: string;
  ordersCount: number;
  totalGross: number;
  totalNet: number;
}

// KPI Dashboard
export interface KPIData {
  current: {
    ordersCount: number;
    totalGross: number;
    customersCount: number;
    avgOrderValue: number;
  };
  previous: {
    ordersCount: number;
    totalGross: number;
    customersCount: number;
    avgOrderValue: number;
  };
  changes: {
    ordersCount: number;
    totalGross: number;
    customersCount: number;
  };
  periodDays: number;
  previousPeriod: {
    start: string;
    end: string;
  };
}
