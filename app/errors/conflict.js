// ERROR CUSTOM...
class Conflict extends Error {
     constructor(message) {
          super(message)
          this.status = 409;
     }
};

// EXPORTS...
module.exports = {Conflict};
