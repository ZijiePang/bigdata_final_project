import org.apache.spark.SparkConf
import org.apache.spark.streaming.{Seconds, StreamingContext}
import org.apache.spark.streaming.kafka010._
import org.apache.kafka.common.serialization.StringDeserializer
import org.json4s._
import org.json4s.jackson.JsonMethods._

object StreamEarthquakes {

  implicit val formats: DefaultFormats.type = DefaultFormats
  case class Quake(region: String, year: Int, magnitude: Double)

  def main(args: Array[String]): Unit = {

    val conf = new SparkConf().setAppName("pangzj-speed-layer-earthquakes")
    val ssc  = new StreamingContext(conf, Seconds(10)) // micro-batch every 10s

    val brokers  = sys.env("KAFKA_BROKERS")
    val username = sys.env("KAFKA_USERNAME")
    val password = sys.env("KAFKA_PASSWORD")

    val kafkaParams: Map[String, Object] = Map(
      "bootstrap.servers" -> brokers,
      "key.deserializer"  -> classOf[StringDeserializer],
      "value.deserializer"-> classOf[StringDeserializer],
      "group.id"          -> "pangzj-speed-consumer",
      "auto.offset.reset" -> "earliest",
      "enable.auto.commit"-> java.lang.Boolean.FALSE,
      "security.protocol" -> "SASL_SSL",
      "sasl.mechanism"    -> "SCRAM-SHA-512",
      "sasl.jaas.config"  ->
        s"""org.apache.kafka.common.security.scram.ScramLoginModule required username="$username" password="$password";"""
    )

    val topics = Set("pangzj_earthquake_events")

    val stream = KafkaUtils.createDirectStream[String, String](
      ssc,
      LocationStrategies.PreferConsistent,
      ConsumerStrategies.Subscribe[String, String](topics, kafkaParams)
    )

    // For each micro-batch
    stream.foreachRDD { rdd =>
      rdd.foreachPartition { partition =>
        if (partition.nonEmpty) {
          val conn  = HBaseUtils.getConnection()
          val table = HBaseUtils.getTable(conn, "pangzj_eq_speed")

          partition.foreach { record =>
            try {
              val json  = record.value()
              println(s"DEBUG: got Kafka record = $json")

              val quake = parse(json).extract[Quake]
              val rowKey = s"${quake.region}_${quake.year}"

              println(s"DEBUG: updating HBase rowKey=$rowKey mag=${quake.magnitude}")

              // Always increment num_quakes
              HBaseUtils.increment(table, rowKey, "q", "num_quakes", 1L)

              // Increment num_strong_quakes only if magnitude >= 5.0
              if (quake.magnitude >= 5.0) {
                HBaseUtils.increment(table, rowKey, "q", "num_strong_quakes", 1L)
              }

            } catch {
              case e: Exception =>
                System.err.println(s"ERROR: processing record ${record.value()}, err=$e")
                e.printStackTrace()
            }
          }

          table.close()
          conn.close()
        }
      }
    }

    ssc.start()
    ssc.awaitTermination()
  }
}