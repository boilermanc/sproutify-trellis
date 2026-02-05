import { createClient } from '@supabase/supabase-js';
import { SpokeConnection, SpokeTableConfig, NormalizedSpokeProfile, EnrichedProfile, ProfileOrderStats, ProductPurchase, ProfileAddress } from './types';
import { loadNameCache, predictDemographicsSync } from './demographicsService';

type TestConnectionInput = {
  supabase_url: string;
  supabase_key: string;
  table_name: string;
};

type TestConnectionResult =
  | { success: true; rowCount: number; columns: string[] }
  | { success: false; error: string };

// Re-export for backwards compatibility
export type { NormalizedSpokeProfile, EnrichedProfile, ProfileOrderStats } from './types';

export interface NormalizedOrder {
  id: string;
  order_number?: string;
  customer_id?: string;
  guest_email?: string;
  billing_email?: string;
  billing_first_name?: string;
  billing_last_name?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  tax?: number;
  paid_at?: string;
  created_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  billing_address?: ProfileAddress;
  shipping_address?: ProfileAddress;
  _spoke_id: string;
  _spoke_name: string;
  _source_table?: string;  // Track which table the order came from
}

export interface NormalizedOrderItem {
  id: string;
  order_id: string;
  product_name?: string;
  product_price?: number;
  quantity?: number;
  line_total?: number;
  _spoke_id: string;
  _spoke_name: string;
}

export interface NormalizedSubscription {
  id: string;
  customer_id?: string;
  email?: string;
  status?: string;
  plan?: string;
  started_at?: string;
  expires_at?: string;
  created_at?: string;
  _spoke_id: string;
  _spoke_name: string;
}

