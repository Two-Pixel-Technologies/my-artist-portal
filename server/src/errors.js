export class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.extra = extra;
  }
}
export const badRequest = (m, x) => new HttpError(400, m, x);
export const unauthorized = (m = 'Not signed in') => new HttpError(401, m);
export const forbidden = (m = 'Forbidden') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m, x) => new HttpError(409, m, x);
export const unprocessable = (m, x) => new HttpError(422, m, x);
