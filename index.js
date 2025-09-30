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

// 3. POST ROUTE TO UPLOAD TO VERCEL BLOB (Updated to handle itemName)
app.post("/posts", upload.single("image"), async (req, res) => {
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

  let newPost = {
    id,
    username,
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
app.get("/posts/:id", (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("singlepost.ejs", { post });
});

app.get("/posts/:id/edit", (req, res) => {
  let { id } = req.params;
  let post = posts.find((p) => id === p.id);
  res.render("edit.ejs", { post });
});

// PATCH ROUTE (Updated to handle itemName)
app.patch("/posts/:id", (req, res) => {
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

app.delete("/posts/:id", (req, res) => {
  let { id } = req.params;
  
  posts = posts.filter((p) => p.id !== id);
  res.redirect("/posts");
});

// ------------------- ANALYTICS PART ------------------- //
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
