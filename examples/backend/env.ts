import schema from './env.schema.ts';

export const { data: env } = schema.parse(process.env);
