/**
 * Vercel serverless entrypoint.
 * Vercel detects this file and wraps it as a function for every incoming request.
 */
import 'dotenv/config';
import 'reflect-metadata';

import app from '../src/api';

export default app;
