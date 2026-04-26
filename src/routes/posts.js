const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { ensureAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { put } = require("@vercel/blob");
const { v4: uuidv4 } = require("uuid");

const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

router.get("/", ensureAuthenticated, async (req, res) => { 
  try {
      const [rows] = await pool.execute(`
          SELECT r.*, u.username as author_username, u.display_name, i.item_name 
          FROM reviews r
          JOIN users u ON r.user_id = u.user_id
          JOIN items i ON r.item_id = i.item_id
          ORDER BY r.created_at DESC
      `);

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

router.get("/new", ensureAuthenticated, (req, res) => {
  res.render("new.ejs");
});

router.post("/", ensureAuthenticated, upload.single("image"), async (req, res) => {
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
      let [itemRows] = await pool.execute('SELECT item_id FROM items WHERE item_name = ?', [itemName]);
      let itemId;
      if (itemRows.length === 0) {
          const [result] = await pool.execute('INSERT INTO items (item_name) VALUES (?)', [itemName]);
          itemId = result.insertId;
      } else {
          itemId = itemRows[0].item_id;
      }

      const userId = req.user.user_id;
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

router.get("/:id", ensureAuthenticated, async (req, res) => {
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

router.get("/:id/edit", ensureAuthenticated, async (req, res) => {
  let { id } = req.params;
  try {
      const [rows] = await pool.execute('SELECT * FROM reviews WHERE review_id = ?', [id]);
      if (rows.length === 0) return res.status(404).send("Post not found");
      
      const post = rows[0];
      const isAuthor = req.user && (req.user.user_id === post.user_id || req.user.isAdmin);
      
      if (!isAuthor) {
          return res.status(403).send("Forbidden - You can only edit your own posts.");
      }

      const [itemRows] = await pool.execute('SELECT item_name FROM items WHERE item_id = ?', [post.item_id]);
      post.itemName = itemRows[0].item_name;
      post.id = post.review_id; 

      res.render("edit.ejs", { post });
  } catch (error) {
      res.status(500).send("Error");
  }
});

router.patch("/:id", ensureAuthenticated, async (req, res) => {
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

router.delete("/:id", ensureAuthenticated, async (req, res) => {
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

module.exports = router;
