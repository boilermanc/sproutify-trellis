import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase as hubClient } from './lib/supabase';
import { SpokeConnection, SpokeTableConfig, NormalizedSpokeProfile, EnrichedProfile, ProfileOrderStats, ProductPurchase, ProfileAddress } from './types';
import { loadNameCache, predictDemographicsSync } from './demographicsService';

// ── Server-side spoke reads ─────────────────────────────────────────
// All runtime data reads go through the `spoke-query` Edge Function so the
// spoke's key is decrypted server-side and NEVER reaches the browser. The
// function returns raw rows + the field_mapping per configured table; we
// normalize client-side (pure transforms, no key needed).
type SpokeTableType = 'customers' | 'orders' | 'order_items' | 'subscriptions';

interface SpokeFetchTable {
  table_name: string;
  field_mapping: Record<string, string>;
  rows: Record<string, unknown>[];
}

async function spokeFetch(
  connectionId: string,
  tableType: SpokeTableType,
): Promise<{ tables: SpokeFetchTable[]; errors: string[] }> {
  const { data, error } = await hubClient.functions.invoke('spoke-query', {
    body: { op: 'fetch', connection_id: connectionId, table_type: tableType },
  });
  if (error) throw new Error(error.message || 'spoke-query request failed');
  if (data?.error) throw new Error(data.error);
  return { tables: data?.tables || [], errors: data?.errors || [] };
}

interface NewsletterAudienceRow {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  customer_id?: string | null;
  tags?: string[] | null;
  // Per-subscriber token for the spoke's native newsletter unsubscribe link.
  // resolve_newsletter_audience already selects this column.
  unsubscribe_token?: string | null;
}

async function fetchNewsletterAudience(connectionId: string): Promise<NewsletterAudienceRow[]> {
  const { data, error } = await hubClient.functions.invoke('spoke-query', {
    body: { op: 'newsletter_audience', connection_id: connectionId },
  });
  if (error) throw new Error(error.message || 'newsletter audience request failed');
  if (data?.error) throw new Error(data.error);
  if (data?.errors?.length) throw new Error(data.errors[0]);
  return (data?.rows || []) as NewsletterAudienceRow[];
}

function supportsAtlNewsletterAudience(connection: SpokeConnection): boolean {
  return connection.supabase_url.includes('povudgtvzggnxwgtjexa') ||
    connection.name.toLowerCase().includes('atl urban farms');
}

function audienceKey(spokeId: string, email?: string | null): string | null {
  const clean = (email || '').toLowerCase().trim();
  return clean ? `${spokeId}:${clean}` : null;
}

