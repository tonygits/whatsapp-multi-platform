import express, {Request, Response} from 'express';
import axios from "axios";
import crypto from "crypto";
import devicePaymentRepository from "../repositories/DevicePaymentRepository";
import paymentRepository from "../repositories/PaymentRepository";
import {verifyPaystackTransaction} from "../providers/paystack";

const router = express.Router();

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify"; // append /:reference
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // set in .env

if (!PAYSTACK_SECRET_KEY) {
    console.error("Missing PAYSTACK_SECRET_KEY in environment");
    process.exit(1);
}

/**
 * Webhook endpoint.
 * - Use express.raw() specifically here to access the raw body bytes for HMAC verification.
 * - Configure your Paystack webhook URL to this endpoint in the Paystack dashboard.
 *
 * Paystack sends header: x-paystack-signature
 */
// intentionally do NOT use express.json() for this route; use raw body to verify signature
router.post("/paystack", express.raw({type: "application/json"}), async (req: Request, res: Response) => {
        const rawBody = req.body as Buffer;
        const sig = req.headers["x-paystack-signature"] as string | undefined;

        if (!sig) {
            console.warn("Missing x-paystack-signature header");
            return res.status(400).send("Missing signature");
        }

        try {
            // compute HMAC SHA512 of the raw body using your secret key
            const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");

            if (hash !== sig) {
                console.warn("Invalid Paystack signature");
                return res.status(400).send("Invalid signature");
            }

            // parse JSON from raw body now that signature is verified
            const payload = JSON.parse(rawBody.toString("utf8"));
            // Example: payload.event === "charge.success" or "transaction.success" - Paystack's events can vary.
            // Log payload for debugging
            console.log("Paystack webhook payload:", payload.event, payload);

            // Extract reference - location depends on event structure
            // For transaction events typical path: payload.data.reference
            const reference = payload?.data?.reference;

            if (!reference) {
                console.warn("Webhook payload missing reference");
                // Acknowledge anyway (to avoid retries) if you're purposely ignoring
                return res.status(400).send("No transaction reference");
            }

            // Idempotency: check your DB if you've already processed this reference
            const dbTxn = await paymentRepository.findByTransactionReference(reference.trim());
            if (dbTxn && dbTxn.status === 'paid') return res.status(200).send("transaction already processed");

            // Verify the transaction with Paystack to be extra sure
            try {
                const verifyInfo = await verifyPaystackTransaction(reference);
                // verifyData.status should be 'success' for a completed successful payment
                console.log(verifyInfo);

                // IMPORTANT: make any DB updates idempotent (check by reference first)
                // Send 200 to Paystack to acknowledge receipt
                return res.status(200).send("ok");
            } catch (verifyErr: any) {
                console.error("Error verifying transaction with Paystack:", verifyErr?.response?.data ?? verifyErr.message);
                // Return 500 so Paystack will retry webhook later
                return res.status(500).send("verification error");
            }
        } catch (err: any) {
            console.error("Webhook handling error:", err);
            return res.status(500).send("internal error");
        }
    }
);

export default router;
