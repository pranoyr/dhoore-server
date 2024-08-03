






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




// Define a route to fetch vehicles filtered by start and end locations
app.get('/api/vehicles', authenticateToken, (req, res) => {


  console.log(req.user)


  const { start, end } = req.query;
  
  if (!start || !end) {
    return res.status(400).json({ error: 'Start and end locations are required' });
  }

  const query = `
    SELECT rv.*, u.*, v.*
    FROM running_vehicles AS rv
    JOIN users AS u ON rv.user_id = u.user_id
    JOIN vehicles AS v ON rv.vehicle_id = v.vehicle_id
    WHERE rv.destination = ?

  `;
  

  db.all(query, [end], (err, rows) => {
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



app.get('/api/user-details', authenticateToken, (req, res) => {
  const phone_no = req.user.phone;

  const query = `
    SELECT * FROM users WHERE phone_number = ?
  `;

  db.get(query, [phone_no], (err, row) => {
    if (err) {
      console.error('Error querying user:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(row);
  });
})

app.post('/api/save-details', authenticateToken, (req, res) => {
  console.log("updating");

  const { userName, userLatitude, userLongitude, userGender, vehicleModel, vehicleNumber, vehicleType } = req.body;
  const phone_no = req.user.phone;
  const verified = "yes";

  // First, check if the user with this phone number already exists
  const checkUserQuery = `SELECT * FROM users WHERE phone_number = ?`;

  db.get(checkUserQuery, [phone_no], (err, row) => {
    if (err) {
      console.error('Error querying user:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (row) {
      // If the user exists, update the user record
      const updateUserQuery = `
        UPDATE users
        SET name = ?, verified = ?, curr_lat = ?, curr_long = ?, gender = ?
        WHERE phone_number = ?
      `;
      db.run(updateUserQuery, [userName, verified, userLatitude, userLongitude, userGender, phone_no], function (err) {
        if (err) {
          console.error('Error updating user:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        console.log('User details updated successfully');
      });
    } else {
      // If the user does not exist, insert a new record
      const insertUserQuery = `
        INSERT INTO users (name, verified, curr_lat, curr_long, gender, phone_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(insertUserQuery, [userName, verified, userLatitude, userLongitude, userGender, phone_no], function (err) {
        if (err) {
          console.error('Error inserting new user:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        console.log('User details saved successfully');
      });
    }

    // Now handle vehicle details
    const checkVehicleQuery = `SELECT * FROM vehicles WHERE licensePlate = ?`;

    db.get(checkVehicleQuery, [vehicleNumber], (err, vehicle) => {
      if (err) {
        console.error('Error querying vehicle:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (vehicle) {
        // If the vehicle exists, update the record
        const updateVehicleQuery = `
          UPDATE vehicles
          SET model = ?, vehicleType = ?
          WHERE licensePlate = ?
        `;
        db.run(updateVehicleQuery, [vehicleModel, vehicleType, vehicleNumber], function (err) {
          if (err) {
            console.error('Error updating vehicle:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }
          console.log('Vehicle details updated successfully');
          res.json({ message: 'Vehicle details updated successfully' });
        });
      } else {
        const curr_user_id = `SELECT user_id FROM users WHERE phone_number = ?`;

        db.get(curr_user_id, [phone_no], (err, row) => {
          if (err) {
            console.error('Error querying user:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          const user_id = row.user_id;

          const veh_id_to_delete = `SELECT vehicle_id FROM running_vehicles WHERE user_id = ?`;

          db.get(veh_id_to_delete, [user_id], (err, row) => {
            if (err) {
              console.error('Error querying vehicle:', err);
              return res.status(500).json({ error: 'Internal server error' });
            }

            if (row) {
              const vehicle_id = row.vehicle_id;
              const deleteVehicleQuery = `
                DELETE FROM vehicles WHERE vehicle_id = ?
              `;
              db.run(deleteVehicleQuery, [vehicle_id], function (err) {
                if (err) {
                  console.error('Error deleting vehicle:', err);
                  return res.status(500).json({ error: 'Internal server error' });
                }
                console.log('Vehicle details deleted successfully');
              });
            }

            // Insert new vehicle record
            const insertVehicleQuery = `
              INSERT INTO vehicles (model, licensePlate, vehicleType)
              VALUES (?, ?, ?)
            `;
            db.run(insertVehicleQuery, [vehicleModel, vehicleNumber, vehicleType], function (err) {
              if (err) {
                console.error('Error inserting new vehicle:', err);
                return res.status(500).json({ error: 'Internal server error' });
              }
              console.log('Vehicle details saved successfully');

              // Get the new vehicle_id
              const newVehicleIdQuery = `SELECT vehicle_id FROM vehicles WHERE licensePlate = ?`;
              db.get(newVehicleIdQuery, [vehicleNumber], (err, vehicle) => {
                if (err) {
                  console.error('Error querying new vehicle id:', err);
                  return res.status(500).json({ error: 'Internal server error' });
                }

                const vehicle_id = vehicle.vehicle_id;

                // Check if user already exists in running_vehicles
                const checkRunningVehicleQuery = `SELECT * FROM running_vehicles WHERE user_id = ?`;

                db.get(checkRunningVehicleQuery, [user_id], (err, runningVehicle) => {
                  if (err) {
                    console.error('Error querying running vehicle:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                  }

                  if (runningVehicle) {
                    // If exists, update the record
                    const updateRunningVehicleQuery = `
                      UPDATE running_vehicles
                      SET vehicle_id = ?, destination = NULL, status = NULL
                      WHERE user_id = ?
                    `;
                    db.run(updateRunningVehicleQuery, [vehicle_id, user_id], function (err) {
                      if (err) {
                        console.error('Error updating running vehicle:', err);
                        return res.status(500).json({ error: 'Internal server error' });
                      }
                      console.log('Running vehicle details updated successfully');
                      res.json({ message: 'Vehicle details saved successfully' });
                    });
                  } else {
                    // If not exists, insert a new record
                    const insertRunningVehicleQuery = `
                      INSERT INTO running_vehicles (user_id, vehicle_id, destination, status)
                      VALUES (?, ?, NULL, NULL)
                    `;
                    db.run(insertRunningVehicleQuery, [user_id, vehicle_id], function (err) {
                      if (err) {
                        console.error('Error inserting running vehicle:', err);
                        return res.status(500).json({ error: 'Internal server error' });
                      }
                      console.log('Running vehicle details saved successfully');
                      res.json({ message: 'Vehicle details saved successfully' });
                    });
                  }
                });
              });
            });
          });
        });
      }
    });
  });
});



// Other endpoints and server setup...
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
