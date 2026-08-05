-- MASTER_PROMPT.md §5.2: "Ҳар дастрасии админ ба статистикаи усто → @Audit" —
-- same precedent as CONVERSATION_ACCESSED (BR-63).
ALTER TYPE "audit_action" ADD VALUE 'MASTER_STATS_ACCESSED';
