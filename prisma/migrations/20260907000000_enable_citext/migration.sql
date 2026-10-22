-- Runs before init: users.email is CITEXT, so the extension must exist first.
CREATE EXTENSION IF NOT EXISTS "citext";
