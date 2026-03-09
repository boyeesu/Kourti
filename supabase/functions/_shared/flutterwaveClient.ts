declare const Deno: {
  env: { get(key: string): string | undefined };
};

/**
 * Shared Flutterwave API client for Supabase Edge Functions.
 *
 * Provides typed helpers for Payment Plans, Subscriptions, Transactions,
 * Webhook verification, and Payment initialization against the
 * Flutterwave v3 REST API.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com';
const REQUEST_TIMEOUT_MS = 30_000;

function getSecretKey(): string {
  const key = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
  if (!key) {
    throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is not set');
  }
  return key;
}

// ---------------------------------------------------------------------------
// Types – Request params
// ---------------------------------------------------------------------------

/** Interval options supported by Flutterwave payment plans. */
export type PlanInterval = 'monthly' | 'yearly' | 'weekly' | 'daily';

/** Parameters for creating a new payment plan. */
export interface CreatePaymentPlanParams {
  amount: number;
  name: string;
  interval: PlanInterval;
  duration?: number;
  currency?: string;
}

/** Parameters for updating an existing payment plan. */
export interface UpdatePaymentPlanParams {
  name?: string;
  status?: string;
}

/** Customer details used when initializing a payment. */
export interface PaymentCustomer {
  email: string;
  name?: string;
}

/** UI customization options for the Flutterwave checkout. */
export interface PaymentCustomizations {
  title?: string;
  logo?: string;
}

/** Parameters for initializing a new payment (standard checkout). */
export interface InitializePaymentParams {
  tx_ref: string;
  amount: number;
  currency: string;
  redirect_url: string;
  customer: PaymentCustomer;
  payment_plan?: string;
  meta?: Record<string, string>;
  customizations?: PaymentCustomizations;
}

// ---------------------------------------------------------------------------
// Types – API responses
// ---------------------------------------------------------------------------

/** Generic Flutterwave API response envelope. */
export interface FlutterwaveResponse<T = unknown> {
  status: string;
  message: string;
  data: T;
}

/** Shape of a payment plan returned by the API. */
export interface PaymentPlanData {
  id: number;
  name: string;
  amount: number;
  interval: string;
  duration: number;
  status: string;
  currency: string;
  plan_token: string;
  created_at: string;
}

/** Shape of a subscription returned by the API. */
export interface SubscriptionData {
  id: number;
  amount: number;
  customer: {
    id: number;
    customer_email: string;
  };
  plan: number;
  status: string;
  created_at: string;
}

/** Shape of a transaction returned by the API. */
export interface TransactionData {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  charged_amount: number;
  status: string;
  payment_type: string;
  customer: {
    id: number;
    email: string;
    name: string;
  };
  created_at: string;
}

