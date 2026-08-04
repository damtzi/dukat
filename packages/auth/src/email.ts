export interface TransactionalEmail {
	to: string;
	subject: string;
	text: string;
	idempotencyKey?: string;
}

export interface TransactionalEmailSender {
	send(message: TransactionalEmail): Promise<void>;
}

export const authEmailMessages = {
	verification(url: string): Omit<TransactionalEmail, 'to'> {
		return {
			subject: 'Verify your Dukat email address',
			text: `Verify your email address by opening this link: ${url}`
		};
	},
	passwordReset(url: string): Omit<TransactionalEmail, 'to'> {
		return {
			subject: 'Reset your Dukat password',
			text: `Reset your password by opening this link: ${url}`
		};
	}
} as const;

export function createResendEmailSender(apiKey: string, from: string): TransactionalEmailSender {
	return {
		async send(message) {
			const { idempotencyKey, ...payload } = message;
			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
				},
				body: JSON.stringify({ from, ...payload })
			});

			if (!response.ok) {
				throw new Error(`Transactional email delivery failed with status ${response.status}`);
			}
		}
	};
}
