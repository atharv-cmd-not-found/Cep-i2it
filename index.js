const express = require("express");
const app = express();
const path = require("path");
const methodOverride = require("method-override");
const session = require('express-session');
const passport = require('passport');

// Load environment variables from .env.local
// Load environment variables
require('dotenv').config(); // Load from .env if present
require('dotenv').config({ path: './.env.local' }); // Also try .env.local

const { DEPLOYED_URL } = require('./src/config/constants');
let port = process.env.PORT || 3000;

// Improved HOST detection for Vercel
const HOST = process.env.NODE_ENV === 'production' 
    ? DEPLOYED_URL 
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${port}`);

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
require('./src/config/passport')(passport, HOST);
app.use(passport.initialize());
app.use(passport.session());

// Routes
const authRoutes = require('./src/routes/auth');
const postRoutes = require('./src/routes/posts');
const analyticsRoutes = require('./src/routes/analytics');

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.use("/", authRoutes);
app.use("/posts", postRoutes);
app.use("/ana", analyticsRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err);
    res.status(500).send(`Internal Server Error: ${err.message || 'Unknown Error'}`);
});

// CATCH-ALL ROUTE
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