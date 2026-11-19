export interface MailerEmail {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    signal?: AbortSignal | undefined;
}
export declare function sendMail(email: MailerEmail): Promise<{
    messageId: string;
}>;
