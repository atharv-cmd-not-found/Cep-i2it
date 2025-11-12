const express = require("express");
const app = express();
// Load environment variables from .env.local
require('dotenv').config({ path: './.env.local' }); 

let port = 3000;
const path = require("path");
const methodOverride = require("method-override");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Passport Authentication Imports
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 1. IMPORT VERCEL BLOB SDK
const { put } = require("@vercel/blob");

// --- NEW: Dynamic Host Configuration ---
// Use the Vercel URL when deployed (it's automatically set in the Vercel environment)
// Default to localhost for local development
const CALLBACK_HOST = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
// Since you provided the full URL, we'll use a direct conditional check for the deployment environment
// If the app is deployed, we'll use the provided Vercel URL. Otherwise, localhost.
const DEPLOYED_URL = "https://cep-i2it.vercel.app";
const HOST = process.env.NODE_ENV === 'production' ? DEPLOYED_URL : "http://localhost:3000";

// --- PASSPORT SETUP ---

// Use a simple, dummy data store for users logged in via Google 
// (In a real app, this would be a database)
const users = [];

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // FIX: Using the dynamic HOST URL for callback
    callbackURL: `${HOST}/auth/google/callback` 
  },
  function(accessToken, refreshToken, profile, cb) {
    // Check if the user already exists in our dummy 'database'
    let user = users.find(u => u.googleId === profile.id);
    if (!user) {
      // Create a new user if they don't exist
      user = { 
        id: uuidv4(), // Use our own ID structure
        googleId: profile.id,
        displayName: profile.displayName,
        username: profile.displayName.replace(/\s/g, '').toLowerCase() + '_google', // Generate a unique username
        isGoogle: true
      };
      users.push(user);
    }
    return cb(null, user);
  }
));

// Serialize user into the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user);
});


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Configure Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Authentication Check Middleware
function ensureAuthenticated(req, res, next) {
    // Checks for a logged-in user either from Google or our mock admin
    if (req.isAuthenticated() || req.session.isAdmin) { 
        return next(); 
    }
    res.redirect('/login');
}


// 2. CONFIGURE MULTER FOR IN-MEMORY STORAGE
const upload = multer({ storage: multer.memoryStorage() });

// Dummy data (Updated to include itemName)
let posts = [
  
  {
    id: uuidv4(),
    username: "tonystark",
    // ADDED: itemName
    itemName: "Coffee", 
    content: "I found a fly in my poha",
    image: null,
    rating: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: uuidv4(),
    username: "SteveRogers",
    // ADDED: itemName
    itemName: "Upma", 
    content: "My Poha in the morning was so spicy ",
    image: null,
    rating: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ------------------- LOGIN PART ------------------- //
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "12345";

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  // Pass the error message from the session if it exists
  const error = req.session.authError;
  req.session.authError = null; // Clear the error
  res.render("login.ejs", { error });
});

// Original Admin Login POST route
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Set a session variable to mark the admin login
    req.session.isAdmin = true; 
    res.redirect("/posts");
  } else {
    // Set a session variable for the error
    req.session.authError = "Invalid username or password";
    res.redirect("/login");
  }
});

// --- NEW GOOGLE AUTH ROUTES ---

// Route to initiate Google OAuth
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google Callback route
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect to home page.
    res.redirect('/posts');
  });

// Logout route
app.get('/logout', (req, res) => {
    // Clear the session variables
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/posts'); // Fallback in case of error
        }
        // Clear the cookie and redirect to login
        res.clearCookie('connect.sid'); 
        res.redirect('/login');
    });
});
// ------------------- POSTS PART (Secured with ensureAuthenticated) ------------------- //

// Routes
// Apply the authentication check to all protected routes
app.get("/posts", ensureAuthenticated, (req, res) => {
  res.render("index.ejs", { posts });
});

app.get("/posts/new", ensureAuthenticated, (req, res) => {
  res.render("new.ejs");
});

