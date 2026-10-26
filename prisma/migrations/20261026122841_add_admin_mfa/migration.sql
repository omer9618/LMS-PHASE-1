-- AlterEnum
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'MFA_CHALLENGE';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "mfa_verified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_last_used_step" INTEGER,
ADD COLUMN     "mfa_secret_encrypted" TEXT;

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key" ON "mfa_recovery_codes"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
