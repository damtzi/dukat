import type {
	CreateAccount,
	CreateTransaction,
	UpdateAccount,
	UpdateTransaction,
	VersionedMutation
} from '@dukat/core/ledger';

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

export interface LedgerService {
	listAccounts(context: { userId: string; workspaceId: string }): Promise<unknown>;
	createAccount(
		context: { userId: string; workspaceId: string },
		input: CreateAccount
	): Promise<unknown>;
	updateAccount(
		context: { userId: string; workspaceId: string },
		accountId: string,
		input: UpdateAccount
	): Promise<unknown>;
	accountAction(
		context: { userId: string; workspaceId: string },
		accountId: string,
		action: 'delete' | 'archive' | 'restore',
		input: VersionedMutation
	): Promise<unknown>;
	listTransactions(
		context: { userId: string; workspaceId: string },
		accountId: string,
		includeTrashed?: boolean
	): Promise<unknown>;
	createTransaction(
		context: { userId: string; workspaceId: string },
		accountId: string,
		input: CreateTransaction
	): Promise<unknown>;
	updateTransaction(
		context: { userId: string; workspaceId: string },
		transactionId: string,
		input: UpdateTransaction
	): Promise<unknown>;
	transactionAction(
		context: { userId: string; workspaceId: string },
		transactionId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<unknown>;
	history(
		context: { userId: string; workspaceId: string },
		entityType: 'account' | 'transaction',
		entityId: string
	): Promise<unknown>;
}

export interface APIServices {
	auth: AuthenticationService;
	readiness(): Promise<unknown>;
	ledger: LedgerService;
	workspaces: WorkspaceService;
}
