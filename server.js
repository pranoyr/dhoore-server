






const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const twilio = require('twilio');

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

// Dummy data for user location
const userLocation = {
  latitude: 0,
  longitude: 0
};



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



// // Endpoint to handle sending a message
// app.post('/api/send-message', authenticateToken, async (req, res) => {
//   const { recipient_id, content } = req.body;
//   const sender_phone = req.user.phone;

//   try {
//     // Get sender user ID
//     const sender = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [sender_phone]);

//     if (!sender) {
//       return res.status(400).json({ error: 'Invalid sender' });
//     }

//     // Insert the message
//     const query = `
//       INSERT INTO messages (sender_id, recipient_id, content, sent_at)
//       VALUES (?, ?, ?, datetime('now'))
//     `;
//     await dbRunAsync(query, [sender.user_id, recipient_id, content]);

//     res.json({ message: 'Message sent successfully' });
//   } catch (err) {
//     console.error('Error sending message:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });


// Endpoint to send OTP
app.post('/api/send-otp', (req, res) => {
  const { phone } = req.body;
  const formattedPhone = `+${phone}`;
  const otp = Math.floor(1000 + Math.random() * 9000).toString(); // Generate a random 4-digit OTP

  // Store OTP
  otps[phone] = otp;

  console.log(otp)
  res.json({ message: 'OTP sent' });

  // Send OTP via Twilio
  // client.messages
  //   .create({
  //     body: `Your OTP is ${otp}`,
  //     from: twilioPhoneNumber,
  //     to: formattedPhone,
  //   })
  //   .then(message => {
  //     console.log(`OTP sent to ${formattedPhone}: ${otp}`);
  //     res.json({ message: 'OTP sent' });
  //   })
  //   .catch(error => {
  //     console.error('Error sending OTP:', error);
  //     res.status(500).json({ error: 'Failed to send OTP' });
  //   });
});

// Endpoint for OTP verification
app.post('/api/verify-otp', (req, res) => {
  const { phone, otp } = req.body;

  // Verify OTP
  if (otps[phone] && otps[phone] === otp) {
    delete otps[phone]; // Clear the OTP after verification
    const token = jwt.sign({ phone }, SECRET_KEY, { expiresIn: '20s' });
    const refreshToken = jwt.sign({ phone }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    // Store refresh token (in a real app, you should store it securely, e.g., in a database)
    refreshTokens[refreshToken] = phone;

    res.json({ token, refreshToken });
  } else {
    res.status(401).json({ message: 'Invalid OTP' });
  }
});

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

// Endpoint for token refresh
app.post('/api/refresh-token', (req, res) => {
  const { refreshToken } = req.body;




  jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);

    const newToken = jwt.sign({ phone: user.phone }, SECRET_KEY, { expiresIn: '20s' });

    const newRefreshToken = jwt.sign({ phone: user.phone }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    res.json({ token: newToken , refreshToken: newRefreshToken });

  });
});



