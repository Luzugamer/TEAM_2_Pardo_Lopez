export interface InvalidParam {
  name: string;
  reason: string;
}

export interface ProblemDetailError {
  pointer: string;
  code: string;
  message: string;
}

export interface ProblemDetailsPayload {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  request_id?: string;
  errors?: ProblemDetailError[];
  invalid_params?: InvalidParam[];
  [key: string]: unknown;
}

export function normalizeProblemDetails(
  problem: ProblemDetailsPayload,
): ProblemDetailsPayload {
  const { invalid_params: invalidParams, ...canonicalProblem } = problem;
  const code = canonicalProblem.code || 'internal_error';
  const normalizedCode =
    code === 'REVISION_MISMATCH' || code === 'PRECONDITION_FAILED'
      ? 'stale_revision'
      : code.toLowerCase();

  return {
    ...canonicalProblem,
    code: normalizedCode,
    errors:
      canonicalProblem.errors ||
      (invalidParams || []).map(({ name, reason }) => ({
        pointer: name.startsWith('/')
          ? name
          : ['idempotency-key', 'if-match', 'x-request-id'].includes(
                name.toLowerCase(),
              )
            ? `/headers/${name.toLowerCase()}`
            : `/body/${name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`,
        code: 'invalid_parameter',
        message: reason,
      })),
  };
}

export class DomainException extends Error {
  public readonly problem: ProblemDetailsPayload;

  constructor(problem: ProblemDetailsPayload) {
    const normalizedProblem = normalizeProblemDetails(problem);
    super(normalizedProblem.detail);
    this.name = 'DomainException';
    this.problem = normalizedProblem;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  getStatus(): number {
    return this.problem.status;
  }

  getResponse(): ProblemDetailsPayload {
    return this.problem;
  }

  static badRequest(
    detail: string,
    invalidParams?: InvalidParam[],
    code = 'BAD_REQUEST',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:bad-request',
      title: 'Bad Request',
      status: 400,
      detail,
      code,
      invalid_params: invalidParams,
    });
  }

  static unauthorized(
    detail = 'Authentication credentials are missing or invalid.',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail,
      code: 'UNAUTHORIZED',
    });
  }

  static forbidden(
    detail = 'Insufficient permissions to perform this operation.',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:forbidden',
      title: 'Forbidden',
      status: 403,
      detail,
      code: 'FORBIDDEN',
    });
  }

  static notFound(detail: string, code = 'NOT_FOUND'): DomainException {
    return new DomainException({
      type: 'urn:problem:not-found',
      title: 'Not Found',
      status: 404,
      detail,
      code,
    });
  }

  static conflict(detail: string, code = 'CONFLICT'): DomainException {
    return new DomainException({
      type: 'urn:problem:conflict',
      title: 'Conflict',
      status: 409,
      detail,
      code,
    });
  }

  static idempotencyConflict(
    detail = 'Idempotency key has already been used with a different request payload.',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:idempotency-conflict',
      title: 'Idempotency Conflict',
      status: 409,
      detail,
      code: 'idempotency_key_reused',
    });
  }

  static preconditionFailed(
    detail: string,
    code = 'stale_revision',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:precondition-failed',
      title: 'Precondition Failed',
      status: 412,
      detail,
      code,
    });
  }

  static preconditionRequired(
    detail = "Header 'If-Match' is required for optimistic concurrency control on this resource.",
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:precondition-required',
      title: 'Precondition Required',
      status: 428,
      detail,
      code: 'precondition_required',
    });
  }

  static unprocessable(
    detail: string,
    invalidParams?: InvalidParam[],
    code = 'UNPROCESSABLE_ENTITY',
  ): DomainException {
    return new DomainException({
      type: 'urn:problem:unprocessable-entity',
      title: 'Unprocessable Entity',
      status: 422,
      detail,
      code,
      invalid_params: invalidParams,
    });
  }
}
