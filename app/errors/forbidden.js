// ERROR CUSTOM...
class Forbidden extends Error {
     constructor(message) {
          super(message)
          this.status = 403;
     }
};

// EXPORTS...
module.exports = {Forbidden};
