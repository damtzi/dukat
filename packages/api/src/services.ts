export interface AuthenticationService {
	handler(request: Request): Promise<Response>;
	api: {
		getSession(options: { headers: Headers }): Promise<{ user: { id: string } } | null>;
	};
}

export interface WorkspaceSummary {
	id: string;
	name: string;
	type: 'personal' | 'household';
}

export interface WorkspaceService {
	listAuthorized(userId: string): Promise<WorkspaceSummary[]>;
	findAuthorized(context: {
		userId: string;
		workspaceId: string;
	}): Promise<WorkspaceSummary | undefined>;
}

export interface APIServices {
	auth: AuthenticationService;
	readiness(): Promise<unknown>;
	workspaces: WorkspaceService;
}
