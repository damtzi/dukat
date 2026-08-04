import type {
	CreateAccount,
	CreateBalanceCheck,
	CreateBalanceCorrection,
	CreateTransfer,
	CreateTransaction,
	UpdateAccount,
	UpdateTransaction,
	UpdateTransfer,
	UpdateBalanceCheck,
	VersionedMutation
} from '@dukat/core/ledger';

export interface AuthenticationService {
	handler(request: Request): Promise<Response>;
	api: {
		getSession(options: {
			headers: Headers;
		}): Promise<{ user: { id: string; email: string; emailVerified: boolean } } | null>;
		verifyPassword(options: { body: { password: string }; headers: Headers }): Promise<unknown>;
	};
}

export interface WorkspaceSummary {
	id: string;
	name: string;
	type: 'personal' | 'household';
	reportingCurrency: string | null;
	version: number;
	role?: 'owner' | 'member' | null;
}

export interface WorkspaceService {
	listAuthorized(userId: string): Promise<WorkspaceSummary[]>;
	findAuthorized(context: {
		userId: string;
		workspaceId: string;
	}): Promise<WorkspaceSummary | undefined>;
	createHousehold(
		userId: string,
		input: { name: string; reportingCurrency: string }
	): Promise<unknown>;
	updateHousehold(
		context: WorkspaceContext,
		input: { name?: string; reportingCurrency?: string; version: number }
	): Promise<unknown>;
	listMembers(context: WorkspaceContext): Promise<unknown>;
	listInvitations(context: WorkspaceContext): Promise<unknown>;
	invite(
		context: WorkspaceContext,
		input: { email: string; version: number; invitationUrl(token: string): string }
	): Promise<unknown>;
	revokeInvitation(context: WorkspaceContext, id: string, version: number): Promise<unknown>;
	resendInvitation(
		context: WorkspaceContext,
		id: string,
		input: { version: number; invitationUrl(token: string): string }
	): Promise<unknown>;
	acceptInvitation(userId: string, email: string, token: string): Promise<unknown>;
	changeMember(
		context: WorkspaceContext,
		userId: string,
		input: { action: 'promote' | 'demote' | 'remove'; version: number }
	): Promise<unknown>;
	leaveHousehold(context: WorkspaceContext, version: number): Promise<unknown>;
	deleteHousehold(
		context: WorkspaceContext,
		input: { version: number; idempotencyKey?: string }
	): Promise<unknown>;
	listRecoverable(userId: string): Promise<unknown>;
	restoreHousehold(context: WorkspaceContext, version: number): Promise<unknown>;
	accountDeletionPreflight(userId: string): Promise<unknown>;
	deleteAccount(userId: string): Promise<void>;
	deliverOutbox?(): Promise<void>;
}

export interface WorkspaceContext {
	userId: string;
	workspaceId: string;
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
	createTransfer(
		context: { userId: string; workspaceId: string },
		input: CreateTransfer
	): Promise<unknown>;
	listTransfers(
		context: { userId: string; workspaceId: string },
		accountId: string,
		includeTrashed?: boolean
	): Promise<unknown>;
	updateTransfer(
		context: { userId: string; workspaceId: string },
		transferId: string,
		input: UpdateTransfer
	): Promise<unknown>;
	transferAction(
		context: { userId: string; workspaceId: string },
		transferId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<unknown>;
	createBalanceCheck(
		context: { userId: string; workspaceId: string },
		input: CreateBalanceCheck
	): Promise<unknown>;
	listBalanceChecks(
		context: { userId: string; workspaceId: string },
		accountId: string,
		includeTrashed?: boolean
	): Promise<unknown>;
	listBalanceCorrections(
		context: { userId: string; workspaceId: string },
		accountId: string,
		includeTrashed?: boolean
	): Promise<unknown>;
	updateBalanceCheck(
		context: { userId: string; workspaceId: string },
		checkId: string,
		input: UpdateBalanceCheck
	): Promise<unknown>;
	createBalanceCorrection(
		context: { userId: string; workspaceId: string },
		input: CreateBalanceCorrection
	): Promise<unknown>;
	reconciliationAction(
		context: { userId: string; workspaceId: string },
		entityType: 'balance_check' | 'correction',
		entityId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<unknown>;
	history(
		context: { userId: string; workspaceId: string },
		entityType: 'account' | 'transaction' | 'transfer' | 'balance_check' | 'correction',
		entityId: string
	): Promise<unknown>;
}

export interface APIServices {
	auth: AuthenticationService;
	readiness(): Promise<unknown>;
	ledger: LedgerService;
	workspaces: WorkspaceService;
}
