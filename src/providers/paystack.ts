import axios from "axios";
import logger from "../utils/logger";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export async function createPlan(name: string, amountKobo: number, interval: "monthly" | "yearly") {
    // amountKobo: amount in smallest currency unit (kobo for NGN) - Paystack expects integer
    const res = await axios.post(`${PAYSTACK_BASE_URL}/plan`, {
        name,
        amount: amountKobo,
        interval, // "monthly" or "yearly"
    }, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    return res.data; // contains plan.code, plan.id etc
}

// Helper to call Paystack API
export async function callPaystack(endpoint: string, payload: any) {
    const url = `${PAYSTACK_BASE_URL}${endpoint}`;
    const res = await axios.post(url, payload, {
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
        },
    });
    return res.data;
}

// -----------------------------
// Placeholder DB helpers - replace with your real DB logic
// -----------------------------
type LocalSubscription = {
    id: string;
    subscription_code: string; // Paystack subscription code (e.g. SUB_xxx)
    customer_email: string;
    plan_code: string;
    status: string;
    paystack_subscription_id?: string | number;
    authorization_code?: string; // stored authorization for charges
};

export async function getLocalSubscriptionByCode(code: string): Promise<LocalSubscription | null> {
    // Example: return await db.subscription.findUnique({ where: { subscription_code: code }});
    return null;
}

export async function saveLocalSubscription(sub: Partial<LocalSubscription>) {
    // save or upsert in DB
    return;
}

export async function markLocalSubscriptionDisabled(code: string) {
    // update DB subscription status
    return;
}
// -----------------------------

// Helper: generic call to Paystack (axios instance)
const paystack = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
    },
});

// Fetch Paystack subscription details (GET /subscription/:code)
export async function fetchPaystackSubscription(subscriptionCode: string) {
    const url = `/subscription/${encodeURIComponent(subscriptionCode)}`;
    const resp = await paystack.get(url);
    return resp.data?.data;
}

// Fetch plan details (GET /plan/:code)
export async function fetchPaystackPlan(planCode: string) {
    const url = `/plan/${encodeURIComponent(planCode)}`;
    const resp = await paystack.get(url);
    return resp.data?.data;
}

// Create a new subscription for a customer (POST /subscription)
export async function changePaystackSubscription(customerIdentifier: string, planCode: string, authorization?: string, startDate?: string) {
    const payload: any = { customer: customerIdentifier, plan: planCode };
    if (authorization) payload.authorization = authorization;
    if (startDate) payload.start_date = startDate;
    const resp = await paystack.post("/subscription", payload);
    return resp.data?.data;
}

// Disable a subscription (POST /subscription/disable)
export async function disablePaystackSubscription(subscriptionCode: string, token?: string) {
    const payload: any = { code: subscriptionCode };
    if (token) payload.token = token;
    const resp = await paystack.post("/subscription/disable", payload);
    return resp.data;
}

// Charge authorization immediately (POST /transaction/charge_authorization)
export async function chargeAuthorization(amount: number, authorization_code: string, email: string, reference?: string) {
    // amount in kobo (or smallest unit)
    const payload: any = {
        authorization_code,
        email,
        amount: amount.toString(), // Paystack expects string/int in subunits
    };
    if (reference) payload.reference = reference;
    const resp = await paystack.post("/transaction/charge_authorization", payload, {
        headers: { "Content-Type": "application/json" },
    });
    return resp.data;
}

// -----------------------------
// Placeholder DB helpers — replace these with real DB logic
// -----------------------------
type LocalCustomer = {
    id: string; // local DB id
    email: string;
    paystackCustomerId?: string; // paystack customer id
    authorizationCode?: string;
};

