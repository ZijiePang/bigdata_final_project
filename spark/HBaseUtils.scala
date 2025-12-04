import org.apache.hadoop.hbase.client.{Connection, ConnectionFactory, Increment, Table}
import org.apache.hadoop.hbase.{HBaseConfiguration, TableName}
import org.apache.hadoop.hbase.util.Bytes

object HBaseUtils {

  private val conf = HBaseConfiguration.create()

  def getConnection(): Connection =
    ConnectionFactory.createConnection(conf)

  def getTable(conn: Connection, tableName: String): Table =
    conn.getTable(TableName.valueOf(tableName))

  def increment(table: Table,
                rowKey: String,
                family: String,
                qualifier: String,
                amount: Long): Unit = {
    val inc = new Increment(Bytes.toBytes(rowKey))
    inc.addColumn(Bytes.toBytes(family), Bytes.toBytes(qualifier), amount)
    table.increment(inc)
  }
}