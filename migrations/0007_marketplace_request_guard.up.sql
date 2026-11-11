CREATE TABLE marketplace_source_request_state (
  source_id text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  outcome_pending boolean NOT NULL DEFAULT false,
  stop_reason text CHECK (
    stop_reason IN ('access_denied', 'rate_limited', 'challenge')
  ),
  stopped_at timestamptz,
  updated_at timestamptz NOT NULL,
  CONSTRAINT marketplace_source_request_stop_consistent CHECK (
    (stop_reason IS NULL AND stopped_at IS NULL)
    OR (stop_reason IS NOT NULL AND stopped_at IS NOT NULL)
  ),
  CONSTRAINT marketplace_source_request_pending_consistent CHECK (
    stop_reason IS NULL OR outcome_pending = false
  )
);

COMMENT ON TABLE marketplace_source_request_state IS
  'Shared per-source rate/circuit state. A pending outcome fails closed; a stop is terminal until explicit operator maintenance.';
