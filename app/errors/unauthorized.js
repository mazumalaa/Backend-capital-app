// ERROR CUSTOM...
class Unauthorized  extends Error{
     constructor(message) {
          super(message);
          this.status = 401;
     }
}

// EXPORTS...
module.exports = {Unauthorized};
