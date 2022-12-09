module.exports = function(RED) {
    "use strict";

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

    const STATUS_PUBLISHING = {
        fill: "blue",
        shape: "dot",
        text: "publishing"
    };

    const {PubSub} = require("@google-cloud/pubsub");

    /**
     * Extract JSON service account key from "google-cloud-credentials" config node.
     */
    function GetCredentials(node) {
        return JSON.parse(RED.nodes.getCredentials(node).account);
    }

    function PubSubReceive(config) {
        let pubsub       = null;
        let subscription = null;

        let credentials = null;
        if (config.account) {
            credentials = GetCredentials(config.account);
        }
        let projectId = config.projectId;
        if (!projectId || projectId.trim().length == 0) {
            projectId = null;
        }
        const keyFilename = config.keyFilename;

        RED.nodes.createNode(this, config);

        const node = this;

        let options = {};

        if (!config.subscription) {
            node.error('Subscription is required');
            return;
        }

        options.subscription = config.subscription;
        options.assumeJSON = config.assumeJSON;

        node.status(STATUS_DISCONNECTED);

        // Called when a new message is received from PubSub.
        function OnMessage(message) {
            if (message === null) {
                return;
            }

            const msg = {
                "payload": message.data,    // Save the payload data at msg.payload
                "message": message          // Save the original message at msg.message
            };

            // If the configuration property asked for JSON, then convert to an object.
            if (config.assumeJSON === true) {
                msg.payload = JSON.parse(RED.util.ensureString(message.data));
            }

            node.send(msg);
            message.ack();
        } // OnMessage


        function OnClose() {
            node.status(STATUS_DISCONNECTED);
            if (subscription) {
                subscription.close();  // No longer receive messages.
                subscription.removeListener('message', OnMessage);
                subscription.removeListener('error', OnClose);
                subscription = null;
            }
            pubsub = null;
        } // OnClose


        // We must have EITHER credentials or a keyFilename.  If neither are supplied, that
        // is an error.  If both are supplied, then credentials will be used.
        if (credentials) {
            pubsub = new PubSub({
                "projectId": projectId,
                "credentials": credentials
            });
        } else if (keyFilename) {
            pubsub = new PubSub({
                "projectId": projectId,
                "keyFilename": keyFilename
            });
        } else {
            pubsub = new PubSub({
                "projectId": projectId
			});
        }

        node.status(STATUS_CONNECTING);                              // Flag the node as connecting.
        pubsub.subscription(options.subscription).get().then((data) => {
            subscription = data[0];
            subscription.on('message', OnMessage);
            subscription.on('error',   OnClose);
            node.status(STATUS_CONNECTED);
        }).catch((reason) => {
            node.error(reason);
            node.status(STATUS_DISCONNECTED);
        });


        node.on("close", OnClose);
    } // PubSubReceive

    function  PubSubSend(config) {
        let topic  = null;
        let pubsub = null;
        const messageQueue = [];
        RED.nodes.createNode(this, config);

        const node = this;

        let credentials = null;
        if (config.account) {
            credentials = GetCredentials(config.account);
        }
	let projectId = config.projectId;
        if (!projectId || projectId.trim().length == 0) {
            projectId = null;
        }
        const keyFilename = config.keyFilename;

        if (!config.topic) {
            node.error('No topic supplied!');
            return;
        }

        node.status(STATUS_DISCONNECTED);

        // Called to publish a new message.
        async function OnInput(msg) {
            if (msg == null || !msg.payload || msg.payload == "") {
                return;
            }

            // If we don't have a topic, then this is likely because we have received a request to
            // publish a message while we are still waiting for access to the topic from GCP.
            if (topic === null) {
                messageQueue.push(msg);
                return;
            }
            node.status(STATUS_PUBLISHING);
            try {
                await topic.publish(RED.util.ensureBuffer(msg.payload));
                node.status(STATUS_CONNECTED);
            }
            catch(e) {
                node.status(STATUS_DISCONNECTED);
                node.error(e);
            }
        }

        function OnClose() {
            node.status(STATUS_DISCONNECTED);
            pubsub = null;
        }

        // We must have EITHER credentials or a keyFilename.  If neither are supplied, that
        // is an error.  If both are supplied, then credentials will be used.
        if (credentials) {
            pubsub = new PubSub({
                "projectId": projectId,
                "credentials": credentials
            });
        } else if (keyFilename) {
            pubsub = new PubSub({
                "projectId": projectId,
                "keyFilename": keyFilename
            });
        } else {
            pubsub = new PubSub({
                "projectId": projectId
			});
        }

        node.status(STATUS_CONNECTING);

        pubsub.topic(config.topic).get().then((data) => {
            topic = data[0];
            node.status(STATUS_CONNECTED);

            // We may have been asked to process messages BEFORE the topic access has been received.  In this case,
            // the messages will have been queued.  We pull the messages from the queue and publish them one at
            // a time.
            while(messageQueue.length > 0) {
                const msg = messageQueue.shift();
                topic.publish(RED.util.ensureBuffer(msg.payload));
            }
        }).catch((reason) => {
            node.status(STATUS_DISCONNECTED);
            node.error(reason);
        });

        node.on('close', OnClose);
        node.on('input', OnInput);
    } // PubSubSend

    RED.nodes.registerType("google-cloud-pubsub receive", PubSubReceive);
    RED.nodes.registerType("google-cloud-pubsub send", PubSubSend);
};
