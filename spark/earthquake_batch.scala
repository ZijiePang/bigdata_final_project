import org.apache.spark.sql.functions._

// Load raw earthquake data from Hive table
val quakes = spark.table("pangzj_earthquakes_raw")

// Clean and filter the data
val cleaned = quakes.filter(col("event_time") =!= "time")

// Extract year, region, and cast magnitude to double
val enriched = cleaned.select(
  col("event_time"),
  substring(col("event_time"), 1, 4).as("year"),
  col("mag").cast("double"),
  trim(regexp_replace(col("place"), ".*,(\\s*)", "")).as("region")
).filter(
  col("mag").isNotNull && col("year").rlike("^[0-9]{4}$")
)

// Aggregate earthquake statistics by region and year
val statsByRegionYear = enriched
  .groupBy("region", "year")
  .agg(
    count("*").as("num_quakes"),
    avg("mag").as("avg_mag"),
    max("mag").as("max_mag"),
    sum(when(col("mag") >= 5.0, 1).otherwise(0)).as("num_strong_quakes")
  )
  .filter(col("region") =!= "")

// Save aggregated results as ORC table
statsByRegionYear.write
  .mode("overwrite")
  .format("orc")
  .saveAsTable("pangzj_eq_stats_by_region_year")

// Show top 20 regions by number of earthquakes
spark.sql("""
  SELECT region, year, num_quakes, avg_mag, max_mag, num_strong_quakes
  FROM pangzj_eq_stats_by_region_year
  ORDER BY num_quakes DESC
  LIMIT 20
""").show(false)