export async function verifyPaystackTransaction(reference: string) {
    try {
        // Idempotency check: did we already process this reference?
        const existing = await findPaymentByReference(reference);
        if (existing) {
            logger.info(`Reference already processed ${reference}`);
        }

        // 1) Verify the transaction with Paystack
        const verifyResp = await verifyTransaction(reference);
        if (!verifyResp || !verifyResp.data) {
             throw new Error( "Invalid response from Paystack verify" );
        }

        const tx = verifyResp.data; // Paystack transaction object
        // tx.status should be "success"
        if (tx.status !== "success") {
            // you may still want to save as failed/pending in DB
            logger.error(`transaction response ${tx}`)
            throw new Error( `Transaction failed with status: ${tx.status}`);
        }

        // 2) Extract authorization code and customer email
        const authorization = tx.authorization;
        const authCode = authorization?.authorization_code;
        const customerFromTx = tx.customer || tx.customer_email || (tx.customer && tx.customer.email) || null;
        const customerEmail = customerFromTx?.email ?? customerFromTx ?? tx.customer_email ?? null;

        if (!customerEmail) {
            // weird edge-case: no email in transaction — handle gracefully
            throw new Error("No customer email found in transaction. Cannot create subscription.");
        }

        // 3) Create or find Paystack customer
        let paystackCustomer = await getPaystackCustomerByEmail(customerEmail);

        if (!paystackCustomer) {
            // create with authorization_code if available to attach reusable card
            paystackCustomer = await createPaystackCustomer(customerEmail, authCode, tx.customer?.first_name, tx.customer?.last_name);
        } else {
            // If customer exists, but we have an authorization code, you might attach it via updating customer or keeping local mapping.
            // Paystack customer object may already include authorizations; we still keep going.
        }

        // 4) Save / upsert local customer record
        const localCustomer = await upsertLocalCustomer({
            email: customerEmail,
            paystackCustomerId: paystackCustomer?.id?.toString?.() ?? paystackCustomer?.customer_code ?? undefined,
            authorizationCode: authCode ?? undefined,
        });

        // 5) Determine plan code to subscribe the user to
        // Preferred: client included metadata.plan_code during initialize (tx.metadata.plan_code)
        const planCodeFromMetadata = tx.metadata?.plan_code;
        const planCode = planCodeFromMetadata || 'monthly';
        if (!planCode) {
            // no plan code found — you can either return success (no subscription) or error
            // Here we return an informative response telling caller to provide plan_code
            // But we still mark payment processed in DB to avoid double-processing
            await markPaymentProcessed(reference, { tx, note: "no plan_code found" });
            return {
                message: "Payment verified but no plan_code found to create subscription. Provide plan_code in metadata or query param.",
                reference,
                transaction: tx,
            };
        }

        // 6) Create Paystack subscription (use customer email or code)
        // For safety we pass the authorization_code if available in payload so Paystack can use stored card
        const subscription = await createPaystackSubscription(paystackCustomer.email || paystackCustomer.id || customerEmail, planCode, authCode);

        // 7) Persist subscription & mark payment processed
        await saveSubscriptionRecord({
            reference,
            transaction: tx,
            subscription,
            localCustomer,
        });

        await markPaymentProcessed(reference, { tx, subscription });

        // 8) Respond with success and subscription details
        return {
            message: "Payment verified and subscription created",
            reference,
            transaction: {
                id: tx.id,
                status: tx.status,
                amount: tx.amount,
                currency: tx.currency,
                authorization: tx.authorization,
            },
            paystackCustomer,
            subscription,
        };
    } catch (err: any) {
        console.error("Error in verify-and-subscribe:", err?.response?.data ?? err.message);
        // Do NOT mark payment processed on error; caller/webhook may retry
        throw new Error(`verify and subscribe error  ${err?.response?.data ?? err.message}`);
    }
}

// Optional: Replace with your actual DB lookups
export async function findLocalSubscriptionById(id: string) {
    // return await db.subscription.findUnique({ where: { id }});
    return null;
}

export async function updateLocalSubscriptionStatus(subCode: string, status: string) {
    // e.g. await db.subscription.update({ where: { code: subCode }, data: { status }});
    return;
}

export async function findPaymentByReference(reference: string) {
    // return null or an object representing an already processed payment
    // e.g. return await db.payment.findUnique({ where: { reference }});
    return null;
}

export async function markPaymentProcessed(reference: string, payload: any) {
    // persist that this reference has been processed
    // e.g. await db.payment.create({ data: { reference, payload: JSON.stringify(payload), status: 'success' }});
    return;
}

export async function upsertLocalCustomer(customer: Partial<LocalCustomer>): Promise<LocalCustomer> {
    // Create or update local customer and return local customer record.
    // e.g. return await db.customer.upsert(...)
    return {
        id: "local-cust-id",
        email: customer.email || "unknown",
        paystackCustomerId: customer.paystackCustomerId,
        authorizationCode: customer.authorizationCode,
    };
}

export async function saveSubscriptionRecord(subscriptionPayload: any) {
    // Save subscription record in your DB (subscription code, customer id, plan, status, start/next billing date)
    return;
}
// -----------------------------

// Helper: Verify transaction with Paystack
export async function verifyTransaction(reference: string) {
    const url = `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`;
    const res = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
    });
    return res.data; // full Paystack response
}

// Helper: Get Paystack customer by email (returns first match or null)
export async function getPaystackCustomerByEmail(email: string) {
    const url = `${PAYSTACK_BASE_URL}/customer?email=${encodeURIComponent(email)}`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const customers = res.data?.data;
    if (Array.isArray(customers) && customers.length > 0) return customers[0];
    return null;
}

// Helper: Create Paystack customer with an authorization_code (reusable card)
export async function createPaystackCustomer(email: string, authorization_code?: string, first_name?: string, last_name?: string) {
    const payload: any = { email };
    if (authorization_code) payload.authorization_code = authorization_code;
    if (first_name) payload.first_name = first_name;
    if (last_name) payload.last_name = last_name;

    const res = await axios.post(`${PAYSTACK_BASE_URL}/customer`, payload, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    return res.data?.data;
}

// Helper: Create subscription for customer to a plan
export async function createPaystackSubscription(customerEmailOrId: string, planCode: string, authorization?: string) {
    // Paystack accepts either customer email or id in `customer` field
    const payload: any = {
        customer: customerEmailOrId,
        plan: planCode,
    };
    if (authorization) payload.authorization = authorization;

    const res = await axios.post(`${PAYSTACK_BASE_URL}/subscription`, payload, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    return res.data?.data;
}
