const { ADMIN_USERNAME } = require('../config/constants');

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { 
        return next(); 
    }
    if (req.session.isAdmin) {
         req.user = { 
            user_id: 'ADMIN', 
            username: ADMIN_USERNAME,
            isAdmin: true 
        };
        return next();
    }
    res.redirect('/login');
}

module.exports = { ensureAuthenticated };