// Cache spoke clients by URL to avoid duplicate GoTrueClient instances
const spokeClientCache = new Map<string, SupabaseClient>();
export function getSpokeClient(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}:${key}`;
  let client = spokeClientCache.get(cacheKey);
  if (!client) {
    client = createClient(url, key);
    spokeClientCache.set(cacheKey, client);
  }
  return client;
}

/**
 * Remove a spoke client from cache (call when permanently deleting a connection).
 */
export function disconnectSpoke(url: string, key: string): void {
  spokeClientCache.delete(`${url}:${key}`);
}

type TestConnectionInput = {
  supabase_url: string;
  supabase_key: string;
  table_name: string;
};

type TestConnectionResult =
  | { success: true; rowCount: number; columns: string[]; error?: string }
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

// Pagination helper to fetch all records from a Supabase table
const BATCH_SIZE = 1000; // Supabase default max rows per request

async function fetchAllRows<T>(
  client: SupabaseClient,
  tableName: string,
  selectString: string
): Promise<{ data: T[]; error: string | null }> {
  const allData: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from(tableName)
      .select(selectString)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      return { data: allData, error: error.message };
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...(data as T[]));
      offset += data.length;
      // If we got fewer than BATCH_SIZE, we've reached the end
      if (data.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
  }

  return { data: allData, error: null };
}

// Fetch column names via CSV through the Supabase JS client (handles auth properly)
async function fetchTableColumnsCsv(
  url: string,
  key: string,
  table_name: string
): Promise<string[]> {
  try {
    const client = getSpokeClient(url, key);
    const { data, error } = await client
      .from(table_name)
      .select('*')
      .limit(1)
      .csv();

    if (error || !data) return [];
    const headerLine = String(data).trim().split('\n')[0];
    if (!headerLine) return [];
    return headerLine.split(',').map(c => c.replace(/^"|"$/g, ''));
  } catch {
    return [];
  }
}

// SETUP-mode test: the wizard has just-typed url+key. Routed through the
// Edge Function (which adds an OpenAPI column fallback for empty/RLS tables).
export async function testSpokeConnection(
  connection: TestConnectionInput
): Promise<TestConnectionResult> {
  try {
    const { data, error } = await hubClient.functions.invoke('spoke-query', {
      body: {
        op: 'test',
        supabase_url: connection.supabase_url,
        supabase_key: connection.supabase_key,
        table_name: connection.table_name,
      },
    });
    if (error) return { success: false, error: error.message || 'Connection test failed' };
    if (data?.success === false) return { success: false, error: data.error || 'Connection test failed' };
    return { success: true, rowCount: data?.rowCount ?? 0, columns: data?.columns ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error occurred' };
  }
}

// RUNTIME-mode test for an already-saved connection — the key is decrypted
// server-side, so the browser never needs it.
export async function testSpokeConnectionById(
  connectionId: string,
  tableName?: string,
): Promise<TestConnectionResult> {
  try {
    const { data, error } = await hubClient.functions.invoke('spoke-query', {
      body: { op: 'test', connection_id: connectionId, table_name: tableName },
    });
    if (error) return { success: false, error: error.message || 'Connection test failed' };
    if (data?.success === false) return { success: false, error: data.error || 'Connection test failed' };
    return { success: true, rowCount: data?.rowCount ?? 0, columns: data?.columns ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error occurred' };
  }
}

export const discoverTables = async (
  supabase_url: string,
  supabase_key: string
): Promise<{ tables: string[]; error?: string }> => {
  try {
    const { data, error } = await hubClient.functions.invoke('spoke-query', {
      body: { op: 'discover', supabase_url, supabase_key },
    });
    if (error) return { tables: [], error: error.message };
    if (data?.error) return { tables: [], error: data.error };
    return { tables: data?.tables || [] };
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
      order_number: ['order_number', 'ordernumber', 'number', 'order_no', 'transaction_id'],
      customer_id: ['customer_id', 'customerid', 'user_id', 'userid'],
      guest_email: ['guest_email', 'email', 'guest_mail', 'billing_email'],
      billing_email: ['billing_email', 'guest_email', 'email'],
      billing_first_name: ['billing_first_name', 'first_name', 'firstname', 'billing_fname'],
      billing_last_name: ['billing_last_name', 'last_name', 'lastname', 'billing_lname'],
      status: ['status', 'order_status', 'state', 'event_type'],
      total: ['total', 'order_total', 'grand_total', 'amount', 'revenue_usd'],
      subtotal: ['subtotal', 'sub_total'],
      tax: ['tax', 'tax_amount', 'sales_tax'],
      paid_at: ['paid_at', 'payment_date', 'paid_date', 'event_timestamp'],
      created_at: ['created_at', 'created', 'order_date', 'date', 'event_timestamp'],
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
  // Only fetch when a customers table is configured + enabled.
  const tableConfig = connection.tables.find(t => t.table_type === 'customers' && t.enabled);
  if (!tableConfig) return [];

  try {
    // Server-side read — the spoke key never touches the browser.
    const { tables, errors } = await spokeFetch(connection.id, 'customers');
    if (tables.length === 0 && errors.length > 0) {
      throw new Error(`${connection.name}: ${errors[0]}`);
    }

    const profiles: NormalizedSpokeProfile[] = [];
    for (const t of tables) {
      const mapping = t.field_mapping;
      for (const row of t.rows) {
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

        profiles.push(profile);
      }
    }
    return profiles;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error fetching from spoke ${connection.name}:`, errorMessage);
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

  // Server-side read — returns raw rows per configured order table.
  let fetchedTables: SpokeFetchTable[] = [];
  try {
    ({ tables: fetchedTables } = await spokeFetch(connection.id, 'orders'));
  } catch (err) {
    console.error(`Error fetching orders from ${connection.name}:`, err);
    return [];
  }

  for (const tableConfig of fetchedTables) {
    try {
      const data = tableConfig.rows;
      if (!data || data.length === 0) continue;

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

  // Server-side read — returns raw rows per configured order_items table.
  let fetchedTables: SpokeFetchTable[] = [];
  try {
    ({ tables: fetchedTables } = await spokeFetch(connection.id, 'order_items'));
  } catch (err) {
    console.error(`Error fetching order items from ${connection.name}:`, err);
    return [];
  }

  for (const tableConfig of fetchedTables) {
    try {
      const data = tableConfig.rows;
      if (!data || data.length === 0) continue;

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
    // Server-side read — the spoke key never touches the browser.
    const { tables } = await spokeFetch(connection.id, 'subscriptions');
    const data = tables.flatMap(t =>
      t.rows.map(row => ({ row, mapping: t.field_mapping })),
    );
    if (data.length === 0) return [];

    // Normalize the data
    return data.map(({ row, mapping }: { row: any; mapping: Record<string, string> }) => ({
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
  const newsletterConnections = connections.filter(c => c.status === 'active' && supportsAtlNewsletterAudience(c));

  // Fetch profiles, orders, order items, and authoritative ATL newsletter audience in parallel.
  const [profilesResult, ordersResult, itemsResult, newsletterResults] = await Promise.all([
    fetchAllSpokesProfiles(connections),
    fetchAllSpokesOrders(connections),
    fetchAllSpokesOrderItems(connections),
    Promise.allSettled(newsletterConnections.map(async connection => ({
      connection,
      rows: await fetchNewsletterAudience(connection.id),
    }))),
  ]);

  // Combine errors
  const errors = [
    ...profilesResult.errors,
    ...ordersResult.errors,
    ...itemsResult.errors,
  ];

  const activeNewsletterKeys = new Set<string>();
  const newsletterRowsByKey = new Map<string, NewsletterAudienceRow>();
  const newsletterConnectionIds = new Set(newsletterConnections.map(c => c.id));
  const authoritativeNewsletterConnectionIds = new Set<string>();

  newsletterResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(`${newsletterConnections[index].name}: ${result.reason?.message || 'Failed to fetch newsletter audience'}`);
      return;
    }

    authoritativeNewsletterConnectionIds.add(result.value.connection.id);
    for (const row of result.value.rows) {
      const key = audienceKey(result.value.connection.id, row.email);
      if (!key) continue;
      activeNewsletterKeys.add(key);
      newsletterRowsByKey.set(key, row);
    }
  });

  // For ATL, newsletter_subscribers.status='active' is authoritative. The
  // deprecated customers.newsletter_subscribed boolean may be stale.
  for (const profile of profilesResult.profiles) {
    if (!authoritativeNewsletterConnectionIds.has(profile._spoke_id)) continue;
    const key = audienceKey(profile._spoke_id, profile.email);
    profile.subscribed = key ? activeNewsletterKeys.has(key) : false;
    // Carry the subscriber's native unsubscribe token so sends can build a
    // brand-native, per-recipient unsubscribe URL.
    const token = key ? newsletterRowsByKey.get(key)?.unsubscribe_token : null;
    if (token) profile.unsubscribe_token = token;
  }

  // Build a map of existing profiles by lowercase email + spoke_id
  const profilesByEmail = new Map<string, NormalizedSpokeProfile>();
  for (const profile of profilesResult.profiles) {
    if (profile.email) {
      const key = `${profile._spoke_id}:${profile.email.toLowerCase().trim()}`;
      profilesByEmail.set(key, profile);
    }
  }

  // Include active subscriber-only emails. Customers and subscribers are
  // separate ATL sets, and subscribers do not always have customer accounts.
  const newsletterOnlyProfiles: NormalizedSpokeProfile[] = [];
  for (const [key, row] of newsletterRowsByKey) {
    if (profilesByEmail.has(key)) continue;
    const [spokeId] = key.split(':');
    const connection = newsletterConnections.find(c => c.id === spokeId);
    if (!connection) continue;
    const profile: NormalizedSpokeProfile = {
      id: row.customer_id || generateIdFromEmail(row.email, spokeId),
      email: row.email.toLowerCase().trim(),
      first_name: row.first_name || undefined,
      last_name: row.last_name || undefined,
      subscribed: true,
      unsubscribe_token: row.unsubscribe_token || undefined,
      _spoke_id: spokeId,
      _spoke_name: connection.name,
    };
    newsletterOnlyProfiles.push(profile);
    profilesByEmail.set(key, profile);
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
        subscribed: authoritativeNewsletterConnectionIds.has(identity.spoke_id)
          ? activeNewsletterKeys.has(key)
          : true, // Legacy fallback for spokes without an authoritative newsletter source
        created_at: identity.first_order_date,
        _spoke_id: identity.spoke_id,
        _spoke_name: identity.spoke_name,
      };

      orderOnlyProfiles.push(newProfile);
      // Add to map so enrichment can find it
      profilesByEmail.set(key, newProfile);
    }
  }

  // Combine customer profiles + active subscriber-only profiles + order-only profiles
  const allProfiles = [...profilesResult.profiles, ...newsletterOnlyProfiles, ...orderOnlyProfiles];

  // Enrich profiles with order data and order items
  const enrichedProfiles = enrichProfilesWithOrders(
    allProfiles,
    ordersResult.orders,
    itemsResult.items
  );

  // Mark order-only profiles with special tags/metadata
  const orderOnlyEmails = new Set(orderOnlyProfiles.map(p => `${p._spoke_id}:${p.email.toLowerCase()}`));
  const newsletterOnlyEmails = new Set(newsletterOnlyProfiles.map(p => `${p._spoke_id}:${p.email.toLowerCase()}`));

  enrichedProfiles.forEach(profile => {
    const key = `${profile._spoke_id}:${profile.email.toLowerCase()}`;
    const identity = orderIdentities.get(key);

    if (orderOnlyEmails.has(key) && identity) {
      // This is an order-only profile - add metadata
      (profile as any)._order_only = true;
      (profile as any)._source = identity.source_table || 'orders';
    }
    if (newsletterOnlyEmails.has(key)) {
      (profile as any)._subscriber_only = true;
      (profile as any)._source = 'newsletter_subscribers';
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
