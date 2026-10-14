// IMPORTS...
const router = require("express").Router();

router.get('/', (_, res) => {
     res.status(200).json({
          status: "OK",
          code: "200",
          message: "WELCOME TO CAPITAL"
     });
});

// EXPORTS...
module.exports = router;