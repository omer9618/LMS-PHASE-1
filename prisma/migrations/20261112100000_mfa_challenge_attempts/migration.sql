-- Guesses spent on an MFA challenge: the challenge is burned after a few wrong codes.
ALTER TABLE "auth_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
