const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');
const { ADMIN_USERNAME } = require('./constants');

module.exports = function(passport, host) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${host}/auth/google/callback` 
      },
      async function(accessToken, refreshToken, profile, cb) {
        try {
            const [rows] = await pool.execute('SELECT * FROM users WHERE google_id = ?', [profile.id]);
            let user = rows[0];
    
            if (!user) {
                const username = profile.displayName.replace(/\s/g, '').toLowerCase() + '_google';
                console.log(`Inserting new user: ${profile.displayName} (Google ID: ${profile.id})`);
                const [result] = await pool.execute(
                    'INSERT INTO users (username, display_name, google_id) VALUES (?, ?, ?)',
                    [username, profile.displayName, profile.id]
                );
                const [newUserRows] = await pool.execute('SELECT * FROM users WHERE user_id = ?', [result.insertId]);
                user = newUserRows[0];
            }
            return cb(null, user);
        } catch (err) {
            console.error("Passport Google Strategy Error:", err);
            return cb(err);
        }
      }
    ));
    
    passport.serializeUser((user, done) => {
        done(null, user.user_id || user.id);
    });
    
    passport.deserializeUser(async (id, done) => {
        if (id === ADMIN_USERNAME) { 
             return done(null, { 
                user_id: 'ADMIN', 
                username: ADMIN_USERNAME,
                isAdmin: true 
            });
        }
        try {
            const [rows] = await pool.execute('SELECT * FROM users WHERE user_id = ?', [id]);
            done(null, rows[0]);
        } catch (err) {
            done(err);
        }
    });
};
