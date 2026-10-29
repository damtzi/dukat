export interface AuthenticationService {
	handler(request: Request): Promise<Response>;
	api: {
		getSession(options: { headers: Headers }): Promise<{
			user: {
				id: string;
				name: string;
				username: string;
				email: string;
				emailVerified: boolean;
				image?: string | null;
			};
		} | null>;
	};
}

export interface APIServices {
	auth: AuthenticationService;
	readiness(): Promise<unknown>;
}
