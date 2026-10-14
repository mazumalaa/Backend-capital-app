// NOT FOUND MIDDLEWARE... 
async function notFoundMiddleware(req,res,next) {
     return res.status(404).json({
          code:`404`,
          status:"NOT FOUND",
          message:`Route ${req.originalUrl} not found`
     })
}

// EXPORTS...
module.exports = {notFoundMiddleware};