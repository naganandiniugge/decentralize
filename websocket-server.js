const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let clients = new Map(); // Map of userEmail to WebSocket

wss.on('connection', function connection(ws, req) {
    console.log('New client connected');

    // Expect client to send an initial message with their userEmail to identify themselves
    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register' && data.userEmail) {
                clients.set(data.userEmail, ws);
                ws.userEmail = data.userEmail;
                console.log(`Registered client with email: ${data.userEmail}`);
                return;
            }

            if (data.type === 'chat_message') {
                const { toUserEmail, fromUserEmail, message: chatMessage, timestamp } = data;
                console.log(`Received message from ${fromUserEmail} to ${toUserEmail}: ${chatMessage}`);

                // Send message to recipient if connected
                const recipientWs = clients.get(toUserEmail);
                if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                    recipientWs.send(JSON.stringify({
                        type: 'chat_message',
                        fromUserEmail,
                        message: chatMessage,
                        timestamp
                    }));
                    console.log(`Message forwarded to ${toUserEmail}`);
                } else {
                    console.log(`Recipient ${toUserEmail} not connected`);
                }
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        if (ws.userEmail) {
            clients.delete(ws.userEmail);
            console.log(`Client disconnected: ${ws.userEmail}`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started on ws://localhost:8080');