app.get('/api/stop-journey/' , authenticateToken, (req, res) => 
  {
    const phone_no = req.user.phone;
    const { status } = req.query;

    const destination = null;

    // update the status of the user to running and set the destination
    const query = `
      UPDATE running_vehicles
      SET status = ?, destination = ?
      WHERE user_id = (SELECT user_id FROM users WHERE phone_number = ?)`

  db.run(query, [status, destination, phone_no], function(err) {
    if (err) {
      console.error('Error updating user location:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json({ message: 'Journey stopped' });
   });

  });
  




app.get('/api/start-journey/' , authenticateToken, (req, res) => {
  {
    const phone_no = req.user.phone;
    const { status, destination } = req.query;


    // update the status of the user to running and set the destination
    const query = `
      UPDATE running_vehicles
      SET status = ?, destination = ?
      WHERE user_id = (SELECT user_id FROM users WHERE phone_number = ?)`
   

  db.run(query, [status, destination, phone_no], function(err) {
    if (err) {
      console.error('Error updating user location:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json({ message: 'Journey started' });
   });
  }});



// Define a route to fetch vehicles filtered by start and end locations
app.get('/api/vehicles', authenticateToken, (req, res) => {


  console.log(req.user)


  const { start, end } = req.query;
  
  if (!start || !end) {
    return res.status(400).json({ error: 'Start and end locations are required' });
  }


  //   excpet the phone number user
  const query = `
    SELECT rv.*, u.*, v.*
    FROM running_vehicles AS rv
    JOIN users AS u ON rv.user_id = u.user_id
    JOIN vehicles AS v ON rv.vehicle_id = v.vehicle_id
    WHERE rv.destination = ? and u.phone_number != ?


  `;
  

  db.all(query, [end, req.user.phone], (err, rows) => {
    if (err) {
      console.error('Error querying vehicles table:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    console.log(rows)
    res.json(rows); // Send JSON response with filtered vehicles data
  });
});



// Endpoint to update user location
app.post('/api/updateloc', authenticateToken, (req, res) => {
  const { lat, long } = req.body;
  const phone_no = req.user.phone;

  const query = `
    UPDATE users
    SET curr_lat = ?, curr_long = ?
    WHERE phone_number = ?
  `;

  db.run(query, [lat, long, phone_no], function(err) {
    if (err) {
      console.error('Error updating user location:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json({ message: 'Location updated successfully' });
  });
});





// Endpoint to get user location
app.get('/api/userloc', authenticateToken, (req, res) => {

  
  phone_no = req.user.phone;
  // add a + to the phone number
 

  console.log(phone_no)
  // get the location of the user from the db
  const query = `
     SELECT curr_lat, curr_long from users where phone_number like 
  ` + "'%" + phone_no + "%'";

  db.all(query, (err, rows) => {
    if (err) {
      console.error('Error querying vehicles table:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    console.log(rows)

    userLocation.latitude = rows[0].curr_lat;
    userLocation.longitude = rows[0].curr_long;

    console.log(userLocation)
    res.json(userLocation); // Send JSON response with filtered vehicles


  });
});



app.post('/api/save-details', authenticateToken, async (req, res) => {
  try {
    console.log("updating");

    const { userName, userLatitude, userLongitude, userGender, vehicleModel, vehicleNumber, vehicleType } = req.body;
    const phone_no = req.user.phone;
    const verified = "yes";

    // Check if the user with this phone number already exists
    const checkUserQuery = `SELECT * FROM users WHERE phone_number = ?`;
    const user = await dbGetAsync(checkUserQuery, [phone_no]);

    if (user) {
      // Update the user record
      const updateUserQuery = `
        UPDATE users
        SET name = ?, verified = ?, curr_lat = ?, curr_long = ?, gender = ?
        WHERE phone_number = ?
      `;
      await dbRunAsync(updateUserQuery, [userName, verified, userLatitude, userLongitude, userGender, phone_no]);
      console.log('User details updated successfully');
    } else {
      // Insert a new user record
      const insertUserQuery = `
        INSERT INTO users (name, verified, curr_lat, curr_long, gender, phone_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await dbRunAsync(insertUserQuery, [userName, verified, userLatitude, userLongitude, userGender, phone_no]);
      console.log('User details saved successfully');
    }

    // Check if the license plate is already linked to another user
    const checkLicensePlateQuery = `
      SELECT u.phone_number
      FROM vehicles v
      JOIN running_vehicles rv ON v.vehicle_id = rv.vehicle_id
      JOIN users u ON rv.user_id = u.user_id
      WHERE v.licensePlate = ? AND u.phone_number != ?
    `;
    const licensePlateOwner = await dbGetAsync(checkLicensePlateQuery, [vehicleNumber, phone_no]);

    if (licensePlateOwner) {
      return res.status(400).json({ error: 'This license plate is already linked with another user.' });
    }

    // Now handle vehicle details
    const checkVehicleQuery = `SELECT * FROM vehicles WHERE licensePlate = ?`;
    const vehicle = await dbGetAsync(checkVehicleQuery, [vehicleNumber]);

    let vehicle_id;
    if (vehicle) {
      // Update the vehicle record
      const updateVehicleQuery = `
        UPDATE vehicles
        SET model = ?, vehicleType = ?
        WHERE licensePlate = ?
      `;
      await dbRunAsync(updateVehicleQuery, [vehicleModel, vehicleType, vehicleNumber]);
      console.log('Vehicle details updated successfully');
      vehicle_id = vehicle.vehicle_id;
    } else {
      // Insert a new vehicle record
      const insertVehicleQuery = `
        INSERT INTO vehicles (model, licensePlate, vehicleType)
        VALUES (?, ?, ?)
      `;
      await dbRunAsync(insertVehicleQuery, [vehicleModel, vehicleNumber, vehicleType]);
      console.log('Vehicle details saved successfully');

      // Get the new vehicle_id
      const newVehicleIdQuery = `SELECT vehicle_id FROM vehicles WHERE licensePlate = ?`;
      const newVehicle = await dbGetAsync(newVehicleIdQuery, [vehicleNumber]);
      vehicle_id = newVehicle.vehicle_id;


      // delte the old vehicle id  from the vehicle by searching with user in the running vehicle
      const deleteVehicleQuery = `
        DELETE FROM vehicles 
        WHERE vehicle_id = (SELECT vehicle_id FROM running_vehicles WHERE user_id = (SELECT user_id FROM users WHERE phone_number = ?))
      `;
      await dbRunAsync(deleteVehicleQuery, [phone_no]);
      console.log('Vehicle details deleted successfully');
      
    }

    // Get user_id
    const curr_user_id = `SELECT user_id FROM users WHERE phone_number = ?`;
    const currentUser = await dbGetAsync(curr_user_id, [phone_no]);
    const user_id = currentUser.user_id;

    // Check if the user already has a running vehicle
    const checkRunningVehicleQuery = `SELECT * FROM running_vehicles WHERE user_id = ?`;
    const runningVehicle = await dbGetAsync(checkRunningVehicleQuery, [user_id]);

    if (runningVehicle) {
      // If exists, update the record
      const updateRunningVehicleQuery = `
        UPDATE running_vehicles
        SET vehicle_id = ?, destination = NULL, status = NULL
        WHERE user_id = ?
      `;
      await dbRunAsync(updateRunningVehicleQuery, [vehicle_id, user_id]);
      console.log('Running vehicle details updated successfully');
    } else {
      // If not exists, insert a new record
      const insertRunningVehicleQuery = `
        INSERT INTO running_vehicles (user_id, vehicle_id, destination, status)
        VALUES (?, ?, NULL, NULL)
      `;
      await dbRunAsync(insertRunningVehicleQuery, [user_id, vehicle_id]);
      console.log('Running vehicle details saved successfully');
    }

    res.json({ message: 'Details saved successfully' });

  } catch (err) {
    console.error('Error handling request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/user-details', authenticateToken, async (req, res) => {
  const phone_no = req.user.phone;

  const query = `
    SELECT * FROM users WHERE phone_number = ?
  `;

  try {
    const user = await dbGetAsync(query, [phone_no]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error querying user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// /api/vehicle-details
app.get('/api/vehicle-details', authenticateToken, async (req, res) => {

  const phone_no = req.user.phone;

  const query = `
    SELECT v.*
    FROM vehicles v
    JOIN running_vehicles rv ON v.vehicle_id = rv.vehicle_id
    JOIN users u ON rv.user_id = u.user_id
    WHERE u.phone_number = ?
  `;

  try {
    const vehicle = await dbGetAsync(query, [phone_no]);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json(vehicle);
  } catch (err) {
    console.error('Error querying vehicle:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



app.post('/api/update-user-details', authenticateToken, async (req, res) => {
  const phone_no = req.user.phone;
  const { name, gender, curr_lat, curr_long } = req.body;

  const query = `
    UPDATE users
    SET name = ?, gender = ?, curr_lat = ?, curr_long = ?
    WHERE phone_number = ?
  `;

  try {
    await dbRunAsync(query, [name, gender, curr_lat, curr_long, phone_no]);
    res.json({ message: 'User details updated successfully' });
  } catch (err) {
    console.error('Error updating user details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// body: {
//   vehicle_id: 29,
//   notused: null,
//   model: 'KTM adv 3900',
//   licensePlate: 'KL-01-DB-5628',
//   vehicleType: 'Bike'
// },



app.post('/api/update-vehicle-details', authenticateToken, async (req, res) => {



    const { _ , notused,  model, licensePlate, vehicleType} = req.body;



    phone_no = req.user.phone;

    // Check if the license plate is already linked to another user
    const checkLicensePlateQuery = `
    SELECT u.phone_number
    FROM vehicles v
    JOIN running_vehicles rv ON v.vehicle_id = rv.vehicle_id
    JOIN users u ON rv.user_id = u.user_id
    WHERE v.licensePlate = ? AND u.phone_number != ?
    `;
    const licensePlateOwner = await dbGetAsync(checkLicensePlateQuery, [licensePlate, phone_no]);

    if (licensePlateOwner) {
    return res.status(400).json({ error: 'This license plate is already linked with another user.' });
    }


    // Now handle vehicle details
    const checkVehicleQuery = `SELECT * FROM vehicles WHERE licensePlate = ?`;
    const vehicle = await dbGetAsync(checkVehicleQuery, [licensePlate]);

    let vehicle_id;
    if (vehicle) {
    // Update the vehicle record
    const updateVehicleQuery = `
      UPDATE vehicles
      SET model = ?, vehicleType = ?
      WHERE licensePlate = ?
    `;
    await dbRunAsync(updateVehicleQuery, [model, vehicleType, licensePlate]);
    console.log('Vehicle details updated successfully');
    vehicle_id = vehicle.vehicle_id;
    } else {
    // Insert a new vehicle record
    const insertVehicleQuery = `
      INSERT INTO vehicles (model, licensePlate, vehicleType)
      VALUES (?, ?, ?)
    `;
    await dbRunAsync(insertVehicleQuery, [model, licensePlate, vehicleType]);
    console.log('Vehicle details saved successfully');

    // Get the new vehicle_id
    const newVehicleIdQuery = `SELECT vehicle_id FROM vehicles WHERE licensePlate = ?`;
    const newVehicle = await dbGetAsync(newVehicleIdQuery, [licensePlate]);
    vehicle_id = newVehicle.vehicle_id;


    // delte the old vehicle id  from the vehicle by searching with user in the running vehicle
    const deleteVehicleQuery = `
      DELETE FROM vehicles 
      WHERE vehicle_id = (SELECT vehicle_id FROM running_vehicles WHERE user_id = (SELECT user_id FROM users WHERE phone_number = ?))
    `;
    await dbRunAsync(deleteVehicleQuery, [phone_no]);
    console.log('Vehicle details deleted successfully');
    
    }

    // Get user_id
    const curr_user_id = `SELECT user_id FROM users WHERE phone_number = ?`;
    const currentUser = await dbGetAsync(curr_user_id, [phone_no]);
    const user_id = currentUser.user_id;

    // Check if the user already has a running vehicle
    const checkRunningVehicleQuery = `SELECT * FROM running_vehicles WHERE user_id = ?`;
    const runningVehicle = await dbGetAsync(checkRunningVehicleQuery, [user_id]);

    if (runningVehicle) {
    // If exists, update the record
    const updateRunningVehicleQuery = `
      UPDATE running_vehicles
      SET vehicle_id = ?, destination = NULL, status = NULL
      WHERE user_id = ?
    `;
    await dbRunAsync(updateRunningVehicleQuery, [vehicle_id, user_id]);
    console.log('Running vehicle details updated successfully');
    } else {
    // If not exists, insert a new record
    const insertRunningVehicleQuery = `
      INSERT INTO running_vehicles (user_id, vehicle_id, destination, status)
      VALUES (?, ?, NULL, NULL)
    `;
    await dbRunAsync(insertRunningVehicleQuery, [user_id, vehicle_id]);
    console.log('Running vehicle details saved successfully');
    }

    res.json({ message: 'Details saved successfully' });

});




// New endpoint to send a message
app.post('/api/send-message', authenticateToken, async (req, res) => {
  const { recipient_phone, content } = req.body;
  const sender_phone = req.user.phone;

  try {
    // Get sender and recipient user IDs
    const sender = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [sender_phone]);
    const recipient = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [recipient_phone]);

    if (!sender || !recipient) {
      return res.status(400).json({ error: 'Invalid sender or recipient' });
    }

    // Insert the message
    const query = `
      INSERT INTO messages (sender_id, recipient_id, content)
      VALUES (?, ?, ?)
    `;
    await dbRunAsync(query, [sender.user_id, recipient.user_id, content]);

    res.json({ message: 'Message sent successfully' });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint to get messages for a conversation
app.get('/api/messages/:recipient_phone', authenticateToken, async (req, res) => {
  const sender_phone = req.user.phone;
  const { recipient_phone } = req.params;

  try {
    // Get sender and recipient user IDs
    const sender = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [sender_phone]);
    const recipient = await dbGetAsync('SELECT user_id FROM users WHERE phone_number = ?', [recipient_phone]);

    if (!sender || !recipient) {
      return res.status(400).json({ error: 'Invalid sender or recipient' });
    }

    // Get messages for the conversation
    const query = `
      SELECT m.*, 
             CASE WHEN m.sender_id = ? THEN 'sent' ELSE 'received' END AS message_type
      FROM messages m
      WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
      ORDER BY m.timestamp ASC
    `;
    const messages = await new Promise((resolve, reject) => {
      db.all(query, [sender.user_id, sender.user_id, recipient.user_id, recipient.user_id, sender.user_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json(messages);
  } catch (err) {
    console.error('Error retrieving messages:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Other endpoints and server setup...
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
