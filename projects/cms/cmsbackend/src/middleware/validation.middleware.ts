import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';

export const validate =
  (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (result.success) {
      return next();
    }

    return res.status(400).json({
      success: false,
      errors: fieldErrors(result.error),
      requestId: req.id
    });
  };

function fieldErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message
  }));
}
