const express = require("express");
const app = express();
let port = 3000;
const path = require("path");
const methodOverride = require("method-override");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Storage setup for Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // save in uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // unique name
  },
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const upload = multer({ storage: storage });

// Dummy data
let posts = [
  {
    id: uuidv4(),
    username: "sanskarkolte",
    content: "Poha was really good ",
    image: "demo.jpeg",
    rating: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: uuidv4(),
    username: "tonystark",
    content: "I found a fly in my poha",
    image: null,
    rating: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: uuidv4(),
    username: "SteveRogers",
    content: "My Poha in the morning was so spicy ",
    image: null,
    rating: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ------------------- LOGIN PART ------------------- //

// Dummy credentials (for demo)
const USERNAME = "admin";
const PASSWORD = "12345";

// Redirect root ("/") to login page
app.get("/", (req, res) => {
  res.redirect("/login");
});

// Show login form
app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null });
});

// Handle login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === USERNAME && password === PASSWORD) {
    res.redirect("/posts");
  } else {
    res.render("login.ejs", { error: "Invalid username or password" });
  }
});

// ------------------- POSTS PART ------------------- //

// Routes
app.get("/posts", (req, res) => {
  res.render("index.ejs", { posts });
});

app.get("/posts/new", (req, res) => {
  res.render("new.ejs");
});

// Create new post with image + rating + time
app.post("/posts", upload.single("image"), (req, res) => {
  let { username, content, rating } = req.body;
  let id = uuidv4();
  let image = req.file ? req.file.filename : null;

  let newPost = {
    id,
    username,
    content,
    image,
    rating: Number(rating),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  posts.push(newPost);
  res.redirect("/posts");
});

// Show single post
app.get("/posts/:id", (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("singlepost.ejs", { post });
});

// Edit post (content, rating, time)
app.get("/posts/:id/edit", (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("edit.ejs", { post });
});

app.patch("/posts/:id", (req, res) => {
  let { id } = req.params;
  let { content, rating } = req.body;
  let post = posts.find((p) => id === p.id);

  if (post) {
    post.content = content;
    post.rating = Number(rating);
    post.updatedAt = new Date(); // update time on edit
  }

  res.redirect("/posts");
});

// Delete post
app.delete("/posts/:id", (req, res) => {
  let { id } = req.params;
  posts = posts.filter((p) => p.id !== id);
  res.redirect("/posts");
});

// ------------------- ANALYTICS PART ------------------- //

app.get("/ana", (req, res) => {
  // Get today's date (without time)
  let today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter posts created today
  let todaysPosts = posts.filter((post) => {
    let postDate = new Date(post.createdAt);
    postDate.setHours(0, 0, 0, 0);
    return postDate.getTime() === today.getTime();
  });

  // Count ratings
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

  res.render("ana.ejs", { todaysPosts, ratingCounts, averageRating });
});

app.listen(port, () => {
  console.log("listening on port 3000");
});
