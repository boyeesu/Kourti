import { Router } from 'express';

import { db } from '../../db/pool.js';
import { asyncHandler } from '../../lib/http.js';

export const profilesRouter = Router();

profilesRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select *
      from public.profiles
      where user_id = $1
      limit 1
      `,
      [auth.userId]
    );

    res.status(200).json(result.rows[0] || null);
  })
);
