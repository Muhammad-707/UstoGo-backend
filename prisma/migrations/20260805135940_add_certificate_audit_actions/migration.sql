-- MASTER_PROMPT.md §6.17: certificate moderation (verify/reject) audit trail.
ALTER TYPE "audit_action" ADD VALUE 'CERTIFICATE_VERIFIED';
ALTER TYPE "audit_action" ADD VALUE 'CERTIFICATE_REJECTED';
