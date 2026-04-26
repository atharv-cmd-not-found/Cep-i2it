const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { ensureAuthenticated } = require('../middleware/auth');

router.get("/", ensureAuthenticated, async (req, res) => {
  try {
      const [countRows] = await pool.execute('SELECT COUNT(*) as count FROM reviews WHERE DATE(created_at) = CURDATE()');
      const todaysCount = countRows[0].count;

      const [avgRows] = await pool.execute('SELECT AVG(rating) as avg FROM reviews WHERE DATE(created_at) = CURDATE()');
      const averageRating = avgRows[0].avg ? Number(avgRows[0].avg).toFixed(2) : 0;

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
          todaysPosts: { length: todaysCount }, 
          ratingCounts, 
          averageRating,
          bestItem 
      });
  } catch (error) {
      console.error("Analytics Error:", error);
      res.status(500).send("Error loading analytics");
  }
});

module.exports = router;
