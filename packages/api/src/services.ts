import type {
	Account,
	AccountArchiveImpact,
	CreateAccount,
	ArchiveAccount,
	BalanceCheck,
	Correction,
	CreateBalanceCheck,
	CreateBalanceCorrection,
	CreateHouseholdExpense,
	CreateSettlementPayment,
	CreateRefund,
	CreateTransfer,
	CreateTransaction,
	HistoryEntry,
	HouseholdExpense,
	SettlementBalance,
	SettlementPayment,
	Transaction,
	TransactionSearch,
	Transfer,
	UpdateAccount,
	UpdateHouseholdExpense,
	UpdateTransaction,
	UpdateTransfer,
	UpdateBalanceCheck,
	VersionedMutation
} from '@dukat/core/ledger';
import type { InsightsRepository } from '@dukat/db/repositories/insights';
import type { createExchangeRateRepository } from '@dukat/db/repositories/exchange-rates';
import type { PlanningRepository } from '@dukat/db/repositories/planning';
import type { BudgetRepository } from '@dukat/db/repositories/budgets';
import type { ExportRepository } from '@dukat/db/repositories/exports';
import type { MyOverview } from '@dukat/core/overview';

import type { ProfileImageCleanupService, ProfileImageService } from './profile-images';

export interface AuthenticationService {
	handler(request: Request): Promise<Response>;
	accessStatus?(userId: string): Promise<
		| {
				isAdmin: boolean;
				disabledAt: Date | null;
				deletionRequestedAt: Date | null;
		  }
		| undefined
	>;
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

export interface AdministrationService {
	registrationOpen(): Promise<boolean>;
	setRegistrationOpen(open: boolean): Promise<{ registrationOpen: boolean }>;
	listUsers(): Promise<unknown[]>;
	listOperationalJobs(): Promise<unknown[]>;
	setUserDisabled(userId: string, disabled: boolean): Promise<unknown>;
	restoreAccount(userId: string): Promise<unknown>;
	purgeExpiredAccounts(): Promise<{ id: string }[]>;
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

export interface OverviewService {
	get(userId: string): Promise<MyOverview>;
}

type LedgerContext = { userId: string; workspaceId: string };
type TransactionMutationResult = {
	transaction: Transaction;
	balanceMinor: string;
	negativeBalance: boolean;
};
type AccountActionResult =
	| { deleted: true; negativeBalance: false }
	| Account
	| (Account & {
			planningImpact: { stoppedRecurring: number; cancelledOneTime: number };
	  });

export interface LedgerService {
	listAccounts(context: LedgerContext): Promise<Account[]>;
	createAccount(context: LedgerContext, input: CreateAccount): Promise<Account>;
	updateAccount(context: LedgerContext, accountId: string, input: UpdateAccount): Promise<Account>;
	accountArchiveImpact(context: LedgerContext, accountId: string): Promise<AccountArchiveImpact>;
	accountAction(
		context: LedgerContext,
		accountId: string,
		action: 'delete' | 'archive' | 'restore',
		input: VersionedMutation | ArchiveAccount
	): Promise<AccountActionResult>;
	listTransactions(
		context: LedgerContext,
		accountId: string,
		includeTrashed?: boolean
	): Promise<Transaction[]>;
	searchTransactions(context: LedgerContext, filters: TransactionSearch): Promise<Transaction[]>;
	listHouseholdExpenses(
		context: LedgerContext,
		includeTrashed?: boolean
	): Promise<HouseholdExpense[]>;
	createHouseholdExpense(
		context: LedgerContext,
		input: CreateHouseholdExpense
	): Promise<HouseholdExpense>;
	updateHouseholdExpense(
		context: LedgerContext,
		expenseId: string,
		input: UpdateHouseholdExpense
	): Promise<HouseholdExpense>;
	householdExpenseAction(
		context: LedgerContext,
		expenseId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<HouseholdExpense>;
	listSettlementPayments(
		context: LedgerContext,
		includeTrashed?: boolean
	): Promise<SettlementPayment[]>;
	listSettlementBalances(context: LedgerContext): Promise<SettlementBalance[]>;
	createSettlementPayment(
		context: LedgerContext,
		input: CreateSettlementPayment
	): Promise<SettlementPayment>;
	settlementPaymentAction(
		context: LedgerContext,
		paymentId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<SettlementPayment>;
	createTransaction(
		context: LedgerContext,
		accountId: string,
		input: CreateTransaction
	): Promise<TransactionMutationResult>;
	createRefund(
		context: LedgerContext,
		expenseId: string,
		input: CreateRefund
	): Promise<TransactionMutationResult>;
	updateTransaction(
		context: LedgerContext,
		transactionId: string,
		input: UpdateTransaction
	): Promise<TransactionMutationResult>;
	transactionAction(
		context: LedgerContext,
		transactionId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<TransactionMutationResult>;
	createTransfer(context: LedgerContext, input: CreateTransfer): Promise<Transfer>;
	listTransfers(
		context: LedgerContext,
		accountId: string,
		includeTrashed?: boolean
	): Promise<Transfer[]>;
	updateTransfer(
		context: LedgerContext,
		transferId: string,
		input: UpdateTransfer
	): Promise<Transfer>;
	transferAction(
		context: LedgerContext,
		transferId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<Transfer>;
	createBalanceCheck(context: LedgerContext, input: CreateBalanceCheck): Promise<BalanceCheck>;
	listBalanceChecks(
		context: LedgerContext,
		accountId: string,
		includeTrashed?: boolean
	): Promise<BalanceCheck[]>;
	listBalanceCorrections(
		context: LedgerContext,
		accountId: string,
		includeTrashed?: boolean
	): Promise<Correction[]>;
	updateBalanceCheck(
		context: LedgerContext,
		checkId: string,
		input: UpdateBalanceCheck
	): Promise<BalanceCheck>;
	createBalanceCorrection(
		context: LedgerContext,
		input: CreateBalanceCorrection
	): Promise<Correction>;
	reconciliationAction(
		context: LedgerContext,
		entityType: 'balance_check' | 'correction',
		entityId: string,
		action: 'trash' | 'restore',
		input: VersionedMutation
	): Promise<BalanceCheck | Correction>;
	history(
		context: LedgerContext,
		entityType:
			| 'account'
			| 'transaction'
			| 'household_expense'
			| 'settlement_payment'
			| 'transfer'
			| 'balance_check'
			| 'correction',
		entityId: string
	): Promise<HistoryEntry[]>;
}

export interface APIServices {
	administration?: AdministrationService;
	auth: AuthenticationService;
	exports?: ExportRepository;
	trustedOrigins?: readonly string[];
	favorites: FavoriteService;
	profileImageCleanup?: ProfileImageCleanupService;
	profileImages?: ProfileImageService;
	readiness(): Promise<unknown>;
	ledger: LedgerService;
	planning: PlanningRepository;
	budgets?: BudgetRepository;
	overview?: OverviewService;
	insights: InsightsRepository;
	exchangeRates?: ReturnType<typeof createExchangeRateRepository>;
	workspaces: WorkspaceService;
}
