## node-red-contrib-iot-in-gcp

The creation of these nodes comes from the great possibilities <a href="https://cloud.google.com/gcp" target="_new">Google Cloud Platform</a> offers for IoT. 

In the package nodes for <a href="https://cloud.google.com/iot-core" target="_new">IoT Core</a>, <a href="https://cloud.google.com/pubsub/" target="_new">Pub/Sub</a> and <a href="https://cloud.google.com/bigquery/" target="_new">BigQuery</a> could be found, as well as some configuration ones in order to increase the usability of the previous commented ones.

The current nodes are:

1. iotcore device: creates the connection to the device defined in GCP. 
2. bigquery retrieve: makes BigQueries queries in a GCP project.
3. bigquery store: store information in a given BigQuery table.
4. pubsub retrieve: subscribes to PubSub subscription and retrieves all the messages published there.

Configuration nodes:
*  iotcore broker: makes the MQTT connection to the device in IoT Core and allow the communication.
* credentials: store the service account information allowing its reutization.


## Credits

The package develop by <a href="https://github.com/kolban-google" target="_new">Neil Kolban</a> <a href="https://github.com/GoogleCloudPlatform/node-red-contrib-google-cloud" target="_new">node-red-contrib-google-cloud</a>, where many interesting nodes related with GCP could be found.

GCP APIs <a href="https://cloud.google.com/apis/docs/overview" target="_new">documentation</a>, where the APIs are explained and many examples are provided for many programming languages.