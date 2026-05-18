export class ApiError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string = "Bad Request") {
        super(message, 400);
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message: string = "Unauthorized") {
        super(message, 401);
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string = "Forbidden") {
        super(message, 403);
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string = "Not Found") {
        super(message, 404);
    }
}

export class ConflictError extends ApiError {
    constructor(message: string = "Conflict") {
        super(message, 409);
    }
}

