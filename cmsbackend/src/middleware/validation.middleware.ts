import { Request, Response, NextFunction } from 'express';

export const validate = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error: any) {
    const issues = error.errors?.map((issue: any) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })) || [{ field: 'unknown', message: error.message || 'Validation failed' }];

    return res.status(400).json({ 
      success: false,
      errors: issues 
    });
  }
};