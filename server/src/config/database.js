import knex from 'knex';
import { connection } from './environment.js';
export const db = knex({ client: 'mysql2', connection, pool: { min: 0, max: 10 } });
