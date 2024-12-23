# from twilio.rest import Client

# account_sid = 'AC8d36d113442640c8d1ce9c2c1783fb62'
# auth_token = 'c12c32cfc06d096ac2f26e467fc204b4'
# client = Client(account_sid, auth_token)

# message = client.messages.create(
#   from_='+12517148234',
#   body='hoi',
#   to='+919746583169'
# )

# print(message.sid)


const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const WebSocket = require('ws');

const app = express();
const port = 3000;
const SECRET_KEY = 'your_secret_key'; // Replace with your actual secret key
const REFRESH_TOKEN_SECRET = 'your_refresh_token_secret'; // A different secret for refresh tokens
const REFRESH_TOKEN_EXPIRY = '7d'; // Example: 7 days
let refreshTokens = {}; // Store refresh tokens in memory for now

// Twilio configuration
const accountSid = 'AC8d36d113442640c8d1ce9c2c1783fb62'; // Replace with your Twilio Account SID
const authToken = 'c12c32cfc06d096ac2f26e467fc204b4'; // Replace with your Twilio Auth Token
const twilioPhoneNumber = '+12517148234'; // Replace with your Twilio phone number
const client = require('twilio')(accountSid, authToken);

app.use(bodyParser.json());

// Connect to SQLite database
const db = new sqlite3.Database('/Users/pranoy/code/dhoore-server/dhoore.db'); // Replace with your SQLite database file path

// Store OTPs temporarily
const otps = {};

// WebSocket setup
const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();

wss.on('connection', (ws, req) => {
  ws.on('message', async (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === 'authenticate') {
        // Authenticate WebSocket client
        const token = parsedMessage.token;
        const decoded = jwt.verify(token, SECRET_KEY);
        clients.set(decoded.phone, ws);
        console.log(`WebSocket client authenticated: ${decoded.phone}`);
      } else if (parsedMessage.type === 'message') {
        // Handle incoming message
        const { recipient_id, content, sender_phone } = parsedMessage.data;

        // Save message to database
        const sender = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [sender_phone]);
        if (!sender) throw new Error('Invalid sender');

        const query = `
          INSERT INTO messages (sender_id, recipient_id, content, sent_at)
          VALUES (?, ?, ?, datetime('now'))
        `;
        await dbRunAsync(query, [sender.user_id, recipient_id, content]);

        // Broadcast message to recipient if connected
        const recipientSocket = clients.get(recipient_id);
        if (recipientSocket) {
          recipientSocket.send(
            JSON.stringify({
              type: 'message',
              data: {
                sender_phone,
                recipient_id,
                content,
              },
            })
          );
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    for (const [phone, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(phone);
        console.log(`WebSocket client disconnected: ${phone}`);
      }
    }
  });
});

// Utility function to promisify db.get
const dbGetAsync = (query, params) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Utility function to promisify db.run
const dbRunAsync = (query, params) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Endpoint to send message (API fallback for non-WebSocket clients)
app.post('/api/send-message-by-id', authenticateToken, async (req, res) => {
  const { recipient_id, content } = req.body;
  const sender_phone = req.user.phone;

  try {
    // Get sender user ID
    const sender = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [sender_phone]);

    if (!sender) {
      return res.status(400).json({ error: 'Invalid sender' });
    }

    // Insert the message
    const query = `
      INSERT INTO messages (sender_id, recipient_id, content, sent_at)
      VALUES (?, ?, ?, datetime('now'))
    `;
    await dbRunAsync(query, [sender.user_id, recipient_id, content]);

    // Broadcast to WebSocket recipient if online
    const recipientSocket = clients.get(recipient_id);
    if (recipientSocket) {
      recipientSocket.send(
        JSON.stringify({
          type: 'message',
          data: {
            sender_phone,
            recipient_id,
            content,
          },
        })
      );
    }

    res.json({ message: 'Message sent successfully' });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add your remaining endpoints here...

console.log('WebSocket server running with HTTP server');
