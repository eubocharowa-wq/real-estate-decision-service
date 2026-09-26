-- Align the durable status constraint with expertWorkflowStatusSchema.
-- Keep the legacy 'rejected' value accepted so applying this additive
-- migration never invalidates a row written by an older deployment.
ALTER TABLE expert_requests
  DROP CONSTRAINT expert_requests_status_check;

ALTER TABLE expert_requests
  ADD CONSTRAINT expert_requests_status_check CHECK (
    status IN (
      'draft', 'submitted', 'queued', 'assigned', 'in_progress',
      'waiting_for_user', 'waiting_for_external_info', 'completed',
      'cancelled', 'unable_to_complete', 'rejected'
    )
  );
