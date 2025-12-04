'use strict';

// Load environment variables from .env file
require('dotenv').config({ path: '../.env' });

const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));

const mustache = require('mustache');
const filesystem = require('fs');
const { URL } = require('url');
const hbase = require('hbase');
const { Kafka } = require('kafkajs');

const hbaseUrl = new URL(process.argv[3]);

const hclient = hbase({
    host: hbaseUrl.hostname,
    path: hbaseUrl.pathname || '/',
    port: hbaseUrl.port,
    protocol: hbaseUrl.protocol.slice(0, -1), // "http:" -> "http"
    encoding: 'latin1'
});

// Helpers to decode HBase binary values
function bufToLong(b) {
    return Number(Buffer.from(b).readBigInt64BE());
}

function bufToDouble(b) {
    return Buffer.from(b).readDoubleBE(0);
}



const kafka = new Kafka({
  clientId: 'pangzj-earthquake-web',
  brokers: [process.env.KAFKA_BROKERS],
  ssl: true,
  sasl: {
    mechanism: 'scram-sha-512',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD
  }
});

const quakeProducer = kafka.producer();
(async () => {
  try {
    await quakeProducer.connect();
    console.log('Kafka producer connected');
  } catch (e) {
    console.error('Error connecting Kafka producer:', e);
  }
})();

app.use(express.static('public'));

// ===== Speed layer ingestion endpoint: form -> Kafka topic =====
app.post('/submit_earthquake', async (req, res) => {
    const region = req.body.region;
    const year = parseInt(req.body.year, 10);
    const magnitude = parseFloat(req.body.magnitude);

    if (!region || isNaN(year) || isNaN(magnitude)) {
        return res.status(400).send('Please provide valid region, year, and magnitude.');
    }

    const event = {
        region,
        year,
        magnitude
    };

    try {
        await quakeProducer.send({
            topic: 'pangzj_earthquake_events',
            messages: [
                { value: JSON.stringify(event) }
            ]
        });
        console.log('Sent event to Kafka:', event);
        res.send(`Submitted earthquake event: ${JSON.stringify(event)}`);
    } catch (err) {
        console.error('Error sending to Kafka:', err);
        res.status(500).send('Failed to send event to Kafka.');
    }
});


// Main route: /eq_stats.html?region=Indonesia&year=2019
app.get('/eq_stats.html', (req, res) => {
    const region = req.query['region'];
    const year = req.query['year'];

    if (!region || !year) {
        return res.send('Please provide both region and year.');
    }

    const rowKey = region + '_' + year;
    console.log('Looking up row key:', rowKey);

    // First: get batch stats from pangzj_eq_stats
    hclient
        .table('pangzj_eq_stats')
        .row(rowKey)
        .get((err, batchCells) => {
            if (err) {
                console.error('Error talking to HBase (batch table):', err);
                return res.send('Error talking to HBase.');
            }

            const batch = {};
            if (batchCells && batchCells.length) {
                batchCells.forEach(cell => {
                    const col = cell.column;
                    if (col === 'q:region') {
                        batch.region = cell.$.toString();
                    } else if (col === 'q:year') {
                        batch.year = cell.$.toString();
                    } else if (col === 'q:num_quakes') {
                        batch.num_quakes = bufToLong(cell.$);
                    } else if (col === 'q:num_strong_quakes') {
                        batch.num_strong_quakes = bufToLong(cell.$);
                    } else if (col === 'q:avg_mag') {
                        batch.avg_mag = bufToDouble(cell.$);
                    } else if (col === 'q:max_mag') {
                        batch.max_mag = bufToDouble(cell.$);
                    }
                });
            }

            // Second: get speed-layer deltas from pangzj_eq_speed
            hclient
                .table('pangzj_eq_speed')
                .row(rowKey)
                .get((err2, speedCells) => {
                    if (err2) {
                        console.error('Error talking to HBase (speed table):', err2);
                        // We can still render batch-only results
                    }

                    const speed = {};
                    if (speedCells && speedCells.length) {
                        speedCells.forEach(cell => {
                            const col = cell.column;
                            if (col === 'q:num_quakes') {
                                speed.num_quakes = bufToLong(cell.$);
                            } else if (col === 'q:num_strong_quakes') {
                                speed.num_strong_quakes = bufToLong(cell.$);
                            }
                        });
                    }

                    // Combine batch + speed
                    const totalQuakes =
                        (batch.num_quakes || 0) + (speed.num_quakes || 0);
                    const totalStrong =
                        (batch.num_strong_quakes || 0) + (speed.num_strong_quakes || 0);

                    const template = filesystem.readFileSync('result.mustache').toString();

                    const html = mustache.render(template, {
                        region: batch.region || region,
                        year: batch.year || year,
                        num_quakes: totalQuakes,
                        num_strong_quakes: totalStrong,
                        avg_mag: batch.avg_mag != null ? batch.avg_mag.toFixed(2) : 'N/A',
                        max_mag: batch.max_mag != null ? batch.max_mag.toFixed(1) : 'N/A'
                    });

                    res.send(html);
                });
        });
});


app.listen(3006, () => {
    console.log("Earthquake app running on port 3006");
});
