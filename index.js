const express = require("express");
const app = express();
let port = 3000;
const path = require("path");
const methodOverride = require("method-override");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// 1. IMPORT VERCEL BLOB SDK
const { put } = require("@vercel/blob");

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// 2. CONFIGURE MULTER FOR IN-MEMORY STORAGE
// Multer is now configured to store the file in memory (RAM) as a Buffer,
// which is required before sending it to Vercel Blob.
const upload = multer({ storage: multer.memoryStorage() });

// REMOVE: The disk storage setup is no longer needed:
/*
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // save in uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // unique name
  },
});
*/

// REMOVE: The static route for local uploads is no longer needed:
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// The files will be accessed via a public Vercel Blob URL.


// Dummy data (Initial posts will now need to have Vercel Blob URLs for images)
let posts = [
  {
    id: uuidv4(),
    username: "sanskarkolte",
    // NOTE: This image should be a full Vercel Blob URL in a real app
    image: "https://<your-store-id>.public.blob.vercel-storage.com/demo.jpeg", 
    content: "Poha was really good ",
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
// ... (Login part remains unchanged)
const USERNAME = "admin";
const PASSWORD = "12345";

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null });
});

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

// 3. UPDATE POST ROUTE TO UPLOAD TO VERCEL BLOB
app.post("/posts", upload.single("image"), async (req, res) => {
  let { username, content, rating } = req.body;
  let id = uuidv4();
  let imageUrl = null; // Will store the Vercel Blob URL

  if (req.file) {
    // 4. UPLOAD LOGIC
    try {
      // Use put() to upload the file buffer to Vercel Blob
      // The path will be unique: 'posts/<UUID>-<original-filename>'
      const blob = await put(`posts/${uuidv4()}-${req.file.originalname}`, req.file.buffer, {
        access: 'public', // Make the file publicly accessible via URL
        contentType: req.file.mimetype,
      });
      // The returned 'blob' object contains the URL
      imageUrl = blob.url;
    } catch (error) {
      console.error("Vercel Blob Upload Error:", error);
      // Decide how to handle the error (e.g., continue without image or send an error response)
      // For now, we'll log and proceed with imageUrl = null
    }
  }

  let newPost = {
    id,
    username,
    content,
    // Use the returned Vercel Blob URL
    image: imageUrl, 
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

// ... (Edit and Delete routes remain unchanged, though you may want to delete the blob in a real app)

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

app.delete("/posts/:id", (req, res) => {
  let { id } = req.params;
  // In a production app, you would also call Vercel Blob SDK's `del` function here
  // to remove the file from storage: 
  // const postToDelete = posts.find((p) => p.id === id);
  // if (postToDelete && postToDelete.image) { await del(postToDelete.image); }
  
  posts = posts.filter((p) => p.id !== id);
  res.redirect("/posts");
});

// ------------------- ANALYTICS PART ------------------- //
// ... (Analytics part remains unchanged)
app.get("/ana", (req, res) => {
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

  res.render("ana.ejs", { todaysPosts, ratingCounts, averageRating });
});

app.listen(port, () => {
  console.log("listening on port 3000");
});