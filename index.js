const express = require("express");
const app = express();
// Load environment variables from .env.local
require('dotenv').config({ path: './.env.local' }); 

let port = 3000;
const path = require("path");
const methodOverride = require("method-override");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
// const fetch = require('node-fetch'); // <--- REMOVED: Sync require is the source of the ERR_REQUIRE_ESM error

// Passport Authentication Imports
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 1. IMPORT VERCEL BLOB SDK
const { put, head } = require("@vercel/blob");

// --- PERSISTENCE CONFIGURATION ---
const POSTS_BLOB_PATH = 'posts.json';
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PERSISTENCE_ENABLED = !!BLOB_READ_WRITE_TOKEN;

// Dummy data structure placeholder - MUST be initialized synchronously
let posts = [];
let isDataLoaded = false; // Flag to track if the data has been loaded from Blob

// Function to get the initial dummy data set
function getDummyPosts() {
     return [
        {
            id: uuidv4(),
            authorId: 'ADMIN_SESSION_ID', 
            username: "tonystark",
            itemName: "Coffee", 
            content: "I found a fly in my poha",
            image: null,
            rating: 1,
            createdAt: new Date(Date.now() - 86400000), 
            updatedAt: new Date(Date.now() - 86400000),
        },
        {
            id: uuidv4(),
            authorId: 'FIXED_GOOGLE_USER_ID_12345', 
            username: "SteveRogers",
            itemName: "Upma", 
            content: "My Poha in the morning was so spicy ",
            image: null,
            rating: 3,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ];
}


// Function to load posts from Vercel Blob (Called inside routes now)
async function loadPosts() {
    // FIX: Dynamically import node-fetch here
    const { default: fetch } = await import('node-fetch');

    if (!PERSISTENCE_ENABLED) {
        // Return dummy data if persistence is off/failed
        console.warn("[Persistence] Blob token missing. Skipping load from remote storage.");
        return getDummyPosts();
    }
    
    try {
        const headResponse = await head(POSTS_BLOB_PATH, { token: BLOB_READ_WRITE_TOKEN });
        const blobUrl = headResponse.url;

        const response = await fetch(blobUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch posts. Status: ${response.status}`);
        }
        const data = await response.json();
        
        return data.map(post => ({
            ...post,
            createdAt: new Date(post.createdAt),
            updatedAt: new Date(post.updatedAt)
        }));

    } catch (error) {
        console.warn(`[Persistence] posts.json not found or failed to load. Using dummy data. Error: ${error.message}`);
        // If fetch fails, return initial dummy data
        return getDummyPosts();
    }
}

// Function to save posts to Vercel Blob
async function savePosts() {
    // FIX: Dynamically import fetch here (even though it's not used directly with Blob put/head, keeping it here for consistency if network is needed)
    const { default: fetch } = await import('node-fetch');
    
    if (!PERSISTENCE_ENABLED) {
        console.warn("[Persistence] Blob token missing. Skipping save to remote storage.");
        return;
    }
    try {
        const postsJson = JSON.stringify(posts);
        await put(POSTS_BLOB_PATH, postsJson, { 
            access: 'public', 
            contentType: 'application/json',
            token: BLOB_READ_WRITE_TOKEN
        });
    } catch (error) {
        console.error("[Persistence] Error saving posts to Blob:", error);
    }
}

// **SYNCHRONOUS INITIALIZATION**
posts = getDummyPosts(); // Initialize with dummy data immediately to avoid crashes


// --- PASSPORT SETUP ---
const users = [];

const ADMIN_USERNAME = "admin";
const DEPLOYED_URL = "https://cep-i2it.vercel.app";
const HOST = process.env.NODE_ENV === 'production' ? DEPLOYED_URL : "http://localhost:3000";

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${HOST}/auth/google/callback` 
  },
  function(accessToken, refreshToken, profile, cb) {
    let user = users.find(u => u.googleId === profile.id);
    if (!user) {
      user = { 
        id: profile.id, 
        googleId: profile.id,
        displayName: profile.displayName,
        username: profile.displayName.replace(/\s/g, '').toLowerCase() + '_google',
        isGoogle: true
      };
      users.push(user);
    }
    return cb(null, user);
  }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    if (id === ADMIN_USERNAME) { 
         return done(null, { 
            id: 'ADMIN_SESSION_ID', 
            username: ADMIN_USERNAME,
            isAdmin: true 
        });
    }
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

// Utility function to get the current user's ID/info
function getCurrentUser(req) {
    if (req.user && req.user.isAdmin) { 
        return req.user;
    }
    if (req.user && req.user.id) {
        return req.user;
    }
    return null; 
}

// Authentication Check Middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { 
        return next(); 
    }
    if (req.session.isAdmin) {
         req.user = { 
            id: 'ADMIN_SESSION_ID', 
            username: ADMIN_USERNAME,
            isAdmin: true 
        };
        return next();
    }
    res.redirect('/login');
}


// 2. CONFIGURE MULTER FOR IN-MEMORY STORAGE
const upload = multer({ storage: multer.memoryStorage() });

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
  // Asynchronously load data on the first request for the life of this serverless instance
  if (!isDataLoaded) {
      posts = await loadPosts();
      isDataLoaded = true;
  }

  const currentUser = getCurrentUser(req);
  
  const sortedPosts = posts.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      
      return dateB - dateA;
  });

  res.render("index.ejs", { 
      posts: sortedPosts,
      currentUser
  });
});

