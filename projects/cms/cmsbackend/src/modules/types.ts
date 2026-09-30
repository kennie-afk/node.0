import type { Router } from 'express';
import type { ModelStatic, Model, Sequelize } from 'sequelize';

/** What a feature module contributes to the database layer. Models only; no service imports. */
export type ModelFactory = (sequelize: Sequelize) => Record<string, ModelStatic<Model>>;

/** What a feature module contributes to the HTTP layer. */
export interface RouteMount {
  path: string;
  router: Router;
}
