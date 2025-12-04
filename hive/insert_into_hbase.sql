-- Insert aggregated earthquake statistics into HBase table
INSERT OVERWRITE TABLE pangzj_eq_stats_hbase
SELECT
  concat(region, '_', year) AS region_year,
  region,
  year,
  num_quakes,
  avg_mag,
  max_mag,
  num_strong_quakes
FROM pangzj_eq_stats_by_region_year;