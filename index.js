const express = require("express");
const app = express();
// Load environment variables from .env.local
require('dotenv').config({ path: './.env.local' }); 

let port = process.env.PORT || 3000;
const path = require("path");
const methodOverride = require("method-override");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const mysql = require('mysql2/promise');

// Passport Authentication Imports
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 1. IMPORT VERCEL BLOB SDK
const { put } = require("@vercel/blob");

// --- DATABASE CONFIGURATION ---
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cep_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 2. CONFIGURE MULTER FOR IN-MEMORY STORAGE
const upload = multer({ storage: multer.memoryStorage() });
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// --- PASSPORT SETUP ---
const ADMIN_USERNAME = "admin";
const DEPLOYED_URL = "https://cep-i2it.vercel.app";
const HOST = process.env.NODE_ENV === 'production' ? DEPLOYED_URL : `http://localhost:${port}`;

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${HOST}/auth/google/callback` 
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE google_id = ?', [profile.id]);
        let user = rows[0];

        if (!user) {
            const username = profile.displayName.replace(/\s/g, '').toLowerCase() + '_google';
            const [result] = await pool.execute(
                'INSERT INTO users (username, display_name, google_id) VALUES (?, ?, ?)',
                [username, profile.displayName, profile.id]
            );
            const [newUserRows] = await pool.execute('SELECT * FROM users WHERE user_id = ?', [result.insertId]);
            user = newUserRows[0];
        }
        return cb(null, user);
    } catch (err) {
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


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Configure Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Authentication Check Middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { 
        return next(); 
    }
    if (req.session.isAdmin) {
         req.user = { 
            user_id: 'ADMIN', 
            username: ADMIN_USERNAME,
            isAdmin: true 
        };
        return next();
    }
    res.redirect('/login');
}


// ------------------- LOGIN PART ------------------- //
const ADMIN_PASSWORD = "12345";

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  const error = req.session.authError;
  req.session.authError = null; 
  res.render("login.ejs", { error });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true; 
    res.redirect("/posts");
  } else {
    req.session.authError = "Invalid username or password";
    res.redirect("/login");
  }
});

// --- GOOGLE AUTH ROUTES ---
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/posts');
  });

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/posts'); 
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/login');
    });
});

// ------------------- POSTS PART (Secured) ------------------- //

app.get("/posts", ensureAuthenticated, async (req, res) => { 
  try {
      const [rows] = await pool.execute(`
          SELECT r.*, u.username as author_username, u.display_name, i.item_name 
          FROM reviews r
          JOIN users u ON r.user_id = u.user_id
          JOIN items i ON r.item_id = i.item_id
          ORDER BY r.created_at DESC
      `);

      // Map DB names to EJS expected names if necessary
      const formattedPosts = rows.map(post => ({
          id: post.review_id,
          username: post.display_name || post.author_username,
          itemName: post.item_name,
          content: post.content,
          rating: post.rating,
          image: post.image_url,
          createdAt: post.created_at,
          authorId: post.user_id
      }));

      res.render("index.ejs", { 
          posts: formattedPosts,
          currentUser: req.user
      });
  } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).send("Internal Server Error");
  }
});

app.get("/posts/new", ensureAuthenticated, (req, res) => {
  res.render("new.ejs");
});

app.post("/posts", ensureAuthenticated, upload.single("image"), async (req, res) => {
  let { content, rating, itemName } = req.body; 
  let imageUrl = null; 

  if (req.file) {
    try {
      const blob = await put(`posts/${uuidv4()}-${req.file.originalname}`, req.file.buffer, {
        access: 'public', 
        contentType: req.file.mimetype,
        token: BLOB_READ_WRITE_TOKEN
      });
      imageUrl = blob.url;
    } catch (error) {
      console.error("Vercel Blob Upload Error:", error);
    }
  }
  
  try {
      // 1. Get or Create Item
      let [itemRows] = await pool.execute('SELECT item_id FROM items WHERE item_name = ?', [itemName]);
      let itemId;
      if (itemRows.length === 0) {
          const [result] = await pool.execute('INSERT INTO items (item_name) VALUES (?)', [itemName]);
          itemId = result.insertId;
      } else {
          itemId = itemRows[0].item_id;
      }

      // 2. Insert Review
      const userId = req.user.user_id;
      // Handle Admin posting (if allowed, currently Admin uses 'ADMIN' ID which won't work in DB if FK is INT)
      // For this project, we'll assume Admin is mapped to a real user record if they post.
      // If req.user.user_id is 'ADMIN', we should probably have a fallback or a specific Admin user in DB.
      let dbUserId = userId === 'ADMIN' ? 1 : userId; 

      await pool.execute(
          'INSERT INTO reviews (user_id, item_id, content, rating, image_url) VALUES (?, ?, ?, ?, ?)',
          [dbUserId, itemId, content, Number(rating), imageUrl]
      );

      res.redirect("/posts");
  } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).send("Error creating post");
  }
});

app.get("/posts/:id", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  try {
      const [rows] = await pool.execute(`
          SELECT r.*, u.username as author_username, u.display_name, i.item_name 
          FROM reviews r
          JOIN users u ON r.user_id = u.user_id
          JOIN items i ON r.item_id = i.item_id
          WHERE r.review_id = ?
      `, [id]);
      
      if (rows.length === 0) return res.status(404).send("Post not found");

      const post = {
          id: rows[0].review_id,
          username: rows[0].display_name || rows[0].author_username,
          itemName: rows[0].item_name,
          content: rows[0].content,
          rating: rows[0].rating,
          image: rows[0].image_url,
          createdAt: rows[0].created_at
      };

      res.render("singlepost.ejs", { post });
  } catch (error) {
      res.status(500).send("Error fetching post");
  }
});

app.get("/posts/:id/edit", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  try {
      const [rows] = await pool.execute('SELECT * FROM reviews WHERE review_id = ?', [id]);
      if (rows.length === 0) return res.status(404).send("Post not found");
      
      const post = rows[0];
      const isAuthor = req.user && (req.user.user_id === post.user_id || req.user.isAdmin);
      
      if (!isAuthor) {
          return res.status(403).send("Forbidden - You can only edit your own posts.");
      }

      // Fetch item name for the form
      const [itemRows] = await pool.execute('SELECT item_name FROM items WHERE item_id = ?', [post.item_id]);
      post.itemName = itemRows[0].item_name;
      post.id = post.review_id; // For EJS compatibility

      res.render("edit.ejs", { post });
  } catch (error) {
      res.status(500).send("Error");
  }
});

app.patch("/posts/:id", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  let { content, rating, itemName } = req.body; 

  try {
      const [rows] = await pool.execute('SELECT * FROM reviews WHERE review_id = ?', [id]);
      if (rows.length === 0) return res.status(404).send("Post not found");
      
      const post = rows[0];
      const isAuthor = req.user && (req.user.user_id === post.user_id || req.user.isAdmin);

      if (!isAuthor) {
          return res.status(403).send("Forbidden");
      }

      // 1. Get or Create Item
      let [itemRows] = await pool.execute('SELECT item_id FROM items WHERE item_name = ?', [itemName]);
      let itemId;
      if (itemRows.length === 0) {
          const [result] = await pool.execute('INSERT INTO items (item_name) VALUES (?)', [itemName]);
          itemId = result.insertId;
      } else {
          itemId = itemRows[0].item_id;
      }

      await pool.execute(
          'UPDATE reviews SET content = ?, rating = ?, item_id = ?, updated_at = NOW() WHERE review_id = ?',
          [content, Number(rating), itemId, id]
      );

      res.redirect("/posts");
  } catch (error) {
      res.status(500).send("Error updating post");
  }
});

app.delete("/posts/:id", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  try {
      const [rows] = await pool.execute('SELECT * FROM reviews WHERE review_id = ?', [id]);
      if (rows.length === 0) return res.status(404).send("Post not found");
      
      const post = rows[0];
      const isAuthor = req.user && (req.user.user_id === post.user_id || req.user.isAdmin);

      if (!isAuthor) {
          return res.status(403).send("Forbidden");
      }
      
      await pool.execute('DELETE FROM reviews WHERE review_id = ?', [id]);
      res.redirect("/posts");
  } catch (error) {
      res.status(500).send("Error deleting post");
  }
});

// ------------------- ANALYTICS PART (Secured) ------------------- //
app.get("/ana", ensureAuthenticated, async (req, res) => {
  try {
      // 1. Today's Posts Count
      const [countRows] = await pool.execute('SELECT COUNT(*) as count FROM reviews WHERE DATE(created_at) = CURDATE()');
      const todaysCount = countRows[0].count;

      // 2. Average Rating (Today)
      const [avgRows] = await pool.execute('SELECT AVG(rating) as avg FROM reviews WHERE DATE(created_at) = CURDATE()');
      const averageRating = avgRows[0].avg ? Number(avgRows[0].avg).toFixed(2) : 0;

      // 3. Ratings Breakdown (Today)
      const [breakdownRows] = await pool.execute(`
          SELECT rating, COUNT(*) as count 
          FROM reviews 
          WHERE DATE(created_at) = CURDATE() 
          GROUP BY rating
      `);
      const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      breakdownRows.forEach(row => {
          ratingCounts[row.rating] = row.count;
      });

      // 4. Highest Rated Item (All Time)
      const [bestItemRows] = await pool.execute(`
          SELECT i.item_name, AVG(r.rating) as avg, COUNT(r.review_id) as count
          FROM reviews r
          JOIN items i ON r.item_id = i.item_id
          GROUP BY i.item_id
          ORDER BY avg DESC, count DESC
          LIMIT 1
      `);
      
      let bestItem = { name: "N/A", avg: 0, count: 0 };
      if (bestItemRows.length > 0) {
          bestItem = {
              name: bestItemRows[0].item_name,
              avg: Number(bestItemRows[0].avg),
              count: bestItemRows[0].count
          };
      }

      res.render("ana.ejs", { 
          todaysPosts: { length: todaysCount }, // EJS expects .length
          ratingCounts, 
          averageRating,
          bestItem 
      });
  } catch (error) {
      console.error("Analytics Error:", error);
      res.status(500).send("Error loading analytics");
  }
});


// CATCH-ALL ROUTE: Add a custom 404 handler here to catch any unhandled route
app.use((req, res) => {
    res.status(404).send("Error 404: The requested resource was not found.");
});

// Vercel requires the app object to be exported
module.exports = app;

// Keep app.listen() for local testing only
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`listening on port ${port}`);
    });
}