# ROLLBACK.md
> Auto-generated 2026-01-28

## Last 10 Commits
```
a8f3c2e1 feat: keekorok visualizer production
9b41d20c feat(admin): order event timeline + invoice viewer
f22e1a09 feat(mpesa): callback → order + invoice pdf
c7a3b011 feat(checkout): STK push polling UI
3d9aa880 feat(cart): zustand + cart_events keepalive
a112e4f5 feat(visualizer): Tier1 WebGL shader + BeforeAfter
b40f9c2d feat(db): drizzle schema 12 tables → neon push
5e1ac884 feat(auth): nextauth v5 google + roles
e9b03314 init: next.js 14 + tailwind + neon config
d402a1bb chore: initial commit
```

## Emergency Rollback
1. `git revert HEAD` — safe revert (new commit)
2. `git reset --hard HEAD~1` — hard reset (destructive)
3. Vercel Dashboard → Deployments → select previous → Redeploy
4. `npx drizzle-kit push` after reverting schema file

## Migration State
```
drizzle/
  0000_initial.sql
  0001_add_order_events.sql
  0002_add_cart_events.sql
  0003_add_invoices.sql
  0004_add_rooms.sql
  meta/_journal.json
```

Last push: npx drizzle-kit push @ 2026-01-28 14:22 EAT
Neon branch: ep-soft-silence-ato3kpea-pooler – production – in sync
