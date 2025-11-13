import nodemailer, {SendMailOptions, Transporter} from 'nodemailer';
import dotenv from 'dotenv';
import {SendMailInput} from "../types/sendMailInput";

dotenv.config();
/** Lazy transporter */
let transporter: Transporter | null = null;

function parseEnvBool(v?: string, fallback = false) {
    if (v === undefined) return fallback;
    return v === 'true' || v === '1';
}

function createTransporterFromEnv(): Transporter {
    const host = process.env.SMTP_HOST as string;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const user = process.env.SMTP_USER as string;
    const pass = process.env.SMTP_PASS as string;
    const secure = parseEnvBool(process.env.SMTP_SECURE, port === 465);

    const config: any = {
        host,
        port,
        secure,
    };

    if (user) {
        config.auth = { user, pass };
    }

    // nodemailer TransportOptions are compatible with this
    return nodemailer.createTransport(config);
}

function getTransporter(): Transporter {
    if (!transporter) {
        transporter = createTransporterFromEnv();
        // verify non-blocking
        transporter.verify().then(() => {
            // eslint-disable-next-line no-console
            console.info('SMTP transporter verified');
        }).catch((err: Error) => {
            // eslint-disable-next-line no-console
            console.warn('SMTP transporter verify failed:', err && err.message);
        });
    }
    return transporter;
}

function stripHtml(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, '').replace(/\s+/g, ' ').trim();
}

/** Simple branded HTML wrapper; optional — you can remove/replace */
export function wrapHtml(bodyHtml: string, title?: string) {
    return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>${escapeHtml(title || '')}</title>
    </head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4;color:#111;">
      <div style="max-width:680px;margin:24px auto;padding:24px;border-radius:8px;background:#fff;">
        <header style="margin-bottom:18px;">
          <h2 style="margin:0 0 8px 0;font-size:20px;color:#111;">${escapeHtml(title || '')}</h2>
        </header>
        <main>${bodyHtml}</main>
        <footer style="margin-top:20px;font-size:12px;color:#666;">
          Sent by your-service
        </footer>
      </div>
    </body>
  </html>
  `;
}

function escapeHtml(str: string) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * sendMail - top-level function used by svc functions
 */
export async function sendMail(input: SendMailInput) {
    const { to, title, body, html, from, cc, bcc, replyTo } = input;

    if (!to) throw new Error('`to` is required');
    if (!title) throw new Error('`title` is required');
    if (!body && !html) throw new Error('either `body` or `html` is required');

    const transporter = getTransporter();

    const finalHtml = html ? wrapHtml(html, title) : undefined;
    const finalText = body ?? (html ? stripHtml(html) : undefined);

    const mailOptions: SendMailOptions = {
        from: from || process.env.SMTP_FROM_INFO || `resend@${process.env.SMTP_DOMAIN || 'wapflow.app'}`,
        to,
        subject: title,
        text: finalText,
        html: finalHtml,
        cc,
        bcc,
        replyTo,
    };

    return await transporter.sendMail(mailOptions); // contains messageId, accepted, rejected, envelope, etc.
}