/** Shape of the response when initializing a payment. */
export interface InitializePaymentData {
  link: string;
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/**
 * Send an authenticated request to the Flutterwave API.
 *
 * @param method  - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param path    - API path, e.g. `/v3/payment-plans`
 * @param body    - Optional JSON-serialisable request body
 * @returns Parsed JSON response from Flutterwave
 * @throws Error on network issues, timeouts, or non-2xx responses
 */
export async function flutterwaveRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<FlutterwaveResponse<T>> {
  const url = `${FLUTTERWAVE_BASE_URL}${path}`;
  const secretKey = getSecretKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Flutterwave API request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${path}`
      );
    }
    throw new Error(
      `Flutterwave API network error: ${method} ${path} – ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let json: FlutterwaveResponse<T>;

  try {
    json = (await response.json()) as FlutterwaveResponse<T>;
  } catch {
    throw new Error(
      `Flutterwave API returned non-JSON response (HTTP ${response.status}): ${method} ${path}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Flutterwave API error (HTTP ${response.status}): ${json.message ?? 'Unknown error'} – ${method} ${path}`
    );
  }

  return json;
}

// ---------------------------------------------------------------------------
// Payment Plans API
// ---------------------------------------------------------------------------

/**
 * Create a new payment plan.
 *
 * @see https://developer.flutterwave.com/reference/create-a-payment-plan
 */
export async function createPaymentPlan(
  params: CreatePaymentPlanParams
): Promise<FlutterwaveResponse<PaymentPlanData>> {
  return flutterwaveRequest<PaymentPlanData>('POST', '/v3/payment-plans', params);
}

/**
 * Retrieve a single payment plan by its ID.
 *
 * @see https://developer.flutterwave.com/reference/get-a-payment-plan
 */
export async function getPaymentPlan(
  planId: string
): Promise<FlutterwaveResponse<PaymentPlanData>> {
  return flutterwaveRequest<PaymentPlanData>('GET', `/v3/payment-plans/${planId}`);
}

/**
 * List all payment plans on the account.
 *
 * @see https://developer.flutterwave.com/reference/list-payment-plans
 */
export async function listPaymentPlans(): Promise<FlutterwaveResponse<PaymentPlanData[]>> {
  return flutterwaveRequest<PaymentPlanData[]>('GET', '/v3/payment-plans');
}

/**
 * Update an existing payment plan.
 *
 * @see https://developer.flutterwave.com/reference/update-a-payment-plan
 */
export async function updatePaymentPlan(
  planId: string,
  params: UpdatePaymentPlanParams
): Promise<FlutterwaveResponse<PaymentPlanData>> {
  return flutterwaveRequest<PaymentPlanData>('PUT', `/v3/payment-plans/${planId}`, params);
}

/**
 * Cancel (deactivate) a payment plan.
 *
 * @see https://developer.flutterwave.com/reference/cancel-a-payment-plan
 */
export async function cancelPaymentPlan(
  planId: string
): Promise<FlutterwaveResponse<PaymentPlanData>> {
  return flutterwaveRequest<PaymentPlanData>('PUT', `/v3/payment-plans/${planId}/cancel`);
}

// ---------------------------------------------------------------------------
// Subscriptions API
// ---------------------------------------------------------------------------

/**
 * Retrieve a single subscription by its ID.
 *
 * @see https://developer.flutterwave.com/reference/get-a-subscription
 */
export async function getSubscription(
  subscriptionId: string
): Promise<FlutterwaveResponse<SubscriptionData>> {
  return flutterwaveRequest<SubscriptionData>('GET', `/v3/subscriptions/${subscriptionId}`);
}

/**
 * List all subscriptions on the account.
 *
 * @see https://developer.flutterwave.com/reference/list-all-subscriptions
 */
export async function listSubscriptions(): Promise<FlutterwaveResponse<SubscriptionData[]>> {
  return flutterwaveRequest<SubscriptionData[]>('GET', '/v3/subscriptions');
}

/**
 * Activate a previously deactivated subscription.
 *
 * @see https://developer.flutterwave.com/reference/activate-a-subscription
 */
export async function activateSubscription(
  subscriptionId: string
): Promise<FlutterwaveResponse<SubscriptionData>> {
  return flutterwaveRequest<SubscriptionData>(
    'PUT',
    `/v3/subscriptions/${subscriptionId}/activate`
  );
}

/**
 * Deactivate an active subscription.
 *
 * @see https://developer.flutterwave.com/reference/deactivate-a-subscription
 */
export async function deactivateSubscription(
  subscriptionId: string
): Promise<FlutterwaveResponse<SubscriptionData>> {
  return flutterwaveRequest<SubscriptionData>(
    'PUT',
    `/v3/subscriptions/${subscriptionId}/deactivate`
  );
}

/**
 * Cancel a subscription permanently.
 *
 * @see https://developer.flutterwave.com/reference/cancel-a-subscription
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<FlutterwaveResponse<SubscriptionData>> {
  return flutterwaveRequest<SubscriptionData>('PUT', `/v3/subscriptions/${subscriptionId}/cancel`);
}

// ---------------------------------------------------------------------------
// Transactions API
// ---------------------------------------------------------------------------

/**
 * Verify a transaction by its ID.
 *
 * @see https://developer.flutterwave.com/reference/verify-a-transaction
 */
export async function verifyTransaction(
  transactionId: string
): Promise<FlutterwaveResponse<TransactionData>> {
  return flutterwaveRequest<TransactionData>('GET', `/v3/transactions/${transactionId}/verify`);
}

/**
 * Retrieve details of a single transaction.
 *
 * @see https://developer.flutterwave.com/reference/get-a-transaction
 */
export async function getTransaction(
  transactionId: string
): Promise<FlutterwaveResponse<TransactionData>> {
  return flutterwaveRequest<TransactionData>('GET', `/v3/transactions/${transactionId}`);
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verify that an incoming webhook request originated from Flutterwave by
 * comparing the `verif-hash` header value against the stored webhook hash
 * using a timing-safe comparison to prevent timing attacks.
 *
 * @param secretHash  - The expected hash (from `FLUTTERWAVE_WEBHOOK_HASH` env var)
 * @param requestHash - The hash provided in the incoming request's `verif-hash` header
 * @returns `true` if the hashes match, `false` otherwise
 */
export function verifyWebhookSignature(secretHash: string, requestHash: string): boolean {
  if (secretHash.length !== requestHash.length) {
    return false;
  }

  const encoder = new TextEncoder();
  const a = encoder.encode(secretHash);
  const b = encoder.encode(requestHash);

  if (a.byteLength !== b.byteLength) {
    return false;
  }

  // Timing-safe comparison: iterate over every byte regardless of mismatch
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }

  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Payment initialization
// ---------------------------------------------------------------------------

/**
 * Initialize a standard Flutterwave payment (hosted checkout).
 *
 * Returns a link that the customer should be redirected to in order to
 * complete the payment.
 *
 * @see https://developer.flutterwave.com/reference/create-a-payment
 */
export async function initializePayment(
  params: InitializePaymentParams
): Promise<FlutterwaveResponse<InitializePaymentData>> {
  return flutterwaveRequest<InitializePaymentData>('POST', '/v3/payments', params);
}
