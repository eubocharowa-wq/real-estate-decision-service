-- Reverses 0003_matching_bundle_dataset_type.up.sql, restoring the 0001 check.
--
-- Rows carrying a dataset_type 0001 never allowed are removed first: the old
-- constraint cannot be re-added while they exist, and they are bundles 0001's
-- schema had no way to store.

DELETE FROM matching_bundles
  WHERE dataset_type NOT IN (
    'synthetic_pilot', 'mixed_explicit', 'user_supplied_only', 'empty_pilot'
  );

ALTER TABLE matching_bundles
  DROP CONSTRAINT IF EXISTS matching_bundles_dataset_type_check;

ALTER TABLE matching_bundles
  ADD CONSTRAINT matching_bundles_dataset_type_check CHECK (
    dataset_type IN (
      'synthetic_pilot', 'mixed_explicit', 'user_supplied_only', 'empty_pilot'
    )
  );
