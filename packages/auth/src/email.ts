export type AuthEmailKind = 'email-verification' | 'password-reset';

export interface AuthEmail {
	kind: AuthEmailKind;
	to: string;
	subject: string;
	text: string;
	url: string;
	token: string;
}

export interface AuthEmailSender {
	send(email: AuthEmail): Promise<void>;
}

export interface ResendEmailSenderConfig {
	apiKey: string;
	from: string;
	fetch?: typeof globalThis.fetch;
}

export function createResendEmailSender(config: ResendEmailSenderConfig): AuthEmailSender {
	const fetchImplementation = config.fetch ?? globalThis.fetch;

	return {
		async send(email) {
			const response = await fetchImplementation('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${config.apiKey}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					from: config.from,
					to: [email.to],
					subject: email.subject,
					text: email.text
				})
			});

			if (!response.ok) {
				throw new Error(`Transactional email provider returned ${response.status}`);
			}
		}
	};
}
