export type SendMailInput = {
    to: string | string[];
    title: string;
    body?: string;       // plain text fallback
    html?: string;       // optional html
    from?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
};
