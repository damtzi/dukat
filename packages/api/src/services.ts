import type {
	CreateAccount,
	ArchiveAccount,
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
import type { InsightsRepository } from '@dukat/db/repositories/insights';
import type { createExchangeRateRepository } from '@dukat/db/repositories/exchange-rates';
import type { PlanningRepository } from '@dukat/db/repositories/planning';

import type { ProfileImageCleanupService, ProfileImageService } from './profile-images';

export interface AuthenticationService {
	handler(request: Request): Promise<Response>;
	setProfileImage?(userId: string, image: string | null): Promise<void>;
	usernameAvailability(username: string): Promise<{
		available: boolean;
		username: string;
		message: string;
	}>;
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
		verifyPassword(options: { body: { password: string }; headers: Headers }): Promise<unknown>;
	};
}

export interface FavoriteSummary {
	id: string;
	path: string;
	label: string;
}

export interface FavoriteService {
	list(userId: string): Promise<FavoriteSummary[]>;
	add(userId: string, input: { path: string; label: string }): Promise<FavoriteSummary>;
	remove(userId: string, favoriteId: string): Promise<void>;
}

export interface WorkspaceSummary {
	id: string;
	name: string;
	type: 'personal' | 'household';
	reportingCurrency: string | null;
	version: number;
	role?: 'owner' | 'member' | null;
}

export interface HouseholdMember {
	userId: string;
	name: string;
	username: string;
	image: string | null;
	role: 'owner' | 'member';
	joinedAt: Date;
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
	listMembers(context: WorkspaceContext): Promise<HouseholdMember[]>;
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
	accountArchiveImpact(
		context: { userId: string; workspaceId: string },
		accountId: string
	): Promise<unknown>;
	accountAction(
		context: { userId: string; workspaceId: string },
		accountId: string,
		action: 'delete' | 'archive' | 'restore',
		input: VersionedMutation | ArchiveAccount
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
	trustedOrigins?: readonly string[];
	favorites: FavoriteService;
	profileImageCleanup?: ProfileImageCleanupService;
	profileImages?: ProfileImageService;
	readiness(): Promise<unknown>;
	ledger: LedgerService;
	planning: PlanningRepository;
	insights: InsightsRepository;
	exchangeRates?: ReturnType<typeof createExchangeRateRepository>;
	workspaces: WorkspaceService;
}
