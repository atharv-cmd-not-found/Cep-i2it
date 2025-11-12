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
const DEPLOYED_URL = "https://cep-i2it.vercel.app";
const HOST = process.env.NODE_ENV === 'production' ? DEPLOYED_URL : "http://localhost:3000";

// --- PASSPORT SETUP ---
const users = [];

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${HOST}/auth/google/callback` 
  },
  function(accessToken, refreshToken, profile, cb) {
    let user = users.find(u => u.googleId === profile.id);
    if (!user) {
      user = { 
        id: uuidv4(),
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
    if (req.session.isAdmin) {
        // ADMIN is not considered a user for post ownership/modification
        return { 
            id: 'ADMIN_SESSION_ID', 
            username: ADMIN_USERNAME,
            isAdmin: true 
        };
    }
    if (req.user && req.user.id) {
        return req.user;
    }
    return null; 
}

// Authentication Check Middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated() || req.session.isAdmin) { 
        return next(); 
    }
    res.redirect('/login');
}


// 2. CONFIGURE MULTER FOR IN-MEMORY STORAGE
const upload = multer({ storage: multer.memoryStorage() });

// ------------------- DUMMY DATA ------------------- //
const ADMIN_USERNAME = "admin";

let posts = [
  
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
    authorId: 'STEVE_ROGERS_ID', 
    username: "SteveRogers",
    itemName: "Upma", 
    content: "My Poha in the morning was so spicy ",
    image: null,
    rating: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

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

app.get("/posts", ensureAuthenticated, (req, res) => {
  const currentUser = getCurrentUser(req);
  res.render("index.ejs", { 
      posts,
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
      });
      imageUrl = blob.url;
    } catch (error) {
      console.error("Vercel Blob Upload Error:", error);
    }
  }
  
  const currentUser = getCurrentUser(req);
  // Admin can post, but the post will be owned by their session ID
  let postUsername = req.session.isAdmin ? username : currentUser.displayName; 

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

  // Server-side Authorization check: ONLY AUTHOR CAN EDIT
  const isAuthor = currentUser && post.authorId && (currentUser.id === post.authorId);
  
  if (!isAuthor) {
    return res.status(403).send("Error 403: Forbidden - You can only edit your own posts.");
  }
  
  res.render("edit.ejs", { post });
});

// PATCH ROUTE (Update post)
app.patch("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let { content, rating, itemName } = req.body; 
  let post = posts.find((p) => id === p.id);
  const currentUser = getCurrentUser(req);

  // Server-side Authorization check: ONLY AUTHOR CAN UPDATE
  const isAuthor = currentUser && post.authorId && (currentUser.id === post.authorId);

  if (!post || !isAuthor) {
    return res.status(403).send("Error 403: Forbidden - Cannot update this post.");
  }

  post.itemName = itemName; 
  post.content = content;
  post.rating = Number(rating);
  post.updatedAt = new Date(); 

  res.redirect("/posts");
});

// DELETE ROUTE
app.delete("/posts/:id", ensureAuthenticated, (req, res) => {
  let { id } = req.params;
  let postToDelete = posts.find((p) => id === p.id);
  const currentUser = getCurrentUser(req);

  // Server-side Authorization check: ONLY AUTHOR CAN DELETE
  const isAuthor = currentUser && postToDelete.authorId && (currentUser.id === postToDelete.authorId);

  if (!postToDelete || !isAuthor) {
    return res.status(403).send("Error 403: Forbidden - Cannot delete this post.");
  }
  
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

app.listen(port, () => {
  console.log("listening on port 3000");
});