# **Final Project Report — Earthquake Analytics**

## Introduction

For my final project, I built a **Lambda-style data pipeline** that analyzes **10 years of global earthquake events** using Spark, Hive, HBase, and a Node.js web application.

The goal was to create a system that:

1. Loads and cleans raw earthquake data (batch layer)
2. Produces yearly regional earthquake statistics (batch view)
3. Serves fast lookups using HBase (serving layer)
4. Displays results through a simple web form (presentation layer)

---

# Dataset Overview

I used the official USGS Earthquake API to download all earthquakes from **2015–2024** with magnitude ≥ 4.

Download command example:
```bash
for year in {2015..2024}
do
  echo "Downloading $year..."
  curl "https://earthquake.usgs.gov/fdsnws/event/1/query.csv?format=csv&starttime=${year}-01-01&endtime=${year}-12-31&minmagnitude=3" \
    -o earthquakes_${year}.csv
done
```

After this, I uploaded it into my own folder on HDFS:

```bash
hdfs dfs -mkdir -p /user/pangzj/earthquakes
hdfs dfs -put eq_*.csv /user/pangzj/earthquakes/
```

---

# Batch Layer (Spark)

### 1. Load the Hive table

I created a Hive external table with OpenCSVSerde (same as class examples):

```sql
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
```

### 2. Clean + transform in Spark
* Remove header rows
* Extract `year` from timestamp
* Extract the country/region from the `place` column
* Cast magnitude to double
* Filter invalid rows

### 3. Aggregate

I generated yearly per-region statistics:

* **Total earthquakes**
* **Average magnitude**
* **Maximum magnitude**
* **Number of strong quakes (≥ 5.0)**

Then saved as an ORC table:

```scala
statsByRegionYear.write
  .mode("overwrite")
  .format("orc")
  .saveAsTable("pangzj_eq_stats_by_region_year")
```

Example result:

| Region    | Year | Quakes | Avg Mag | Max Mag | Strong |
| --------- | ---- | ------ | ------- | ------- | ------ |
| Indonesia | 2019 | 2033   | 4.54    | 7.2     | 284    |

---

# Serving Layer (HBase)

I created an HBase table:

```rb
create 'pangzj_eq_stats', 'q'
```

Then I created a Hive → HBase mapping table using `HBaseStorageHandler`:

```sql
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
```

Then loaded the batch results:

```sql
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
```

HBase now supports super-fast row lookups like:

```
Indonesia_2019
Japan_2022
Chile_2015
```

---

# Web Layer (Node.js + Mustache)

I reused the exact pattern from the class's weather/route-delay app:

* `index.html` has a simple form for `region` + `year`
* `app.js` uses the `hbase` Node library to query HBase REST on port 8070
* `result.mustache` renders the stats inside a nice table

Example flow:

1. User visits:
   `http://localhost:3006/index.html`

2. Enters:
   * Region: Indonesia
   * Year: 2019

3. Node app hits:
   `http://ec2-34-230-47-10.compute-1.amazonaws.com:8070/pangzj_eq_stats/Indonesia_2019`

4. Renders result:

```
Earthquake Stats for Indonesia (2019)
--------------------------------------
Total Quakes: 2033
Average Magnitude: 4.54
Maximum Magnitude: 7.2
Strong Quakes (≥ 5.0): 284
```

---

# Speed Layer: Real-Time Earthquake Updates

Speed layer ingests user-submitted earthquake events in real time and updates summary statistics in HBase.

**Data flow:**

1. **Presentation → Kafka.**  
   I added a second web form (`submit-earthquake.html`) that lets users submit earthquake events with `region`, `year`, and `magnitude`. The Node.js app exposes a `POST /submit_earthquake` endpoint that creates JSON objects like:

   ```json
   {"region": "Indonesia", "year": 2019, "magnitude": 5.8}
   ```

   and sends them to Kafka topic `pangzj_earthquake_events` using the `kafkajs` client.

2. **Kafka → Spark Streaming → HBase (speed table).**
   The `StreamEarthquakes` Spark Streaming job subscribes to the `pangzj_earthquake_events` topic. For each JSON record it:

   * Parses it into a `Quake(region, year, magnitude)` case class
   * Builds row key `region_year` (e.g., `Indonesia_2019`)  
   * Increments `q:num_quakes` in HBase table `pangzj_eq_speed`
   * If `magnitude ≥ 5.0`, also increments `q:num_strong_quakes`

   The speed layer table is separate from the batch table:
   * Batch table: `pangzj_eq_stats` (Spark batch → Hive → HBase)
   * Speed table: `pangzj_eq_speed` (Spark Streaming → HBase direct)

3. **Combining batch and speed in the presentation layer.**
   When users request stats via `/eq_stats.html?region=R&year=Y`, the Node.js app:

   * Reads batch values from `pangzj_eq_stats`: `num_quakes`, `avg_mag`, `max_mag`
   * Reads real-time deltas from `pangzj_eq_speed` for the same row key
   * Adds the counters together before rendering

   For example: batch shows 2,033 earthquakes + speed shows 12 new = total 2,045 displayed.
