-- Corrects the matching_bundles.dataset_type check.
--
-- 0001 constrained the column to ('synthetic_pilot', 'mixed_explicit',
-- 'user_supplied_only', 'empty_pilot'), omitting 'manual_curated_pilot' —
-- the dataset_type a bundle gets when REDS_APPLICATION_MODE is not "demo"
-- and every entry comes from the manually curated real pilot dataset (see
-- datasetSnapshot() in src/buyer-journey/matching.ts). Any pilot-mode buyer
-- journey backed by PostgreSQL therefore failed to save its matching bundle
-- the moment a real curated object, not a synthetic or user-supplied one,
-- made the shortlist. The constraint follows the domain, not the other way
-- round.

ALTER TABLE matching_bundles
  DROP CONSTRAINT IF EXISTS matching_bundles_dataset_type_check;

ALTER TABLE matching_bundles
  ADD CONSTRAINT matching_bundles_dataset_type_check CHECK (
    dataset_type IN (
      'synthetic_pilot',
      'manual_curated_pilot',
      'mixed_explicit',
      'user_supplied_only',
      'empty_pilot'
    )
  );
