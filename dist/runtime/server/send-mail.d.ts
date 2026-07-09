export interface MailerEmail {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
}
export declare function sendMail(email: MailerEmail): Promise<{
    messageId: string;
}>;