app.get("/posts/new", ensureAuthenticated, (req, res) => {
  res.render("new.ejs");
});

app.post("/posts", ensureAuthenticated, upload.single("image"), async (req, res) => {
  let { username, content, rating, itemName } = req.body; 
  let id = uuidv4();
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
  
  const currentUser = getCurrentUser(req);
  let postUsername = currentUser.isAdmin ? username : currentUser.displayName; 

  let newPost = {
    id,
    authorId: currentUser.id, 
    username: postUsername,
    itemName,
    content,
    image: imageUrl, 
    rating: Number(rating),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  posts.push(newPost);
  await savePosts(); // SAVE AFTER CREATING
  res.redirect("/posts");
});

app.get("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("singlepost.ejs", { post });
});

app.get("/posts/:id/edit", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  const currentUser = getCurrentUser(req);

  const isAuthor = currentUser && post.authorId && (currentUser.id === post.authorId);
  
  if (!isAuthor) {
    return res.status(403).send("Error 403: Forbidden - You can only edit your own posts.");
  }
  
  res.render("edit.ejs", { post });
});

app.patch("/posts/:id", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  let { content, rating, itemName } = req.body; 
  let post = posts.find((p) => id === p.id);
  const currentUser = getCurrentUser(req);

  const isAuthor = currentUser && post.authorId && (currentUser.id === post.authorId);

  if (!post || !isAuthor) {
    return res.status(403).send("Error 403: Forbidden - Cannot update this post.");
  }

  post.itemName = itemName; 
  post.content = content;
  post.rating = Number(rating);
  post.updatedAt = new Date(); 

  await savePosts(); // SAVE AFTER UPDATING
  res.redirect("/posts");
});

app.delete("/posts/:id", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  let postToDelete = posts.find((p) => id === p.id);
  const currentUser = getCurrentUser(req);

  const isAuthor = currentUser && postToDelete.authorId && (currentUser.id === postToDelete.authorId);

  if (!postToDelete || !isAuthor) {
    return res.status(403).send("Error 403: Forbidden - Cannot delete this post.");
  }
  
  posts = posts.filter((p) => p.id !== id);
  await savePosts(); // SAVE AFTER DELETING
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
  
  const itemRatings = {}; 

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

      if (avg > bestItem.avg && data.count > 0) {
          bestItem.name = name;
          bestItem.avg = avg;
          bestItem.count = data.count;
      }
  }

  res.render("ana.ejs", { 
      todaysPosts, 
      ratingCounts, 
      averageRating,
      bestItem 
  });
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
        console.log("listening on port 3000");
    });
}