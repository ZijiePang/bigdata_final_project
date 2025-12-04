-- Create external table for raw earthquake data
CREATE EXTERNAL TABLE pangzj_earthquakes_raw (
  event_time STRING,
  latitude DOUBLE,
  longitude DOUBLE,
  depth DOUBLE,
  mag DOUBLE,
  magType STRING,
  nst INT,
  gap DOUBLE,
  dmin DOUBLE,
  rms DOUBLE,
  net STRING,
  id STRING,
  updated STRING,
  place STRING,
  type STRING,
  horizontalError DOUBLE,
  depthError DOUBLE,
  magError DOUBLE,
  magNst INT,
  status STRING,
  locationSource STRING,
  magSource STRING
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
STORED AS TEXTFILE
LOCATION '/user/pangzj/earthquakes'
TBLPROPERTIES ('skip.header.line.count'='1');