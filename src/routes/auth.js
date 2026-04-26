const express = require('express');
const router = express.Router();
const passport = require('passport');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('../config/constants');

router.get("/login", (req, res) => {
  const error = req.session.authError;
  req.session.authError = null; 
  res.render("login.ejs", { error });
});

router.post("/login", (req, res) => {
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
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/posts');
  });

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/posts'); 
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/login');
    });
});

module.exports = router;
