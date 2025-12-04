-- Create HBase mapping table for earthquake statistics
CREATE EXTERNAL TABLE pangzj_eq_stats_hbase (
  region_year STRING,
  region STRING,
  year STRING,
  num_quakes BIGINT,
  avg_mag DOUBLE,
  max_mag DOUBLE,
  num_strong_quakes BIGINT
)
STORED BY 'org.apache.hadoop.hive.hbase.HBaseStorageHandler'
WITH SERDEPROPERTIES (
  'hbase.columns.mapping' =
    ':key,q:region,q:year,q:num_quakes#b,q:avg_mag#b,q:max_mag#b,q:num_strong_quakes#b'
)
TBLPROPERTIES ('hbase.table.name'='pangzj_eq_stats');