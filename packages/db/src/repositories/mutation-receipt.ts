import { and, eq } from 'drizzle-orm';

import type { FinancialDatabase } from '../connection';
import { mutationReceipt } from '../schema';

export type FinancialTransaction = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];

export const serializeJson = (value: unknown) =>
	JSON.stringify(value, (_key, item) =>
		typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item
	);

export async function withMutationReceipt<T>(
	tx: FinancialTransaction,
	identity: { workspaceId: string; userId: string },
	operation: string,
	key: string,
	request: unknown,
	run: () => Promise<T>,
	conflict: () => Error
): Promise<T> {
	const requestJson = serializeJson(request);
	const [receipt] = await tx
		.select({
			requestJson: mutationReceipt.requestJson,
			responseJson: mutationReceipt.responseJson
		})
		.from(mutationReceipt)
		.where(
			and(
				eq(mutationReceipt.workspaceId, identity.workspaceId),
				eq(mutationReceipt.actorUserId, identity.userId),
				eq(mutationReceipt.operation, operation),
				eq(mutationReceipt.idempotencyKey, key)
			)
		)
		.limit(1);
	if (receipt) {
		if (receipt.requestJson !== requestJson) throw conflict();
		return JSON.parse(receipt.responseJson) as T;
	}
	const result = await run();
	await tx.insert(mutationReceipt).values({
		id: crypto.randomUUID(),
		workspaceId: identity.workspaceId,
		actorUserId: identity.userId,
		operation,
		idempotencyKey: key,
		requestJson,
		responseJson: serializeJson(result)
	});
	return result;
}