export async function testSpokeConnection(
  connection: TestConnectionInput
): Promise<TestConnectionResult> {
  try {
    const client = createClient(connection.supabase_url, connection.supabase_key);

    const { data, error, count } = await client
      .from(connection.table_name)
      .select('*', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      return { success: false, error: error.message };
    }

    // Extract column names from the first row of data
    const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

    return { success: true, rowCount: count ?? data?.length ?? 0, columns };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

export const discoverTables = async (
  supabase_url: string,
  supabase_key: string
): Promise<{ tables: string[]; error?: string }> => {
  try {
    const client = createClient(supabase_url, supabase_key);

    const commonTables = [
      'customers', 'profiles', 'users',
      'orders', 'order_items', 'legacy_orders', 'legacy_order_items',
      'subscriptions', 'payments', 'products'
    ];
    const foundTables: string[] = [];

    for (const tableName of commonTables) {
      try {
        const response = await client
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        // Only add tables that return status 200 (actual data)
        // Status 204 means "No Content" which Supabase returns for non-existent tables
        if (response.status === 200) {
          foundTables.push(tableName);
        }
      } catch {
        // Table doesn't exist or no access, skip silently
      }
    }

    return { tables: foundTables };
  } catch (err) {
    return { tables: [], error: err instanceof Error ? err.message : 'Discovery failed' };
  }
};

export const autoMapFields = (
  columns: string[],
  tableType: 'customers' | 'orders' | 'order_items' | 'subscriptions'
): Record<string, string> => {
  const patterns: Record<string, Record<string, string[]>> = {
    customers: {
      id: ['id', 'customer_id', 'user_id', 'uuid'],
      email: ['email', 'e_mail', 'email_address', 'user_email'],
      first_name: ['first_name', 'firstname', 'fname', 'given_name'],
      last_name: ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
      phone: ['phone', 'phone_number', 'mobile', 'cell', 'telephone'],
      subscribed: ['subscribed', 'is_subscribed', 'newsletter_subscribed', 'opted_in', 'newsletter'],
      created_at: ['created_at', 'created', 'createdat', 'signup_date', 'registered_at'],
    },
    orders: {
      id: ['id', 'order_id', 'uuid'],
      order_number: ['order_number', 'ordernumber', 'number', 'order_no'],
      customer_id: ['customer_id', 'customerid', 'user_id', 'userid'],
      guest_email: ['guest_email', 'email', 'guest_mail', 'billing_email'],
      billing_email: ['billing_email', 'guest_email', 'email'],
      billing_first_name: ['billing_first_name', 'first_name', 'firstname', 'billing_fname'],
      billing_last_name: ['billing_last_name', 'last_name', 'lastname', 'billing_lname'],
      status: ['status', 'order_status', 'state'],
      total: ['total', 'order_total', 'grand_total', 'amount'],
      subtotal: ['subtotal', 'sub_total'],
      tax: ['tax', 'tax_amount', 'sales_tax'],
      paid_at: ['paid_at', 'payment_date', 'paid_date'],
      created_at: ['created_at', 'created', 'order_date', 'date'],
      shipped_at: ['shipped_at', 'ship_date', 'shipping_date'],
      delivered_at: ['delivered_at', 'delivery_date'],
      billing_address: ['billing_address', 'billing_street', 'bill_address', 'address'],
      billing_city: ['billing_city', 'bill_city', 'city'],
      billing_state: ['billing_state', 'bill_state', 'state', 'region', 'province'],
      billing_zip: ['billing_zip', 'billing_postal', 'bill_zip', 'zip', 'postal_code', 'postcode'],
      shipping_address: ['shipping_address', 'ship_address', 'delivery_address'],
      shipping_city: ['shipping_city', 'ship_city', 'delivery_city'],
      shipping_state: ['shipping_state', 'ship_state', 'delivery_state'],
      shipping_zip: ['shipping_zip', 'shipping_postal', 'ship_zip', 'delivery_zip'],
    },
    order_items: {
      id: ['id', 'item_id', 'line_id'],
      order_id: ['order_id', 'legacy_order_id', 'orderid'],
      product_name: ['product_name', 'name', 'item_name', 'title', 'product'],
      product_price: ['product_price', 'price', 'unit_price'],
      quantity: ['quantity', 'qty', 'amount'],
      line_total: ['line_total', 'total', 'subtotal', 'item_total', 'price'],
    },
    subscriptions: {
      id: ['id', 'subscription_id'],
      customer_id: ['customer_id', 'user_id', 'customerid'],
      email: ['email', 'user_email'],
      status: ['status', 'subscription_status', 'state'],
      plan: ['plan', 'plan_name', 'tier', 'subscription_tier'],
      started_at: ['started_at', 'start_date', 'subscribed_at'],
      expires_at: ['expires_at', 'expiry_date', 'end_date', 'subscription_expires_at'],
      created_at: ['created_at', 'created'],
    },
  };

  const mapping: Record<string, string> = {};
  const tablePatterns = patterns[tableType] || {};

  for (const [field, possibleNames] of Object.entries(tablePatterns)) {
    const match = columns.find(col =>
      possibleNames.includes(col.toLowerCase())
    );
    if (match) {
      mapping[field] = match;
    }
  }

  return mapping;
};

export async function fetchSpokeProfiles(
  connection: SpokeConnection
): Promise<NormalizedSpokeProfile[]> {
  // Find the customers table config
  const tableConfig = connection.tables.find(t => t.table_type === 'customers' && t.enabled);
  if (!tableConfig) return [];

  try {
    const client = createClient(connection.supabase_url, connection.supabase_key);

    // Build the select string from field_mapping
    const fieldMapping = tableConfig.field_mapping;
    const fields = Object.values(fieldMapping).filter(Boolean);
    const selectString = fields.join(',');

    const { data, error } = await client
      .from(tableConfig.table_name)
      .select(selectString)
      .limit(1000);

    if (error) {
      // Provide a more descriptive error message
      let errorMessage = `${connection.name}: ${error.message}`;

      // Check for common error patterns and add helpful hints
      if (error.message.includes('does not exist')) {
        errorMessage += ' - check your field mapping or table name';
      } else if (error.message.includes('permission denied') || error.message.includes('not authorized')) {
        errorMessage += ' - check your API key permissions';
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        errorMessage += ' - table not found, verify the table name';
      }

      console.error(`Error fetching from spoke ${connection.name}:`, error.message);
      throw new Error(errorMessage);
    }

    if (!data) {
      return [];
    }

    // Normalize the data to our standard profile shape
    const mapping = fieldMapping;
    return data.map((row: Record<string, unknown>) => {
      const profile: NormalizedSpokeProfile = {
        email: String(row[mapping.email] ?? ''),
        _spoke_id: connection.id,
        _spoke_name: connection.name,
      };

      // Include id if mapped (needed for order linking)
      if (mapping.id && row[mapping.id] !== undefined) {
        profile.id = String(row[mapping.id]);
      }

      if (mapping.first_name && row[mapping.first_name] !== undefined) {
        profile.first_name = String(row[mapping.first_name]);
      }

      if (mapping.last_name && row[mapping.last_name] !== undefined) {
        profile.last_name = String(row[mapping.last_name]);
      }

      if (mapping.phone && row[mapping.phone] !== undefined) {
        profile.phone = String(row[mapping.phone]);
      }

      if (mapping.subscribed && row[mapping.subscribed] !== undefined) {
        profile.subscribed = Boolean(row[mapping.subscribed]);
      }

      if (mapping.created_at && row[mapping.created_at] !== undefined) {
        profile.created_at = String(row[mapping.created_at]);
      }

      return profile;
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error fetching from spoke ${connection.name}:`, errorMessage);

    // Re-throw with spoke name context if not already included
    if (errorMessage.startsWith(connection.name)) {
      throw err;
    }
    throw new Error(`${connection.name}: ${errorMessage}`);
  }
}

export interface FetchAllSpokesResult {
  profiles: NormalizedSpokeProfile[];
  errors: string[];
}

export async function fetchAllSpokesProfiles(
  connections: SpokeConnection[]
): Promise<FetchAllSpokesResult> {
  // Filter to only active connections with customers table enabled
  const activeConnections = connections.filter(c =>
    c.status === 'active' &&
    c.tables.some(t => t.table_type === 'customers' && t.enabled)
  );

  // Fetch from all spokes in parallel, using allSettled to handle partial failures
  const results = await Promise.allSettled(
    activeConnections.map((connection) => fetchSpokeProfiles(connection))
  );

  const profiles: NormalizedSpokeProfile[] = [];
  const errors: string[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      profiles.push(...result.value);
    } else {
      errors.push(result.reason?.message || 'Unknown error');
    }
  });

  return { profiles, errors };
}

// Orders fetching - supports multiple order tables (e.g., 'orders' + 'legacy_orders')
export const fetchSpokeOrders = async (
  connection: SpokeConnection
): Promise<NormalizedOrder[]> => {
  // Find ALL enabled order tables (could be 'orders', 'legacy_orders', etc.)
  const orderTableConfigs = connection.tables.filter(
    t => t.table_type === 'orders' && t.enabled
  );

  if (orderTableConfigs.length === 0) return [];

  const allOrders: NormalizedOrder[] = [];

  for (const tableConfig of orderTableConfigs) {
    try {
      const client = createClient(connection.supabase_url, connection.supabase_key);

      // Build select string from field mapping
      const fields = Object.values(tableConfig.field_mapping).filter(Boolean);
      const selectString = fields.join(',');

      const { data, error } = await client
        .from(tableConfig.table_name)
        .select(selectString)
        .limit(1000);

      if (error) {
        console.error(`Error fetching from ${tableConfig.table_name}:`, error.message);
        continue; // Skip this table but continue with others
      }

      if (!data) continue;

      // Normalize the data
      const mapping = tableConfig.field_mapping;
      const normalized = data.map((row: any) => ({
        id: row[mapping.id] || '',
        order_number: row[mapping.order_number],
        customer_id: row[mapping.customer_id],
        guest_email: row[mapping.guest_email] || row[mapping.billing_email],
        billing_email: row[mapping.billing_email] || row[mapping.guest_email],
        billing_first_name: row[mapping.billing_first_name],
        billing_last_name: row[mapping.billing_last_name],
        status: row[mapping.status],
        total: row[mapping.total] ? parseFloat(row[mapping.total]) : undefined,
        subtotal: row[mapping.subtotal] ? parseFloat(row[mapping.subtotal]) : undefined,
        tax: row[mapping.tax] ? parseFloat(row[mapping.tax]) : undefined,
        paid_at: row[mapping.paid_at],
        created_at: row[mapping.created_at],
        shipped_at: row[mapping.shipped_at],
        delivered_at: row[mapping.delivered_at],
        // Address fields
        billing_address: (mapping.billing_address || mapping.billing_city || mapping.billing_state || mapping.billing_zip) ? {
          address: row[mapping.billing_address],
          city: row[mapping.billing_city],
          state: row[mapping.billing_state],
          zip: row[mapping.billing_zip],
        } : undefined,
        shipping_address: (mapping.shipping_address || mapping.shipping_city || mapping.shipping_state || mapping.shipping_zip) ? {
          address: row[mapping.shipping_address],
          city: row[mapping.shipping_city],
          state: row[mapping.shipping_state],
          zip: row[mapping.shipping_zip],
        } : undefined,
        _spoke_id: connection.id,
        _spoke_name: connection.name,
        _source_table: tableConfig.table_name, // Track which table this came from
      }));

      allOrders.push(...normalized);
    } catch (err) {
      console.error(`Error fetching orders from ${tableConfig.table_name}:`, err);
    }
  }

  return allOrders;
};

export interface FetchAllSpokesOrdersResult {
  orders: NormalizedOrder[];
  errors: string[];
}

export const fetchAllSpokesOrders = async (
  connections: SpokeConnection[]
): Promise<FetchAllSpokesOrdersResult> => {
  const activeConnections = connections.filter(c =>
    c.status === 'active' &&
    c.tables.some(t => t.table_type === 'orders' && t.enabled)
  );

  const results = await Promise.allSettled(
    activeConnections.map(conn => fetchSpokeOrders(conn))
  );

  const orders: NormalizedOrder[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      orders.push(...result.value);
    } else {
      errors.push(`${activeConnections[index].name}: ${result.reason}`);
    }
  });

  return { orders, errors };
};

// Order items fetching - supports multiple order_items tables
export const fetchSpokeOrderItems = async (
  connection: SpokeConnection
): Promise<NormalizedOrderItem[]> => {
  // Find ALL enabled order_items tables
  const itemTableConfigs = connection.tables.filter(
    t => t.table_type === 'order_items' && t.enabled
  );

  if (itemTableConfigs.length === 0) return [];

  const allItems: NormalizedOrderItem[] = [];

  for (const tableConfig of itemTableConfigs) {
    try {
      const client = createClient(connection.supabase_url, connection.supabase_key);

      const fields = Object.values(tableConfig.field_mapping).filter(Boolean);
      const selectString = fields.join(',');

      const { data, error } = await client
        .from(tableConfig.table_name)
        .select(selectString)
        .limit(5000);

      if (error) {
        console.error(`Error fetching from ${tableConfig.table_name}:`, error.message);
        continue;
      }

      if (!data) continue;

      const mapping = tableConfig.field_mapping;
      const normalized = data.map((row: any) => ({
        id: row[mapping.id] || '',
        order_id: row[mapping.order_id] || '',
        product_name: row[mapping.product_name],
        product_price: row[mapping.product_price] ? parseFloat(row[mapping.product_price]) : undefined,
        quantity: row[mapping.quantity] ? parseInt(row[mapping.quantity]) : undefined,
        line_total: row[mapping.line_total] ? parseFloat(row[mapping.line_total]) : undefined,
        _spoke_id: connection.id,
        _spoke_name: connection.name,
      }));

      allItems.push(...normalized);
    } catch (err) {
      console.error(`Error fetching order items from ${tableConfig.table_name}:`, err);
    }
  }

  return allItems;
};

export interface FetchAllSpokesOrderItemsResult {
  items: NormalizedOrderItem[];
  errors: string[];
}

export const fetchAllSpokesOrderItems = async (
  connections: SpokeConnection[]
): Promise<FetchAllSpokesOrderItemsResult> => {
  const activeConnections = connections.filter(c =>
    c.status === 'active' &&
    c.tables?.some(t => t.table_type === 'order_items' && t.enabled)
  );

  const results = await Promise.allSettled(
    activeConnections.map(conn => fetchSpokeOrderItems(conn))
  );

  const items: NormalizedOrderItem[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      errors.push(`${activeConnections[index].name}: ${result.reason}`);
    }
  });

  return { items, errors };
};

// Subscriptions fetching
export const fetchSpokeSubscriptions = async (
  connection: SpokeConnection
): Promise<NormalizedSubscription[]> => {
  const tableConfig = connection.tables.find(t => t.table_type === 'subscriptions' && t.enabled);
  if (!tableConfig) return [];

  try {
    const client = createClient(connection.supabase_url, connection.supabase_key);

    // Build select string from field mapping
    const fields = Object.values(tableConfig.field_mapping).filter(Boolean);
    const selectString = fields.join(',');

    const { data, error } = await client
      .from(tableConfig.table_name)
      .select(selectString)
      .limit(1000);

    if (error) throw new Error(error.message);
    if (!data) return [];

    // Normalize the data
    const mapping = tableConfig.field_mapping;
    return data.map((row: any) => ({
      id: row[mapping.id] || '',
      customer_id: row[mapping.customer_id],
      email: row[mapping.email],
      status: row[mapping.status],
      plan: row[mapping.plan],
      started_at: row[mapping.started_at],
      expires_at: row[mapping.expires_at],
      created_at: row[mapping.created_at],
      _spoke_id: connection.id,
      _spoke_name: connection.name,
    }));
  } catch (err) {
    console.error(`Error fetching subscriptions from ${connection.name}:`, err);
    return [];
  }
};

export interface FetchAllSpokesSubscriptionsResult {
  subscriptions: NormalizedSubscription[];
  errors: string[];
}

export const fetchAllSpokesSubscriptions = async (
  connections: SpokeConnection[]
): Promise<FetchAllSpokesSubscriptionsResult> => {
  const activeConnections = connections.filter(c =>
    c.status === 'active' &&
    c.tables.some(t => t.table_type === 'subscriptions' && t.enabled)
  );

  const results = await Promise.allSettled(
    activeConnections.map(conn => fetchSpokeSubscriptions(conn))
  );

  const subscriptions: NormalizedSubscription[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      subscriptions.push(...result.value);
    } else {
      errors.push(`${activeConnections[index].name}: ${result.reason}`);
    }
  });

  return { subscriptions, errors };
};

// Profile enrichment with order intelligence
export const enrichProfilesWithOrders = (
  profiles: NormalizedSpokeProfile[],
  orders: NormalizedOrder[],
  orderItems?: NormalizedOrderItem[]
): EnrichedProfile[] => {
  // Group orders by customer_id and spoke
  const ordersByCustomer = new Map<string, NormalizedOrder[]>();

  for (const order of orders) {
    // Create a composite key: spoke_id + customer_id
    // This ensures we only match within the same spoke
    if (order.customer_id) {
      const key = `${order._spoke_id}:${order.customer_id}`;
      const existing = ordersByCustomer.get(key) || [];
      existing.push(order);
      ordersByCustomer.set(key, existing);
    }

    // Also index by guest_email for guest checkouts
    if (order.guest_email) {
      const key = `${order._spoke_id}:email:${order.guest_email.toLowerCase()}`;
      const existing = ordersByCustomer.get(key) || [];
      existing.push(order);
      ordersByCustomer.set(key, existing);
    }
  }

  // Group order items by order_id for quick lookup
  const itemsByOrderId = new Map<string, NormalizedOrderItem[]>();
  if (orderItems) {
    for (const item of orderItems) {
      const key = `${item._spoke_id}:${item.order_id}`;
      const existing = itemsByOrderId.get(key) || [];
      existing.push(item);
      itemsByOrderId.set(key, existing);
    }
  }

  // Enrich each profile
  return profiles.map(profile => {
    let customerOrders: NormalizedOrder[] = [];

    // Try to find orders by customer_id first (if profile has an id)
    if (profile.id) {
      const customerIdKey = `${profile._spoke_id}:${profile.id}`;
      customerOrders = ordersByCustomer.get(customerIdKey) || [];
    }

    // If no orders found by ID, try by email
    if (customerOrders.length === 0 && profile.email) {
      const emailKey = `${profile._spoke_id}:email:${profile.email.toLowerCase()}`;
      customerOrders = ordersByCustomer.get(emailKey) || [];
    }

    // Calculate stats if orders exist
    if (customerOrders.length === 0) {
      return profile as EnrichedProfile;
    }

    const ltv = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderDates = customerOrders
      .map(o => o.created_at)
      .filter(Boolean)
      .sort();

    // Build products_purchased from order items
    let products_purchased: ProductPurchase[] | undefined;
    if (orderItems && orderItems.length > 0) {
      const productMap = new Map<string, ProductPurchase>();

      for (const order of customerOrders) {
        const itemKey = `${order._spoke_id}:${order.id}`;
        const items = itemsByOrderId.get(itemKey) || [];

        for (const item of items) {
          if (!item.product_name) continue;

          const existing = productMap.get(item.product_name);
          if (existing) {
            existing.total_quantity += item.quantity || 1;
            existing.total_spent += item.line_total || 0;
            // Update last_purchased_at if this order is more recent
            if (order.created_at && (!existing.last_purchased_at || order.created_at > existing.last_purchased_at)) {
              existing.last_purchased_at = order.created_at;
            }
          } else {
            productMap.set(item.product_name, {
              product_name: item.product_name,
              total_quantity: item.quantity || 1,
              total_spent: item.line_total || 0,
              last_purchased_at: order.created_at,
            });
          }
        }
      }

      if (productMap.size > 0) {
        // Sort by total_spent descending
        products_purchased = Array.from(productMap.values())
          .sort((a, b) => b.total_spent - a.total_spent);
      }
    }

    const order_stats: ProfileOrderStats = {
      ltv,
      order_count: customerOrders.length,
      first_purchase_at: orderDates[0],
      last_purchase_at: orderDates[orderDates.length - 1],
      avg_order_value: ltv / customerOrders.length,
      products_purchased,
    };

    // Find most recent order with address data
    const ordersWithAddress = customerOrders
      .filter(o => o.billing_address?.city || o.shipping_address?.city)
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Most recent first
      });

    const mostRecentWithAddress = ordersWithAddress[0];

    return {
      ...profile,
      order_stats,
      // Add address from most recent order if profile doesn't have one
      billing_address: profile.billing_address || mostRecentWithAddress?.billing_address,
      shipping_address: profile.shipping_address || mostRecentWithAddress?.shipping_address,
    } as EnrichedProfile;
  });
};

// Extract unique customer identities from orders (for order-only customers)
interface OrderIdentity {
  email: string;
  first_name?: string;
  last_name?: string;
  order_count: number;
  total_spent: number;
  first_order_date?: string;
  last_order_date?: string;
  spoke_id: string;
  spoke_name: string;
  source_table?: string;
}

const extractOrderIdentities = (orders: NormalizedOrder[]): Map<string, OrderIdentity> => {
  const identities = new Map<string, OrderIdentity>();

  for (const order of orders) {
    // Get email from billing_email or guest_email
    const email = (order.billing_email || order.guest_email || '').toLowerCase().trim();
    if (!email) continue;

    // Create composite key: spoke_id + lowercase email
    const key = `${order._spoke_id}:${email}`;

    const existing = identities.get(key);
    const orderDate = order.created_at || order.paid_at;
    const orderTotal = order.total || 0;

    if (existing) {
      // Update existing identity
      existing.order_count += 1;
      existing.total_spent += orderTotal;

      if (orderDate) {
        if (!existing.first_order_date || orderDate < existing.first_order_date) {
          existing.first_order_date = orderDate;
        }
        if (!existing.last_order_date || orderDate > existing.last_order_date) {
          existing.last_order_date = orderDate;
        }
      }

      // Update name if we don't have it yet
      if (!existing.first_name && order.billing_first_name) {
        existing.first_name = order.billing_first_name;
      }
      if (!existing.last_name && order.billing_last_name) {
        existing.last_name = order.billing_last_name;
      }
    } else {
      // Create new identity
      identities.set(key, {
        email,
        first_name: order.billing_first_name,
        last_name: order.billing_last_name,
        order_count: 1,
        total_spent: orderTotal,
        first_order_date: orderDate,
        last_order_date: orderDate,
        spoke_id: order._spoke_id,
        spoke_name: order._spoke_name,
        source_table: order._source_table,
      });
    }
  }

  return identities;
};

// Generate a deterministic ID from email
const generateIdFromEmail = (email: string, spokeId: string): string => {
  // Simple hash-like ID generation
  const hash = email.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return `order_${spokeId}_${Math.abs(hash).toString(36)}`;
};

export const fetchEnrichedProfiles = async (
  connections: SpokeConnection[]
): Promise<{ profiles: EnrichedProfile[]; errors: string[] }> => {
  // Fetch profiles, orders, and order items in parallel
  const [profilesResult, ordersResult, itemsResult] = await Promise.all([
    fetchAllSpokesProfiles(connections),
    fetchAllSpokesOrders(connections),
    fetchAllSpokesOrderItems(connections),
  ]);

  // Combine errors
  const errors = [
    ...profilesResult.errors,
    ...ordersResult.errors,
    ...itemsResult.errors,
  ];

  // Build a map of existing profiles by lowercase email + spoke_id
  const profilesByEmail = new Map<string, NormalizedSpokeProfile>();
  for (const profile of profilesResult.profiles) {
    if (profile.email) {
      const key = `${profile._spoke_id}:${profile.email.toLowerCase().trim()}`;
      profilesByEmail.set(key, profile);
    }
  }

  // Extract unique identities from orders
  const orderIdentities = extractOrderIdentities(ordersResult.orders);

  // Create profiles for order-only identities (those not in customers table)
  const orderOnlyProfiles: NormalizedSpokeProfile[] = [];

  for (const [key, identity] of orderIdentities) {
    // Check if this email already exists in customers
    if (!profilesByEmail.has(key)) {
      // Create a new profile from order data
      const newProfile: NormalizedSpokeProfile = {
        id: generateIdFromEmail(identity.email, identity.spoke_id),
        email: identity.email,
        first_name: identity.first_name,
        last_name: identity.last_name,
        subscribed: true, // Default to subscribed
        created_at: identity.first_order_date,
        _spoke_id: identity.spoke_id,
        _spoke_name: identity.spoke_name,
      };

      orderOnlyProfiles.push(newProfile);
      // Add to map so enrichment can find it
      profilesByEmail.set(key, newProfile);
    }
  }

  // Combine customer profiles + order-only profiles
  const allProfiles = [...profilesResult.profiles, ...orderOnlyProfiles];

  // Enrich profiles with order data and order items
  const enrichedProfiles = enrichProfilesWithOrders(
    allProfiles,
    ordersResult.orders,
    itemsResult.items
  );

  // Mark order-only profiles with special tags/metadata
  const orderOnlyEmails = new Set(orderOnlyProfiles.map(p => `${p._spoke_id}:${p.email.toLowerCase()}`));

  enrichedProfiles.forEach(profile => {
    const key = `${profile._spoke_id}:${profile.email.toLowerCase()}`;
    const identity = orderIdentities.get(key);

    if (orderOnlyEmails.has(key) && identity) {
      // This is an order-only profile - add metadata
      (profile as any)._order_only = true;
      (profile as any)._source = identity.source_table || 'orders';
    }
  });

  // Enrich with predicted demographics
  await loadNameCache();
  enrichedProfiles.forEach(profile => {
    profile._predicted_demographics = predictDemographicsSync(
      profile.first_name,
      profile.order_stats,
      profile.created_at
    );
  });

  return { profiles: enrichedProfiles, errors };
};
