-- This intentionally fails transactionally if unable_to_complete rows exist.
-- Removing real expert outcomes to make a rollback pass is not acceptable.
ALTER TABLE expert_requests
  DROP CONSTRAINT expert_requests_status_check;

ALTER TABLE expert_requests
  ADD CONSTRAINT expert_requests_status_check CHECK (
    status IN (
      'draft', 'submitted', 'queued', 'assigned', 'in_progress',
      'waiting_for_user', 'waiting_for_external_info', 'completed',
      'cancelled', 'rejected'
    )
  );
