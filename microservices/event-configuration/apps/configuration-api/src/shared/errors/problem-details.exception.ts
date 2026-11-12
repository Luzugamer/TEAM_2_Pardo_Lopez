import { HttpException, HttpStatus } from '@nestjs/common';
import {
  InvalidParam,
  ProblemDetailError,
  ProblemDetailsPayload,
  normalizeProblemDetails,
} from './domain.exception';

export { InvalidParam, ProblemDetailError, ProblemDetailsPayload };

export class ProblemDetailsException extends HttpException {
  public readonly problem: ProblemDetailsPayload;

  constructor(problem: ProblemDetailsPayload) {
    const normalizedProblem = normalizeProblemDetails(problem);
    super(normalizedProblem, normalizedProblem.status);
    this.problem = normalizedProblem;
  }

  static badRequest(detail: string, invalidParams?: InvalidParam[], code = 'BAD_REQUEST'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:bad-request',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      detail,
      code,
      invalid_params: invalidParams,
    });
  }

  static unauthorized(detail = 'Authentication credentials are missing or invalid.'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:unauthorized',
      title: 'Unauthorized',
      status: HttpStatus.UNAUTHORIZED,
      detail,
      code: 'UNAUTHORIZED',
    });
  }

  static forbidden(detail = 'Insufficient permissions to perform this operation.'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:forbidden',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      detail,
      code: 'FORBIDDEN',
    });
  }

  static notFound(detail: string, code = 'NOT_FOUND'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:not-found',
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail,
      code,
    });
  }

  static conflict(detail: string, code = 'CONFLICT'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:conflict',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail,
      code,
    });
  }

  static idempotencyConflict(detail = 'Idempotency key has already been used with a different request payload.'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:idempotency-conflict',
      title: 'Idempotency Conflict',
      status: HttpStatus.CONFLICT,
      detail,
      code: 'idempotency_key_reused',
    });
  }

  static preconditionFailed(detail: string, code = 'stale_revision'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:precondition-failed',
      title: 'Precondition Failed',
      status: HttpStatus.PRECONDITION_FAILED,
      detail,
      code,
    });
  }

  static preconditionRequired(detail = 'Header \'If-Match\' is required for optimistic concurrency control on this resource.'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:precondition-required',
      title: 'Precondition Required',
      status: HttpStatus.PRECONDITION_REQUIRED,
      detail,
      code: 'precondition_required',
    });
  }

  static unprocessable(detail: string, invalidParams?: InvalidParam[], code = 'UNPROCESSABLE_ENTITY'): ProblemDetailsException {
    return new ProblemDetailsException({
      type: 'urn:problem:unprocessable-entity',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail,
      code,
      invalid_params: invalidParams,
    });
  }
}

