# Link to the Codebase

```
https://github.com/ZijiePang/bigdata_final_project
```

# Earthquake Analytics Using Lambda Architecture

A complete data pipeline that processes 10 years of global earthquake data using the Lambda Architecture pattern with Spark, Hive, HBase, and Node.js.

## Project Structure

```
final_project_submission/
├── README.md                 # This file
├── report.md                 # Detailed project report
├── hbase/
│   └── create_hbase_table.txt    # HBase table creation command
├── hive/
│   ├── create_earthquakes_raw.sql    # Raw data table schema
│   ├── create_states_table.sql      # HBase mapping table
│   └── insert_into_hbase.sql        # Data loading script
├── spark/
│   └── earthquake_batch.scala       # Batch processing logic
├── web/
│   ├── app.js                       # Node.js web server
│   ├── package.json                 # Dependencies
│   ├── result.mustache              # Result template
│   └── public/                      # Static web files
└── screenshots/                     # System screenshots
```

## Quick Start of Web App
```bash
ssh -i ~/.ssh/id_rsa ec2-user@ec2-52-20-203-80.compute-1.amazonaws.com

cd web/
npm install
node app.js 3006 http://ec2-34-230-47-10.compute-1.amazonaws.com:8070
```

## Run Spark Streaming job
```bash
ssh -i ~/.ssh/id_rsa hadoop@ec2-34-230-47-10.compute-1.amazonaws.com

spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name pangzj-speed-layer-earthquakes \
  --class StreamEarthquakes \
  /home/hadoop/pangzj/uber-final_project_pangzj-1.0-SNAPSHOT.jar
```

## Usage
- Batch lookup: `http://ec2-52-20-203-80.compute-1.amazonaws.com:3006/index.html`
- Real-time submit: `http://ec2-52-20-203-80.compute-1.amazonaws.com:3006/submit-earthquake.html`
