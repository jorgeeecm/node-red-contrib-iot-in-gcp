module.exports = function(RED) {
    "use strict";
    const {BigQuery} = require('@google-cloud/bigquery');
    let bigquery;

    /**
     * Extract JSON service account key from "google-cloud-credentials" config node.
    */
    function GetCredentials(node) {
        return JSON.parse(RED.nodes.getCredentials(node).account);
    }

    //[START BIGQUERY QUERYING]
    function BigQueryRetrieve(config) {
        RED.nodes.createNode(this, config);
        this.projectId = config.projectId;
        
        const node = this;
        
        var credentials = null;
        if (config.account) {
            credentials = GetCredentials(config.account);
        }

        

        // Called when a message arrives at the node.
        async function Input(msg) {
            
            // Define the future query
            let query;

            if (msg.hasOwnProperty('payload')) {
                // We have a msg.payload, make sure it is a string.
                if ((typeof msg.payload === 'string' || msg.payload instanceof String) && msg.payload.trim().length > 0) {
                    query = msg.payload;
                } else {
                    node.error('Empty query or wrong type, please use STRING.');
                    return;
                }
            } else {
                node.error('No query found to execute.');
                return;
            } 

            // Make the query
            const results = await bigquery.query(query);
            
            msg.payload = results[0];
            node.send(msg);
        }


        // We must have EITHER credentials or a keyFilename.  If neither are supplied, that
        // is an error.  If both are supplied, then credentials will be used.
        if (credentials) {
            bigquery = new BigQuery({
                "projectId": node.projectId,
                "credentials": credentials
            });
        } else if (node.keyFilename) {
            bigquery = new BigQuery({
                "projectId": node.projectId,
                "keyFilename": node.keyFilename
            });
        } else {
            bigquery = new BigQuery({
                "projectId": node.projectId
            });
        }

        node.on("input", Input);
    } // BigQueryRetrieve
    //[END BIGQUERY QUERYING]

    RED.nodes.registerType("google-cloud-bigquery retrieve", BigQueryRetrieve);

    //[START BIGQUERY STORE]
    function BigQueryStore(config) {     
        RED.nodes.createNode(this, config);
        
        this.projectId = config.projectId;
        this.datasetId = config.datasetId;
        this.tableId = config.tableId;

        const node = this;

        var credentials = null;
        if (config.account) {
            credentials = GetCredentials(config.account);
        }

        async function insertRowsAsStream(msg) {

            var rows = msg.payload;

            // Insert data into a table
            const result = await bigquery
                .dataset(node.datasetId)
                .table(node.tableId)
                .insert(rows);
            
            node.log(RED._(`Inserted ${rows.length} rows with the following response: ${result}`));
        }

        // We must have EITHER credentials or a keyFilename.  If neither are supplied, that
        // is an error.  If both are supplied, then credentials will be used.
        if (credentials) {
            bigquery = new BigQuery({
                "projectId": node.projectId,
                "credentials": credentials
            });
        } else if (node.keyFilename) {
            bigquery = new BigQuery({
                "projectId": node.projectId,
                "keyFilename": node.keyFilename
            });
        } else {
            bigquery = new BigQuery({
                "projectId": node.projectId
            });
        }   
        
        node.on("input", insertRowsAsStream);
    }
    //[END BIGQUERY STORE]
    RED.nodes.registerType("google-cloud-bigquery store", BigQueryStore);
};