// 3. POST ROUTE TO UPLOAD TO VERCEL BLOB (Updated to handle itemName)
app.post("/posts", ensureAuthenticated, upload.single("image"), async (req, res) => {
  // EXTRACTED: itemName from req.body
  let { username, content, rating, itemName } = req.body; 
  let id = uuidv4();
  let imageUrl = null; 

  if (req.file) {
    // 4. UPLOAD LOGIC
    try {
      const blob = await put(`posts/${uuidv4()}-${req.file.originalname}`, req.file.buffer, {
        access: 'public', 
        contentType: req.file.mimetype,
      });
      imageUrl = blob.url;
    } catch (error) {
      console.error("Vercel Blob Upload Error:", error);
    }
  }
  
  // NOTE: If logged in via Google, we might use their display name
  let postUsername = req.session.isAdmin ? username : req.user.displayName; 

  let newPost = {
    id,
    username: postUsername,
    // STORED: itemName
    itemName,
    content,
    image: imageUrl, 
    rating: Number(rating),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  posts.push(newPost);
  res.redirect("/posts");
});

// Show single post
app.get("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("singlepost.ejs", { post });
});

app.get("/posts/:id/edit", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("edit.ejs", { post });
});

// PATCH ROUTE (Updated to handle itemName)
app.patch("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  // EXTRACTED: itemName from req.body
  let { content, rating, itemName } = req.body; 
  let post = posts.find((p) => id === p.id);

  if (post) {
    // UPDATED: itemName
    post.itemName = itemName; 
    post.content = content;
    post.rating = Number(rating);
    post.updatedAt = new Date(); // update time on edit
  }

  res.redirect("/posts");
});

app.delete("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  
  posts = posts.filter((p) => p.id !== id);
  res.redirect("/posts");
});

// ------------------- ANALYTICS PART (Secured) ------------------- //
app.get("/ana", ensureAuthenticated, (req, res) => {
  let today = new Date();
  today.setHours(0, 0, 0, 0);

  let todaysPosts = posts.filter((post) => {
    let postDate = new Date(post.createdAt);
    postDate.setHours(0, 0, 0, 0);
    return postDate.getTime() === today.getTime();
  });

  let ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;

  // --- EXISTING LOGIC FOR DAILY AVERAGE ---
  todaysPosts.forEach((post) => {
    if (post.rating) {
      ratingCounts[post.rating] = (ratingCounts[post.rating] || 0) + 1;
      totalRating += post.rating;
    }
  });

  let averageRating =
    todaysPosts.length > 0
      ? (totalRating / todaysPosts.length).toFixed(2)
      : 0;
  // --- END EXISTING LOGIC ---
  
  // --- NEW LOGIC: FIND HIGHEST REVIEWED ITEM (across ALL posts) ---
  const itemRatings = {}; // { itemName: { sum: 0, count: 0 } }

  posts.forEach(post => {
      const name = post.itemName || 'Unknown Item';
      const rating = post.rating || 0;

      if (!itemRatings[name]) {
          itemRatings[name] = { sum: 0, count: 0 };
      }

      itemRatings[name].sum += rating;
      itemRatings[name].count += 1;
  });

  let bestItem = { name: "N/A", avg: 0, count: 0 };

  for (const name in itemRatings) {
      const data = itemRatings[name];
      const avg = data.sum / data.count;

      // Check if this item is better than the current best, 
      // and ensure it has at least one rating (count > 0)
      if (avg > bestItem.avg && data.count > 0) {
          bestItem.name = name;
          bestItem.avg = avg;
          bestItem.count = data.count;
      }
  }
  // --- END NEW LOGIC ---

  res.render("ana.ejs", { 
      todaysPosts, 
      ratingCounts, 
      averageRating,
      bestItem // Passed the calculated best item to the EJS template
  });
});


// CATCH-ALL ROUTE: Add a custom 404 handler here to catch any unhandled route
app.use((req, res) => {
    res.status(404).send("Error 404: The requested resource was not found.");
});

app.listen(port, () => {
  console.log("listening on port 3000");
});