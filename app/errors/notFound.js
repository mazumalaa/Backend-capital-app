// ERROR CUSTOM...
class NotFound extends Error {
     constructor(message) {
          super(message)
          this.status = 404;
     }
};

// EXPORTS...
module.exports = {NotFound};
