'use strict';

class NotFound extends Error{

    constructor(message){
        super(message);
        this.name = 'NotFound';
        this.message = message;
    }
}
module.exports = NotFound;
