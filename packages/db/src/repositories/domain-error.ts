export type DomainErrorCode = 'not_found' | 'conflict' | 'invalid';

export class DomainError<Code extends DomainErrorCode = DomainErrorCode> extends Error {
	constructor(
		public readonly code: Code,
		message: string
	) {
		super(message);
		this.name = new.target.name;
	}
}
