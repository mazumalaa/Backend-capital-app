// ERROR CUSTOM...
class BadRequest extends Error{
     constructor(message) {
          super(message);
          this.status = 400;
     }
}

// EXPORTS...
module.exports = {BadRequest};
