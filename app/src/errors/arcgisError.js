'use strict';

class ArcgisError extends Error{

    constructor(message){
        super(message);
        this.name = 'ArcgisError';
        this.message = message;
    }
}
module.exports = ArcgisError;
