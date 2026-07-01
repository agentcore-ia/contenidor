export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function assertRequiredEnv(name) {
  if (!process.env[name]) {
    throw new AppError(`${name} is required`, 500, 'MISSING_ENV');
  }
}

export function requireRequestField(body, fieldName) {
  const value = body?.[fieldName];

  if (!value) {
    throw new AppError(`${fieldName} is required`, 400, 'BAD_REQUEST');
  }

  return value;
}
