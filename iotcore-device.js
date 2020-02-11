module.exports = function(RED) {
    "use strict";

    // [START CONST DEFINITON]

    const mqtt = require("mqtt");
    const jwt = require('jsonwebtoken');
    const fs = require("fs"); 

    const STATUS_CONNECTED = {
        fill:  "green",
        shape: "dot",
        text:  "connected"
    };

    const STATUS_DISCONNECTED = {
        fill:  "red",
        shape: "dot",
        text:  "disconnected"
    };

    const STATUS_CONNECTING = {
        fill:  "yellow",
        shape: "dot",
        text:  "connecting"
    };

    // [STOP CONST DEFINITON]


    // Create a Cloud IoT Core JWT for the given project id, signed with the given
    // private key.
    // [START iot_mqtt_jwt]
    function createJwt (projectId, privateKeyFile, algorithm) {
        // Create a JWT to authenticate this device. The device will be disconnected
        // after the token expires, and will have to reconnect with a new token. The
        // audience field should always be set to the GCP project id.
        const token = {
            'iat': Math.round(Date.now() / 1000),
            'exp': Math.round(Date.now() / 1000) + 20 * 60, // 20 minutes
            'aud': projectId,
        };
        const privateKey = fs.readFileSync(privateKeyFile);
        return jwt.sign(token, privateKey, {algorithm: algorithm});
    }
    // [END iot_mqtt_jwt]


    // [START MQTT BROKER]
    function MqttBrokerNode (config) {      
        RED.nodes.createNode(this, config);
        //const node = this;

        this.brokerHost = config.brokerHost;
        this.brokerPort = config.brokerPort;
        this.projectId = config.projectId;
        this.registryId = config.registryId;
        this.deviceId = config.deviceId;
        this.region = config.region;
        this.privateKeyFile = config.privateKeyFile;
        this.algorithm = config.algorithm;
        this.mqttClientId = `projects/${this.projectId}/locations/${this.region}/registries/${this.registryId}/devices/${this.deviceId}`;
        this.commandsQos = Number(config.commandsQos);
        this.configQos = Number(config.configQos);

        // Config node state
        this.brokerurl = `mqtts://${this.brokerHost}:${this.brokerPort}`;
        this.connected = false;
        this.connecting = false;
        this.closing = false;
        this.options = {};
        this.subscriptions = {};

        // Build options for passing to the MQTT.js API
        this.options.host = this.brokerHost;
        this.options.port = this.brokerPort;
        this.options.clientId = this.mqttClientId;
        this.options.username = 'unused';
        this.options.keepalive = Number(config.keepAlive);
        this.options.clean = ("true" == config.clean);
        this.options.reconnectPeriod = Number(config.reconnectPeriod);
        this.options.connectTimeout = Number(config.connectTimeout);
        this.options.protocol = "mqtts";
        this.options.secureProtocol = 'TLSv1_2_method';
        this.options.password = createJwt(this.projectId, this.privateKeyFile, this.algorithm);


        var node = this;

        this.connect = function () {

            node.log(RED._("google-cloud-iotcore broker"));
            if (!node.connected && !node.connecting) {
                
                node.status(STATUS_CONNECTING);
                this.connecting = true;

                node.client = mqtt.connect(node.options);
                node.client.setMaxListeners(0);
                node.log(RED._("google-cloud-iotcore broker2"));

                // Register successful connect or reconnect handler
                node.client.on('connect', function () {

                    node.connecting = false;
                    node.connected = true;
                    
                    node.status(STATUS_CONNECTED);

                    // Re-subscribe to stored topics
                    node.client.subscribe(`/devices/${node.deviceId}/config`, {qos: node.configQos});
                    node.client.subscribe(`/devices/${node.deviceId}/commands/#`, {qos: node.commandsQos});
                   
                });

                node.client.on("reconnect", function () {
                    node.status(STATUS_CONNECTING);
                });

                // Register disconnect handlers
                node.client.on('close', function () {
                    // refresh JWT token
                    node.client.options.password = createJwt(node.projectId, node.privateKeyFile, node.algorithm);
                    
                    if (node.connected || node.connecting) {
                        node.connected = false;
                        node.status(STATUS_DISCONNECTED);
                    }                    
                });

                // Register connect error handler
                node.client.on('error', function (error) {
                    // refresh JWT token
                    node.client.options.password = createJwt(node.projectId, node.privateKeyFile, node.algorithm);
                    
                    if (node.connecting) {
                        node.client.end();
                        node.connecting = false;
                    }
                    node.error(error);
                });
                
            }  
        };

        this.publish = function (msg) {
            node.log(RED._("google-cloud-iotcore start sending..."));
            if (node.connected) {
                node.log(RED._("google-cloud-iotcore starting sending..."));
                if (!Buffer.isBuffer(msg.payload)) {
                    if (typeof msg.payload === "object") {
                        msg.payload = JSON.stringify(msg.payload);
                    } else if (typeof msg.payload !== "string") {
                        msg.payload = "" + msg.payload;
                    }
                }

                var options = {
                    qos: msg.qos || 0,
                    retain: msg.retain || false
                };
                
                var mqttTopic = `/devices/${this.deviceId}/${msg.topic}`;

                node.client.publish(mqttTopic, msg.payload, options, function (err) {
                    if (err) {
                        node.error("error publishing message: " + err.toString());
                    }
                    return
                });
                node.log(RED._("google-cloud-iotcore published"));
            }
        };

        this.on('close', function () {
             this.closing = true;
             if (this.connected) {
                 this.client.end();
             } else if (this.connecting || this.client.reconnecting) {
                 this.client.end();
             } 
        }); 
    }
    // [END MQTT BROKER]
    RED.nodes.registerType("google-cloud-iotcore broker", MqttBrokerNode, {
        
    });

    function MqttDeviceNode(config) {
        RED.nodes.createNode(this, config);
        this.qos = config.qos || null;
        this.retain = config.retain;
        this.broker = config.broker;
        this.topic = config.topic;

        this.brokerConn = RED.nodes.getNode(this.broker);
        //this.topic = `` '/devices/' + this.brokerConn.deviceid + this.brokerConn.topic'/events';
        var node = this;

        if (this.brokerConn) {
            this.status(STATUS_DISCONNECTED);
            
            this.brokerConn.connect();

            // PAIR THE STATUS WITH THE MQTT BROKER
            this.brokerConn.client.on('connect', function(){
                node.status(STATUS_CONNECTED);
            });

            this.brokerConn.client.on("reconnect", function () {
                node.status(STATUS_CONNECTING);
            });

            this.brokerConn.client.on('close', function () {
                node.status(STATUS_DISCONNECTED);
            });


            this.on("input", function (msg) {
                if (msg.qos) {
                    msg.qos = parseInt(msg.qos);
                    if ((msg.qos !== 0) && (msg.qos !== 1)) {
                        msg.qos = null;
                    }
                }
                msg.qos = Number(msg.qos || node.qos || 0);
                msg.retain = msg.retain || node.retain || false;
                msg.retain = ((msg.retain === true) || (msg.retain === "true")) || false;
                
                if (msg.topic){
                    if (msg.topic !== "events" && msg.topic !== "state"){
                        msg.topic = node.topic;
                    }
                }
                else{
                    msg.topic = node.topic;
                } 

                if (msg.hasOwnProperty("payload")) {
                    node.log(RED._("google-cloud-iotcore sending..."));
                    this.brokerConn.publish(msg);  // send the message
                }
                else{
                    this.error("No message provided")
                }
            });

            // Register subscription handler
            this.brokerConn.client.on('message', function (topic, message){
                
                const msg = {
                    "payload": Buffer.from(message, 'base64').toString('ascii'),    // Save the payload data at msg.payload
                    "message": message          // Save the original message at msg.message
                };

                if (topic === `/devices/${node.brokerConn.deviceId}/config`) {
                    node.send([msg,]);
                } else if (topic === `/devices/${node.brokerConn.deviceId}/commands`) {
                    node.send([,msg]);
                }

                node.log(RED._(`google-cloud-iotcore: ${message} have been send with the incorrect topic ${topic}`));
            });          
            

        } else {
            this.error("No MQTT broker provided");
        }
    }
    RED.nodes.registerType("google-cloud-iotcore device", MqttDeviceNode);
};
